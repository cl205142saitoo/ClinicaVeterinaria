import { Prisma } from '@prisma/client';
import type { MovimentacaoStatus, MovimentacaoTipo } from '../../shared/types';
import { Database } from '../database/PrismaClient';

const LIMITE_LISTAGEM_MOVIMENTACOES = 200;

const selecaoMovimentacao = {
  id: true,
  tipo: true,
  categoria: true,
  descricao: true,
  valor: true,
  vencimento: true,
  pagamento: true,
  status: true,
  formaPagamento: true,
  orcamentoId: true,
  orcamento: { select: { numero: true } },
  criadoPorId: true,
  baixadoPorId: true,
  baixadoEm: true,
  canceladoEm: true,
  motivoCancelamento: true,
  criadoEm: true,
} satisfies Prisma.MovimentacaoFinanceiraSelect;

type RegistroMovimentacao = Prisma.MovimentacaoFinanceiraGetPayload<{
  select: typeof selecaoMovimentacao;
}>;

export interface MovimentacaoPersistida {
  id: number;
  tipo: MovimentacaoTipo;
  categoria: string;
  descricao: string;
  valor: Prisma.Decimal;
  vencimento: Date;
  pagamento: Date | null;
  status: MovimentacaoStatus;
  formaPagamento: string | null;
  orcamentoId: number | null;
  orcamentoNumero: string | null;
  criadoPorId: number;
  baixadoPorId: number | null;
  baixadoEm: Date | null;
  canceladoEm: Date | null;
  motivoCancelamento: string | null;
  criadoEm: Date;
}

/** Projeção numérica já pronta para os cálculos de resumo e de relatório. */
export interface ResumoMovimentacao {
  tipo: string;
  status: string;
  valor: number;
  /** Data civil YYYY-MM-DD. */
  vencimento: string;
}

export interface DadosCriacaoMovimentacaoBanco {
  tipo: MovimentacaoTipo;
  categoria: string;
  descricao: string;
  valor: number;
  vencimento: string;
  pagamento: string | null;
  status: MovimentacaoStatus;
  formaPagamento: string | null;
  orcamentoId: number | null;
  criadoPorId: number;
  baixadoPorId: number | null;
  baixadoEm: Date | null;
}

export interface DadosAtualizacaoMovimentacaoBanco extends DadosCriacaoMovimentacaoBanco {
  id: number;
}

export interface DadosBaixaMovimentacaoBanco {
  id: number;
  pagamento: string;
  formaPagamento: string | null;
  baixadoPorId: number;
  baixadoEm: Date;
}

export interface DadosCancelamentoMovimentacaoBanco {
  id: number;
  responsavelId: number;
  canceladoEm: Date;
  motivo: string;
  /** Ao sair de PAGO, a auditoria da baixa deixa de valer. */
  limparBaixa: boolean;
}

export interface MovimentacaoFinanceiraRepositorio {
  listar(): Promise<MovimentacaoPersistida[]>;
  buscarPorId(id: number): Promise<MovimentacaoPersistida | null>;
  listarParaResumo(): Promise<ResumoMovimentacao[]>;
  orcamentoExiste(id: number): Promise<boolean>;
  criar(dados: DadosCriacaoMovimentacaoBanco): Promise<MovimentacaoPersistida>;
  atualizar(dados: DadosAtualizacaoMovimentacaoBanco): Promise<MovimentacaoPersistida>;
  baixar(dados: DadosBaixaMovimentacaoBanco): Promise<MovimentacaoPersistida | null>;
  cancelar(dados: DadosCancelamentoMovimentacaoBanco): Promise<MovimentacaoPersistida | null>;
}

function paraMovimentacao(registro: RegistroMovimentacao): MovimentacaoPersistida {
  return {
    id: registro.id,
    tipo: registro.tipo as MovimentacaoTipo,
    categoria: registro.categoria,
    descricao: registro.descricao,
    valor: registro.valor,
    vencimento: registro.vencimento,
    pagamento: registro.pagamento,
    status: registro.status as MovimentacaoStatus,
    formaPagamento: registro.formaPagamento,
    orcamentoId: registro.orcamentoId,
    orcamentoNumero: registro.orcamento?.numero ?? null,
    criadoPorId: registro.criadoPorId,
    baixadoPorId: registro.baixadoPorId,
    baixadoEm: registro.baixadoEm,
    canceladoEm: registro.canceladoEm,
    motivoCancelamento: registro.motivoCancelamento,
    criadoEm: registro.criadoEm,
  };
}

/** `@db.Date` é data civil: ancorá-la em UTC evita deslocamento por fuso. */
function dataCivil(valor: string): Date {
  return new Date(`${valor}T00:00:00.000Z`);
}

function dataCivilPersistida(valor: Date | null): string | null {
  return valor === null ? null : valor.toISOString().slice(0, 10);
}

export class MovimentacaoFinanceiraRepository implements MovimentacaoFinanceiraRepositorio {
  private prisma = Database.getInstance();

  async listar(): Promise<MovimentacaoPersistida[]> {
    const registros = await this.prisma.movimentacaoFinanceira.findMany({
      select: selecaoMovimentacao,
      orderBy: [{ vencimento: 'desc' }, { id: 'desc' }],
      take: LIMITE_LISTAGEM_MOVIMENTACOES,
    });
    return registros.map(paraMovimentacao);
  }

  async buscarPorId(id: number): Promise<MovimentacaoPersistida | null> {
    const registro = await this.prisma.movimentacaoFinanceira.findUnique({
      where: { id },
      select: selecaoMovimentacao,
    });
    return registro === null ? null : paraMovimentacao(registro);
  }

  async listarParaResumo(): Promise<ResumoMovimentacao[]> {
    const registros = await this.prisma.movimentacaoFinanceira.findMany({
      select: { tipo: true, status: true, valor: true, vencimento: true },
    });
    return registros.map((registro) => ({
      tipo: registro.tipo,
      status: registro.status,
      valor: registro.valor.toNumber(),
      vencimento: dataCivilPersistida(registro.vencimento) ?? '',
    }));
  }

  async orcamentoExiste(id: number): Promise<boolean> {
    return (await this.prisma.orcamento.count({ where: { id } })) > 0;
  }

  async criar(dados: DadosCriacaoMovimentacaoBanco): Promise<MovimentacaoPersistida> {
    const registro = await this.prisma.movimentacaoFinanceira.create({
      data: {
        tipo: dados.tipo,
        categoria: dados.categoria.trim(),
        descricao: dados.descricao.trim(),
        valor: new Prisma.Decimal(dados.valor),
        vencimento: dataCivil(dados.vencimento),
        pagamento: dados.pagamento === null ? null : dataCivil(dados.pagamento),
        status: dados.status,
        formaPagamento: dados.formaPagamento,
        orcamentoId: dados.orcamentoId,
        criadoPorId: dados.criadoPorId,
        baixadoPorId: dados.baixadoPorId,
        baixadoEm: dados.baixadoEm,
      },
      select: selecaoMovimentacao,
    });
    return paraMovimentacao(registro);
  }

  async atualizar(dados: DadosAtualizacaoMovimentacaoBanco): Promise<MovimentacaoPersistida> {
    const registro = await this.prisma.movimentacaoFinanceira.update({
      where: { id: dados.id },
      data: {
        tipo: dados.tipo,
        categoria: dados.categoria.trim(),
        descricao: dados.descricao.trim(),
        valor: new Prisma.Decimal(dados.valor),
        vencimento: dataCivil(dados.vencimento),
        pagamento: dados.pagamento === null ? null : dataCivil(dados.pagamento),
        status: dados.status,
        formaPagamento: dados.formaPagamento,
        orcamentoId: dados.orcamentoId,
        baixadoPorId: dados.baixadoPorId,
        baixadoEm: dados.baixadoEm,
      },
      select: selecaoMovimentacao,
    });
    return paraMovimentacao(registro);
  }

  async baixar(dados: DadosBaixaMovimentacaoBanco): Promise<MovimentacaoPersistida | null> {
    const resultado = await this.prisma.movimentacaoFinanceira.updateMany({
      where: { id: dados.id, status: 'PENDENTE' },
      data: {
        status: 'PAGO',
        pagamento: dataCivil(dados.pagamento),
        formaPagamento: dados.formaPagamento,
        baixadoPorId: dados.baixadoPorId,
        baixadoEm: dados.baixadoEm,
      },
    });
    if (resultado.count !== 1) return null;
    return this.buscarPorId(dados.id);
  }

  async cancelar(dados: DadosCancelamentoMovimentacaoBanco): Promise<MovimentacaoPersistida | null> {
    const resultado = await this.prisma.movimentacaoFinanceira.updateMany({
      where: { id: dados.id, status: { not: 'CANCELADO' } },
      data: {
        status: 'CANCELADO',
        canceladoPorId: dados.responsavelId,
        canceladoEm: dados.canceladoEm,
        motivoCancelamento: dados.motivo.trim(),
        ...(dados.limparBaixa ? { baixadoPorId: null, baixadoEm: null } : {}),
      },
    });
    if (resultado.count !== 1) return null;
    return this.buscarPorId(dados.id);
  }
}
