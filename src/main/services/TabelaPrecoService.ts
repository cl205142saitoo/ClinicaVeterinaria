import { ErroAplicacao } from '../../shared/errors';
import type {
  DadosAtualizacaoTabelaPreco,
  DadosInativacao,
  DadosTabelaPreco,
  TabelaPreco,
  Usuario,
} from '../../shared/types';
import {
  ehDadosAtualizacaoTabelaPreco,
  ehDadosInativacao,
  ehDadosTabelaPreco,
  exigir,
} from '../../shared/validators';
import type {
  TabelaPrecoPersistido,
  TabelaPrecoRepositorio,
} from '../repositories/TabelaPrecoRepository';
import { descreverAlteracaoPreco, HistoricoPrecoService } from './HistoricoPrecoService';
import { exigirEdicaoPrecos, exigirLeituraFase2 } from './permissoesFase2';

function paraTabelaPreco(registro: TabelaPrecoPersistido): TabelaPreco {
  return {
    id: registro.id,
    codigo: registro.codigo,
    descricao: registro.descricao,
    categoria: registro.categoria,
    preco: registro.preco.toNumber(),
    ativo: registro.ativo,
    inativadoEm: registro.inativadoEm === null ? null : registro.inativadoEm.toISOString(),
    motivoInativacao: registro.motivoInativacao,
  };
}

export class TabelaPrecoService {
  constructor(
    private readonly repo: TabelaPrecoRepositorio,
    private readonly historico: HistoricoPrecoService,
    private readonly agora: () => Date = () => new Date()
  ) {}

  async listar(usuario: Usuario): Promise<TabelaPreco[]> {
    exigirLeituraFase2(usuario, 'tabelas de preço');
    const registros = await this.repo.listar();
    return registros.map(paraTabelaPreco);
  }

  async criar(dados: DadosTabelaPreco, usuario: Usuario): Promise<TabelaPreco> {
    exigirEdicaoPrecos(usuario);
    const validos = exigir(
      dados,
      ehDadosTabelaPreco,
      'Dados da tabela de preço inválidos. Confira código, descrição, categoria e preço.'
    );
    const codigo = validos.codigo.trim();
    if (await this.repo.codigoExiste(codigo)) {
      throw new ErroAplicacao('Já existe uma tabela de preço com este código. Use outro código.');
    }
    const registro = await this.repo.criar({
      codigo,
      descricao: validos.descricao.trim(),
      categoria: validos.categoria.trim(),
      preco: validos.preco,
    });
    return paraTabelaPreco(registro);
  }

  async atualizar(dados: DadosAtualizacaoTabelaPreco, usuario: Usuario): Promise<TabelaPreco> {
    exigirEdicaoPrecos(usuario);
    const validos = exigir(
      dados,
      ehDadosAtualizacaoTabelaPreco,
      'Dados da tabela de preço inválidos. Confira código, descrição, categoria e preço.'
    );
    const anterior = await this.repo.buscarPorId(validos.id);
    if (anterior === null) {
      throw new ErroAplicacao('Tabela de preço não encontrada. Confira a tabela selecionada.');
    }
    if (!anterior.ativo) {
      throw new ErroAplicacao('Não é possível editar uma tabela de preço inativada.');
    }
    const codigo = validos.codigo.trim();
    if (await this.repo.codigoExiste(codigo, validos.id)) {
      throw new ErroAplicacao('Já existe outra tabela de preço com este código. Use outro código.');
    }

    const precoAnterior = anterior.preco.toNumber();
    const registro = await this.repo.atualizar({
      id: validos.id,
      codigo,
      descricao: validos.descricao.trim(),
      categoria: validos.categoria.trim(),
      preco: validos.preco,
    });

    if (precoAnterior !== validos.preco) {
      await this.historico.registrar({
        origem: 'TABELA_PRECO',
        origemId: validos.id,
        anterior: precoAnterior,
        novo: validos.preco,
        responsavelId: usuario.id,
        motivo: descreverAlteracaoPreco('TABELA_PRECO', codigo, precoAnterior, validos.preco),
        criadoEm: this.agora(),
      });
    }
    return paraTabelaPreco(registro);
  }

  async inativar(dados: DadosInativacao, usuario: Usuario): Promise<TabelaPreco> {
    exigirEdicaoPrecos(usuario);
    const validos = exigir(
      dados,
      ehDadosInativacao,
      'Informe a tabela de preço e o motivo da inativação (de 3 a 500 caracteres).'
    );
    const anterior = await this.repo.buscarPorId(validos.id);
    if (anterior === null) {
      throw new ErroAplicacao('Tabela de preço não encontrada. Confira a tabela selecionada.');
    }
    if (!anterior.ativo) {
      throw new ErroAplicacao('Esta tabela de preço já está inativada.');
    }
    const atualizado = await this.repo.inativar(
      validos.id,
      usuario.id,
      this.agora(),
      validos.motivo
    );
    if (atualizado === null) {
      throw new ErroAplicacao('Não foi possível inativar a tabela de preço. Tente novamente.');
    }
    return paraTabelaPreco(atualizado);
  }

  async reativar(id: number, usuario: Usuario): Promise<TabelaPreco> {
    exigirEdicaoPrecos(usuario);
    const anterior = await this.repo.buscarPorId(id);
    if (anterior === null) {
      throw new ErroAplicacao('Tabela de preço não encontrada. Confira a tabela selecionada.');
    }
    if (anterior.ativo) {
      throw new ErroAplicacao('Esta tabela de preço já está ativa.');
    }
    const atualizado = await this.repo.reativar(id);
    if (atualizado === null) {
      throw new ErroAplicacao('Não foi possível reativar a tabela de preço. Tente novamente.');
    }
    return paraTabelaPreco(atualizado);
  }
}
