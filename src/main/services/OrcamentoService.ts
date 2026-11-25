import { ErroAplicacao } from '../../shared/errors';
import { dataCivilClinica } from '../../shared/datas';
import type {
  DadosAtualizacaoOrcamento,
  DadosInativacao,
  DadosOrcamento,
  DadosStatusOrcamento,
  ItemOrcamento,
  Orcamento,
  Usuario,
} from '../../shared/types';
import {
  ehDadosAtualizacaoOrcamento,
  ehDadosInativacao,
  ehDadosOrcamento,
  ehDadosStatusOrcamento,
  exigir,
} from '../../shared/validators';
import type {
  DadosAtualizacaoOrcamentoBanco,
  DadosCriacaoOrcamentoBanco,
  ItemOrcamentoBanco,
  OrcamentoPersistido,
  OrcamentoRepositorio,
} from '../repositories/OrcamentoRepository';
import { exigirEdicaoComercial, exigirLeituraFase2 } from './permissoesFase2';
import { arredondar2 } from './valoresFase2';

interface DadosNormalizados {
  clienteId: number;
  petId: number | null;
  validade: string;
  desconto: number;
  observacoes: string | null;
  itens: ItemOrcamentoBanco[];
}

function paraItem(item: OrcamentoPersistido['itens'][number]): ItemOrcamento {
  return {
    id: item.id,
    orcamentoId: item.orcamentoId,
    tipo: item.tipo,
    produtoId: item.produtoId,
    tabelaPrecoId: item.tabelaPrecoId,
    descricao: item.descricao,
    quantidade: item.quantidade,
    precoUnitario: item.precoUnitario.toNumber(),
    subtotal: item.subtotal.toNumber(),
  };
}

function paraOrcamento(registro: OrcamentoPersistido): Orcamento {
  const itens = registro.itens.map(paraItem);
  const totalItens = arredondar2(itens.reduce((total, item) => total + item.subtotal, 0));
  return {
    id: registro.id,
    numero: registro.numero,
    clienteId: registro.clienteId,
    clienteNome: registro.clienteNome,
    petId: registro.petId,
    petNome: registro.petNome,
    status: registro.status,
    validade: registro.validade.toISOString().slice(0, 10),
    desconto: registro.desconto.toNumber(),
    observacoes: registro.observacoes,
    total: arredondar2(totalItens - registro.desconto.toNumber()),
    itens,
    canceladoEm: registro.canceladoEm === null ? null : registro.canceladoEm.toISOString(),
    motivoCancelamento: registro.motivoCancelamento,
    criadoEm: registro.criadoEm.toISOString(),
  };
}

function textoOpcional(valor: string | null | undefined): string | null {
  if (valor === undefined || valor === null) return null;
  const limpo = valor.trim();
  return limpo === '' ? null : limpo;
}

export class OrcamentoService {
  constructor(
    private readonly repo: OrcamentoRepositorio,
    private readonly agora: () => Date = () => new Date()
  ) {}

  async listar(usuario: Usuario): Promise<Orcamento[]> {
    exigirLeituraFase2(usuario, 'orçamentos');
    const registros = await this.repo.listar();
    return registros.map(paraOrcamento);
  }

  async criar(dados: DadosOrcamento, usuario: Usuario): Promise<Orcamento> {
    exigirEdicaoComercial(usuario, 'orçamentos');
    const validos = exigir(
      dados,
      ehDadosOrcamento,
      'Dados do orçamento inválidos. Confira cliente, validade e itens.'
    );
    const normalizados = await this.validarDados(validos);
    const registro = await this.repo.criar({
      mes: dataCivilClinica(this.agora()).slice(0, 7),
      clienteId: normalizados.clienteId,
      petId: normalizados.petId,
      validade: normalizados.validade,
      desconto: normalizados.desconto,
      observacoes: normalizados.observacoes,
      itens: normalizados.itens,
      criadoPorId: usuario.id,
    } satisfies DadosCriacaoOrcamentoBanco);
    return paraOrcamento(registro);
  }

  async atualizar(dados: DadosAtualizacaoOrcamento, usuario: Usuario): Promise<Orcamento> {
    exigirEdicaoComercial(usuario, 'orçamentos');
    const validos = exigir(
      dados,
      ehDadosAtualizacaoOrcamento,
      'Dados do orçamento inválidos. Confira cliente, validade e itens.'
    );
    const anterior = await this.repo.buscarPorId(validos.id);
    if (anterior === null) {
      throw new ErroAplicacao('Orçamento não encontrado. Confira o orçamento selecionado.');
    }
    if (anterior.status === 'CANCELADO') {
      throw new ErroAplicacao('Não é possível editar um orçamento cancelado.');
    }
    const normalizados = await this.validarDados(validos);
    const registro = await this.repo.atualizar({
      id: validos.id,
      clienteId: normalizados.clienteId,
      petId: normalizados.petId,
      validade: normalizados.validade,
      desconto: normalizados.desconto,
      observacoes: normalizados.observacoes,
      itens: normalizados.itens,
    } satisfies DadosAtualizacaoOrcamentoBanco);
    return paraOrcamento(registro);
  }

  async definirStatus(dados: DadosStatusOrcamento, usuario: Usuario): Promise<Orcamento> {
    exigirEdicaoComercial(usuario, 'orçamentos');
    const validos = exigir(
      dados,
      ehDadosStatusOrcamento,
      'Informe o orçamento e um status válido (APROVADO ou REPROVADO).'
    );
    if (validos.status !== 'APROVADO' && validos.status !== 'REPROVADO') {
      throw new ErroAplicacao('Use a aprovação ou a reprovação para alterar o status do orçamento.');
    }
    const anterior = await this.repo.buscarPorId(validos.id);
    if (anterior === null) {
      throw new ErroAplicacao('Orçamento não encontrado. Confira o orçamento selecionado.');
    }
    if (anterior.status === 'CANCELADO') {
      throw new ErroAplicacao('Não é possível alterar o status de um orçamento cancelado.');
    }
    if (anterior.status !== 'PENDENTE') {
      throw new ErroAplicacao(
        'Só é possível aprovar ou reprovar orçamentos pendentes. Este orçamento já foi decidido.'
      );
    }
    const atualizado = await this.repo.definirStatus(validos.id, validos.status);
    if (atualizado === null) {
      throw new ErroAplicacao(
        'O orçamento não está mais pendente. Atualize a lista e tente novamente.'
      );
    }
    return paraOrcamento(atualizado);
  }

  async cancelar(dados: DadosInativacao, usuario: Usuario): Promise<Orcamento> {
    exigirEdicaoComercial(usuario, 'orçamentos');
    const validos = exigir(
      dados,
      ehDadosInativacao,
      'Informe o orçamento e o motivo do cancelamento (de 3 a 500 caracteres).'
    );
    const anterior = await this.repo.buscarPorId(validos.id);
    if (anterior === null) {
      throw new ErroAplicacao('Orçamento não encontrado. Confira o orçamento selecionado.');
    }
    if (anterior.status === 'CANCELADO') {
      throw new ErroAplicacao('Este orçamento já está cancelado.');
    }
    const atualizado = await this.repo.cancelar(
      validos.id,
      usuario.id,
      this.agora(),
      validos.motivo
    );
    if (atualizado === null) {
      throw new ErroAplicacao('Não foi possível cancelar o orçamento. Tente novamente.');
    }
    return paraOrcamento(atualizado);
  }

  /** Recalcula subtotais e total no backend, ignorando qualquer valor vindo da UI. */
  private async validarDados(dados: DadosOrcamento): Promise<DadosNormalizados> {
    if (!(await this.repo.clienteExiste(dados.clienteId))) {
      throw new ErroAplicacao('Cliente não encontrado ou inativado. Confira o cliente do orçamento.');
    }
    if (
      dados.petId !== null &&
      !(await this.repo.petExiste(dados.petId, dados.clienteId))
    ) {
      throw new ErroAplicacao('Pet não encontrado para este cliente. Confira a seleção.');
    }

    const itens: ItemOrcamentoBanco[] = [];
    let totalItens = 0;
    for (const item of dados.itens) {
      if (item.tipo === 'PRODUTO' && !(await this.repo.produtoAtivoExiste(item.produtoId as number))) {
        throw new ErroAplicacao('Produto de um item não encontrado ou inativado.');
      }
      if (
        item.tipo === 'SERVICO' &&
        !(await this.repo.tabelaPrecoAtivaExiste(item.tabelaPrecoId as number))
      ) {
        throw new ErroAplicacao('Serviço de um item não encontrado ou inativado.');
      }
      const subtotal = arredondar2(item.quantidade * item.precoUnitario);
      totalItens = arredondar2(totalItens + subtotal);
      itens.push({
        tipo: item.tipo,
        produtoId: item.produtoId,
        tabelaPrecoId: item.tabelaPrecoId,
        descricao: item.descricao.trim(),
        quantidade: item.quantidade,
        precoUnitario: item.precoUnitario,
        subtotal,
      });
    }

    if (dados.desconto > totalItens) {
      throw new ErroAplicacao('O desconto não pode ser maior que o total dos itens.');
    }
    return {
      clienteId: dados.clienteId,
      petId: dados.petId,
      validade: dados.validade,
      desconto: dados.desconto,
      observacoes: textoOpcional(dados.observacoes),
      itens,
    };
  }
}
