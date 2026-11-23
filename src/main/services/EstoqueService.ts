import { ESTOQUE_ALERTA_PADRAO } from '../../shared/constants';
import { dataCivilClinica } from '../../shared/datas';
import { ErroAplicacao } from '../../shared/errors';
import type {
  DadosAtualizacaoLote,
  DadosAtualizacaoProduto,
  DadosInativacao,
  DadosLote,
  DadosProduto,
  Lote,
  Produto,
  Role,
  Usuario,
} from '../../shared/types';
import type {
  EstoqueRepositorio,
  LotePersistido,
  ProdutoPersistido,
} from '../repositories/EstoqueRepository';
import { descreverAlteracaoPreco, HistoricoPrecoService } from './HistoricoPrecoService';

const PERFIS_LEITURA: readonly Role[] = ['ADMIN', 'VETERINARIO', 'ATENDENTE'];

function exigirLeitura(usuario: Usuario): void {
  if (!PERFIS_LEITURA.includes(usuario.role)) {
    throw new ErroAplicacao('Perfil de acesso inválido para consultar o estoque. Procure o administrador.');
  }
}

function exigirAdmin(usuario: Usuario): void {
  if (usuario.role !== 'ADMIN') {
    throw new ErroAplicacao('Somente administradores podem cadastrar produtos e lotes.');
  }
}

function dataOpcional(valor: Date | null): string | null {
  return valor === null ? null : valor.toISOString();
}

function paraLote(lote: LotePersistido): Lote {
  const dados: Lote = {
    id: lote.id,
    codigo: lote.codigo,
    validade: lote.validade.toISOString().slice(0, 10),
    quantidade: lote.quantidade,
    produtoId: lote.produtoId,
    ativo: lote.ativo,
    baixadoEm: dataOpcional(lote.baixadoEm),
    motivoBaixa: lote.motivoBaixa,
    criadoEm: lote.criadoEm.toISOString(),
    atualizadoEm: lote.atualizadoEm.toISOString(),
  };
  if (lote.produto === undefined) return dados;

  return {
    ...dados,
    produto: {
      id: lote.produto.id,
      nome: lote.produto.nome,
      categoria: lote.produto.categoria,
    },
  };
}

function paraProduto(produto: ProdutoPersistido): Produto {
  return {
    id: produto.id,
    nome: produto.nome,
    categoria: produto.categoria,
    estoqueMinimo: produto.estoqueMinimo,
    alertaEstoque: produto.alertaEstoque,
    precoBrl: produto.precoBrl.toNumber(),
    ativo: produto.ativo,
    inativadoEm: dataOpcional(produto.inativadoEm),
    motivoInativacao: produto.motivoInativacao,
    lotes: produto.lotes.map(paraLote),
  };
}

export class EstoqueService {
  constructor(
    private readonly repo: EstoqueRepositorio,
    private readonly historicoPreco: HistoricoPrecoService,
    private readonly agora: () => Date = () => new Date()
  ) {}

  async listarProdutos(usuario: Usuario): Promise<Produto[]> {
    exigirLeitura(usuario);
    const produtos = await this.repo.listarProdutos();
    return produtos.map(paraProduto);
  }

  async listarLotes(usuario: Usuario): Promise<Lote[]> {
    exigirLeitura(usuario);
    const lotes = await this.repo.listarLotes();
    return lotes.map(paraLote);
  }

  async criarProduto(dados: DadosProduto, usuario: Usuario): Promise<Produto> {
    exigirAdmin(usuario);
    const produto = await this.repo.criarProduto({
      nome: dados.nome.trim(),
      categoria: dados.categoria.trim(),
      estoqueMinimo: dados.estoqueMinimo,
      // Cliente antigo pode não enviar a flag; o padrão do domínio é alerta ligado.
      alertaEstoque: dados.alertaEstoque ?? ESTOQUE_ALERTA_PADRAO,
      precoBrl: dados.precoBrl,
    });
    return paraProduto(produto);
  }

  async atualizarProduto(dados: DadosAtualizacaoProduto, usuario: Usuario): Promise<Produto> {
    exigirAdmin(usuario);
    const anterior = await this.repo.buscarProdutoPorId(dados.id);
    if (anterior === null) {
      throw new ErroAplicacao('Produto não encontrado. Confira o produto selecionado.');
    }
    if (!anterior.ativo) {
      throw new ErroAplicacao('Não é possível editar um produto inativado.');
    }
    const precoAnterior = anterior.precoBrl.toNumber();
    const produto = await this.repo.atualizarProduto({
      ...dados,
      alertaEstoque: dados.alertaEstoque ?? ESTOQUE_ALERTA_PADRAO,
    });

    if (precoAnterior !== dados.precoBrl) {
      await this.historicoPreco.registrar({
        origem: 'PRODUTO',
        origemId: dados.id,
        anterior: precoAnterior,
        novo: dados.precoBrl,
        responsavelId: usuario.id,
        motivo: descreverAlteracaoPreco(
          'PRODUTO',
          `"${anterior.nome}" (ID ${anterior.id})`,
          precoAnterior,
          dados.precoBrl
        ),
        criadoEm: this.agora(),
      });
    }
    return paraProduto(produto);
  }

  async inativarProduto(dados: DadosInativacao, usuario: Usuario): Promise<Produto> {
    exigirAdmin(usuario);
    const anterior = await this.repo.buscarProdutoPorId(dados.id);
    if (anterior === null) {
      throw new ErroAplicacao('Produto não encontrado. Confira o produto selecionado.');
    }
    if (!anterior.ativo) {
      throw new ErroAplicacao('Este produto já está inativado.');
    }
    if ((await this.repo.contarLotesAtivos(dados.id)) > 0) {
      throw new ErroAplicacao(
        'Não é possível inativar este produto enquanto houver lotes ativos. Baixe os lotes antes de continuar.'
      );
    }
    const atualizado = await this.repo.inativarProduto(
      dados.id,
      usuario.id,
      this.agora(),
      dados.motivo
    );
    if (atualizado === null) {
      throw new ErroAplicacao('Não foi possível inativar o produto. Tente novamente.');
    }
    return paraProduto(atualizado);
  }

  async criarLote(dados: DadosLote, usuario: Usuario): Promise<Lote> {
    exigirAdmin(usuario);
    await this.validarProdutoECodigo(dados.produtoId, dados.codigo);

    const lote = await this.repo.criarLote({
      produtoId: dados.produtoId,
      codigo: dados.codigo.trim(),
      validade: dados.validade,
      quantidade: dados.quantidade,
    });
    return paraLote(lote);
  }

  async atualizarLote(dados: DadosAtualizacaoLote, usuario: Usuario): Promise<Lote> {
    exigirAdmin(usuario);
    const anterior = await this.repo.buscarLotePorId(dados.id);
    if (anterior === null) {
      throw new ErroAplicacao('Lote não encontrado. Confira o lote selecionado.');
    }
    if (!anterior.ativo) {
      throw new ErroAplicacao('Não é possível editar um lote baixado.');
    }
    await this.validarProdutoECodigo(dados.produtoId, dados.codigo, dados.id);
    if (dados.validade < dataCivilClinica(this.agora())) {
      throw new ErroAplicacao('A validade do lote não pode ser anterior à data atual.');
    }
    if (!Number.isInteger(dados.quantidade) || dados.quantidade <= 0) {
      throw new ErroAplicacao('A quantidade do lote deve ser um número inteiro maior que zero.');
    }

    const lote = await this.repo.atualizarLote({
      id: dados.id,
      produtoId: dados.produtoId,
      codigo: dados.codigo.trim(),
      validade: dados.validade,
      quantidade: dados.quantidade,
    });
    return paraLote(lote);
  }

  async baixarLote(dados: DadosInativacao, usuario: Usuario): Promise<Lote> {
    exigirAdmin(usuario);
    const anterior = await this.repo.buscarLotePorId(dados.id);
    if (anterior === null) {
      throw new ErroAplicacao('Lote não encontrado. Confira o lote selecionado.');
    }
    if (!anterior.ativo) {
      throw new ErroAplicacao('Este lote já foi baixado.');
    }
    const atualizado = await this.repo.baixarLote(
      dados.id,
      usuario.id,
      this.agora(),
      dados.motivo
    );
    if (atualizado === null) {
      throw new ErroAplicacao('Não foi possível baixar o lote. Tente novamente.');
    }
    return paraLote(atualizado);
  }

  private async validarProdutoECodigo(
    produtoId: number,
    codigo: string,
    ignorarLoteId?: number
  ): Promise<void> {
    const produto = await this.repo.buscarProdutoPorId(produtoId);
    if (produto === null) {
      throw new ErroAplicacao('Produto não encontrado. Confira o produto selecionado.');
    }
    if (!produto.ativo) {
      throw new ErroAplicacao('Não é possível vincular o lote a um produto inativado.');
    }
    if (await this.repo.loteComCodigoExiste(codigo.trim(), ignorarLoteId)) {
      throw new ErroAplicacao('Já existe um lote com este código. Informe um código diferente.');
    }
  }
}
