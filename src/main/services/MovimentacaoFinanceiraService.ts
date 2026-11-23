import { dataCivilClinica } from '../../shared/datas';
import { ErroAplicacao } from '../../shared/errors';
import type {
  DadosAtualizacaoMovimentacao,
  DadosBaixaMovimentacao,
  DadosInativacao,
  DadosMovimentacao,
  MovimentacaoFinanceira,
  MovimentacaoStatus,
  ResumoFinanceiro,
  Usuario,
} from '../../shared/types';
import {
  ehDadosAtualizacaoMovimentacao,
  ehDadosBaixaMovimentacao,
  ehDadosInativacao,
  ehDadosMovimentacao,
  exigir,
} from '../../shared/validators';
import type {
  DadosAtualizacaoMovimentacaoBanco,
  DadosCriacaoMovimentacaoBanco,
  MovimentacaoPersistida,
  MovimentacaoFinanceiraRepositorio,
  ResumoMovimentacao,
} from '../repositories/MovimentacaoFinanceiraRepository';
import { exigirEdicaoComercial, exigirLeituraFase2 } from './permissoesFase2';
import { arredondar2 } from './valoresFase2';

/** Razão 0..1; o renderer é quem formata a porcentagem. */
export function calcularInadimplencia(
  movimentacoes: readonly ResumoMovimentacao[],
  hoje: string
): number {
  let vencidas = 0;
  let pendentes = 0;
  for (const movimentacao of movimentacoes) {
    if (movimentacao.tipo !== 'RECEITA' || movimentacao.status === 'CANCELADO') continue;
    // Vencimento estritamente anterior ao dia civil corrente.
    if (movimentacao.vencimento >= hoje) continue;
    vencidas += movimentacao.valor;
    if (movimentacao.status === 'PENDENTE') pendentes += movimentacao.valor;
  }
  if (vencidas <= 0) return 0;
  return Math.min(1, Math.max(0, pendentes / vencidas));
}

function paraMovimentacao(registro: MovimentacaoPersistida): MovimentacaoFinanceira {
  return {
    id: registro.id,
    tipo: registro.tipo,
    categoria: registro.categoria,
    descricao: registro.descricao,
    valor: registro.valor.toNumber(),
    vencimento: registro.vencimento.toISOString().slice(0, 10),
    pagamento: registro.pagamento === null ? null : registro.pagamento.toISOString().slice(0, 10),
    status: registro.status,
    formaPagamento: registro.formaPagamento,
    orcamentoId: registro.orcamentoId,
    orcamentoNumero: registro.orcamentoNumero,
    baixadoEm: registro.baixadoEm === null ? null : registro.baixadoEm.toISOString(),
    canceladoEm: registro.canceladoEm === null ? null : registro.canceladoEm.toISOString(),
    motivoCancelamento: registro.motivoCancelamento,
    criadoEm: registro.criadoEm.toISOString(),
  };
}

function opcional(valor: string | null): string | null {
  if (valor === null) return null;
  const limpo = valor.trim();
  return limpo === '' ? null : limpo;
}

export class MovimentacaoFinanceiraService {
  constructor(
    private readonly repo: MovimentacaoFinanceiraRepositorio,
    private readonly agora: () => Date = () => new Date()
  ) {}

  async listar(usuario: Usuario): Promise<MovimentacaoFinanceira[]> {
    exigirLeituraFase2(usuario, 'financeiro');
    const registros = await this.repo.listar();
    return registros.map(paraMovimentacao);
  }

  async criar(dados: DadosMovimentacao, usuario: Usuario): Promise<MovimentacaoFinanceira> {
    exigirEdicaoComercial(usuario, 'financeiro');
    const validos = exigir(
      dados,
      ehDadosMovimentacao,
      'Dados da movimentação inválidos. Confira tipo, valor e vencimento.'
    );
    this.exigirStatusOperavel(validos.status);
    await this.validarOrcamento(validos.orcamentoId);
    const agora = this.agora();

    const registro = await this.repo.criar({
      tipo: validos.tipo,
      categoria: validos.categoria.trim(),
      descricao: validos.descricao.trim(),
      valor: validos.valor,
      vencimento: validos.vencimento,
      pagamento: validos.pagamento,
      status: validos.status,
      formaPagamento: opcional(validos.formaPagamento),
      orcamentoId: validos.orcamentoId,
      criadoPorId: usuario.id,
      // Seed e cadastros já PAGOS ficam com a auditoria equivalente à baixa.
      baixadoPorId: validos.status === 'PAGO' ? usuario.id : null,
      baixadoEm: validos.status === 'PAGO' ? agora : null,
    } satisfies DadosCriacaoMovimentacaoBanco);
    return paraMovimentacao(registro);
  }

  async atualizar(
    dados: DadosAtualizacaoMovimentacao,
    usuario: Usuario
  ): Promise<MovimentacaoFinanceira> {
    exigirEdicaoComercial(usuario, 'financeiro');
    const validos = exigir(
      dados,
      ehDadosAtualizacaoMovimentacao,
      'Dados da movimentação inválidos. Confira tipo, valor e vencimento.'
    );
    this.exigirStatusOperavel(validos.status);
    const anterior = await this.repo.buscarPorId(validos.id);
    if (anterior === null) {
      throw new ErroAplicacao('Movimentação não encontrada. Confira a movimentação selecionada.');
    }
    if (anterior.status === 'CANCELADO') {
      throw new ErroAplicacao('Não é possível editar uma movimentação cancelada.');
    }
    await this.validarOrcamento(validos.orcamentoId);

    const agora = this.agora();
    const baixa = this.auditoriaBaixa(validos.status, anterior, usuario.id, agora);
    const registro = await this.repo.atualizar({
      id: validos.id,
      tipo: validos.tipo,
      categoria: validos.categoria.trim(),
      descricao: validos.descricao.trim(),
      valor: validos.valor,
      vencimento: validos.vencimento,
      pagamento: validos.pagamento,
      status: validos.status,
      formaPagamento: opcional(validos.formaPagamento),
      orcamentoId: validos.orcamentoId,
      criadoPorId: anterior.criadoPorId,
      ...baixa,
    } satisfies DadosAtualizacaoMovimentacaoBanco);
    return paraMovimentacao(registro);
  }

  async baixar(
    dados: DadosBaixaMovimentacao,
    usuario: Usuario
  ): Promise<MovimentacaoFinanceira> {
    exigirEdicaoComercial(usuario, 'financeiro');
    const validos = exigir(
      dados,
      ehDadosBaixaMovimentacao,
      'Informe a movimentação e a data do pagamento (AAAA-MM-DD).'
    );
    const anterior = await this.repo.buscarPorId(validos.id);
    if (anterior === null) {
      throw new ErroAplicacao('Movimentação não encontrada. Confira a movimentação selecionada.');
    }
    if (anterior.status === 'PAGO') {
      throw new ErroAplicacao('Esta movimentação já foi baixada.');
    }
    if (anterior.status !== 'PENDENTE') {
      throw new ErroAplicacao('Só é possível baixar movimentações pendentes.');
    }
    const atualizado = await this.repo.baixar({
      id: validos.id,
      pagamento: validos.pagamento,
      formaPagamento: opcional(validos.formaPagamento),
      baixadoPorId: usuario.id,
      baixadoEm: this.agora(),
    });
    if (atualizado === null) {
      throw new ErroAplicacao(
        'A movimentação não está mais pendente. Atualize a lista e tente novamente.'
      );
    }
    return paraMovimentacao(atualizado);
  }

  async cancelar(dados: DadosInativacao, usuario: Usuario): Promise<MovimentacaoFinanceira> {
    exigirEdicaoComercial(usuario, 'financeiro');
    const validos = exigir(
      dados,
      ehDadosInativacao,
      'Informe a movimentação e o motivo do cancelamento (de 3 a 500 caracteres).'
    );
    const anterior = await this.repo.buscarPorId(validos.id);
    if (anterior === null) {
      throw new ErroAplicacao('Movimentação não encontrada. Confira a movimentação selecionada.');
    }
    if (anterior.status === 'CANCELADO') {
      throw new ErroAplicacao('Esta movimentação já está cancelada.');
    }
    const atualizado = await this.repo.cancelar({
      id: validos.id,
      responsavelId: usuario.id,
      canceladoEm: this.agora(),
      motivo: validos.motivo,
      limparBaixa: anterior.status === 'PAGO',
    });
    if (atualizado === null) {
      throw new ErroAplicacao('Não foi possível cancelar a movimentação. Tente novamente.');
    }
    return paraMovimentacao(atualizado);
  }

  async resumoFinanceiro(usuario: Usuario): Promise<ResumoFinanceiro> {
    exigirLeituraFase2(usuario, 'financeiro');
    const movimentacoes = await this.repo.listarParaResumo();
    let receitasPagas = 0;
    let despesasPagas = 0;
    let receitasPendentes = 0;
    let despesasPendentes = 0;

    for (const movimentacao of movimentacoes) {
      if (movimentacao.status === 'PAGO') {
        if (movimentacao.tipo === 'RECEITA') receitasPagas += movimentacao.valor;
        if (movimentacao.tipo === 'DESPESA') despesasPagas += movimentacao.valor;
      } else if (movimentacao.status === 'PENDENTE') {
        if (movimentacao.tipo === 'RECEITA') receitasPendentes += movimentacao.valor;
        if (movimentacao.tipo === 'DESPESA') despesasPendentes += movimentacao.valor;
      }
    }

    receitasPagas = arredondar2(receitasPagas);
    despesasPagas = arredondar2(despesasPagas);
    return {
      receitasPagas,
      despesasPagas,
      saldo: arredondar2(receitasPagas - despesasPagas),
      receitasPendentes: arredondar2(receitasPendentes),
      despesasPendentes: arredondar2(despesasPendentes),
      inadimplencia: calcularInadimplencia(movimentacoes, dataCivilClinica(this.agora())),
    };
  }

  /** Cancelamento é operação própria, com motivo; não pode chegar pelo cadastro. */
  private exigirStatusOperavel(status: MovimentacaoStatus): void {
    if (status === 'CANCELADO') {
      throw new ErroAplicacao(
        'Para cancelar uma movimentação, use a operação de cancelamento e informe o motivo.'
      );
    }
  }

  private async validarOrcamento(orcamentoId: number | null): Promise<void> {
    if (orcamentoId !== null && !(await this.repo.orcamentoExiste(orcamentoId))) {
      throw new ErroAplicacao('Orçamento vinculado não encontrado. Confira a seleção.');
    }
  }

  /** Preserva a baixa original ao editar um PAGO; preenche ou limpa conforme o status. */
  private auditoriaBaixa(
    status: MovimentacaoStatus,
    anterior: MovimentacaoPersistida,
    responsavelId: number,
    agora: Date
  ): { baixadoPorId: number | null; baixadoEm: Date | null } {
    if (status !== 'PAGO') return { baixadoPorId: null, baixadoEm: null };
    if (
      anterior.status === 'PAGO' &&
      anterior.baixadoPorId !== null &&
      anterior.baixadoEm !== null
    ) {
      return { baixadoPorId: anterior.baixadoPorId, baixadoEm: anterior.baixadoEm };
    }
    return { baixadoPorId: responsavelId, baixadoEm: agora };
  }
}
