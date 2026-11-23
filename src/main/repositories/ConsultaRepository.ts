import type { Prisma, PrismaClient } from '@prisma/client';
import {
  JANELA_BUSCA_CONFLITOS_HORAS,
  LIMITE_LISTAGEM_CONSULTAS,
  STATUS_CANCELAVEIS,
  STATUS_CONCLUIVEIS,
} from '../../shared/constants';
import { ErroAplicacao } from '../../shared/errors';
import type { VeterinarioResumo } from '../../shared/types';
import { Database } from '../database/PrismaClient';

/** Projeção da agenda: deliberadamente sem nenhuma coluna de prontuário. */
const selecaoAgenda = {
  id: true,
  dataHora: true,
  duracaoMinutos: true,
  motivo: true,
  status: true,
  petId: true,
  veterinarioId: true,
  pet: { select: { id: true, nome: true, cliente: { select: { nome: true } } } },
  veterinario: { select: { id: true, nome: true, crmv: true } },
} satisfies Prisma.ConsultaSelect;

/** Projeção clínica completa, usada apenas pelo prontuário e por checagens internas. */
const selecaoConsulta = {
  ...selecaoAgenda,
  diagnostico: true,
  exameClinico: true,
  conduta: true,
  pesoAferido: true,
  temperaturaC: true,
} satisfies Prisma.ConsultaSelect;

const selecaoConflito = {
  id: true,
  dataHora: true,
  duracaoMinutos: true,
  status: true,
  petId: true,
  veterinarioId: true,
} satisfies Prisma.ConsultaSelect;

export type RegistroAgenda = Prisma.ConsultaGetPayload<{ select: typeof selecaoAgenda }>;
export type RegistroConsulta = Prisma.ConsultaGetPayload<{ select: typeof selecaoConsulta }>;

export interface RegistroConflito {
  id: number;
  dataHora: Date;
  duracaoMinutos: number;
  status: string;
  petId: number;
  veterinarioId: number;
}

export interface OpcoesListagemConsulta {
  de?: Date;
  ate?: Date;
  veterinarioId?: number;
}

/** Uma dimensão por consulta para que o service detecte o motivo do conflito. */
export type CriterioConflito = { veterinarioId: number } | { petId: number };

export interface DadosCriacaoConsulta {
  petId: number;
  veterinarioId: number;
  dataHora: Date;
  motivo: string;
  criadoPorId: number;
}

export interface DadosCancelamentoConsulta {
  canceladoPorId: number;
  canceladoEm: Date;
  motivoCancelamento: string;
}

export interface DadosConclusaoConsulta {
  concluidaPorId: number;
  concluidaEm: Date;
}

/** Reagendamento/correção: nenhum campo clínico é alterado. */
export interface DadosReagendamentoConsulta {
  dataHora: Date;
  motivo: string;
  veterinarioId: number;
}

/** Somente colunas clínicas: status e auditorias de conclusão não são tocadas. */
export interface DadosEscritaProntuario {
  exameClinico: string;
  diagnostico: string;
  conduta: string;
  pesoAferido: number | null;
  temperaturaC: number | null;
}

/** Porta de persistência: o service não conhece Prisma nem Electron. */
export interface ConsultaRepositorio {
  listar(opcoes: OpcoesListagemConsulta): Promise<RegistroAgenda[]>;
  buscarPorId(id: number): Promise<RegistroConsulta | null>;
  buscarAgendaPorId(id: number): Promise<RegistroAgenda | null>;
  petExiste(id: number): Promise<boolean>;
  buscarVeterinarioAtivo(id: number): Promise<VeterinarioResumo | null>;
  listarVeterinarios(): Promise<VeterinarioResumo[]>;
  buscarConflitos(
    criterio: CriterioConflito,
    inicio: Date,
    fim: Date,
    ignorarConsultaId?: number
  ): Promise<RegistroConflito[]>;
  criar(dados: DadosCriacaoConsulta): Promise<RegistroAgenda>;
  atualizar(id: number, dados: DadosReagendamentoConsulta): Promise<boolean>;
  cancelar(id: number, dados: DadosCancelamentoConsulta): Promise<boolean>;
  concluir(id: number, dados: DadosConclusaoConsulta): Promise<boolean>;
  salvarProntuario(id: number, dados: DadosEscritaProntuario): Promise<boolean>;
  listarPorPet(petId: number, veterinarioId?: number): Promise<RegistroConsulta[]>;
  /** Serializa a criação por pet e veterinário usando travamento de linha. */
  transacao<T>(fn: (repositorio: ConsultaRepositorio) => Promise<T>): Promise<T>;
  bloquearPetEVeterinario(petId: number, veterinarioId: number): Promise<void>;
}

type ClientePrisma = PrismaClient | Prisma.TransactionClient;

export class ConsultaRepository implements ConsultaRepositorio {
  constructor(
    private readonly prisma: ClientePrisma = Database.getInstance(),
    private readonly emTransacao = false
  ) {}

  transacao<T>(fn: (repositorio: ConsultaRepositorio) => Promise<T>): Promise<T> {
    if (this.emTransacao) {
      throw new ErroAplicacao('Não é possível iniciar uma transação dentro de outra.');
    }
    return Database.getInstance().$transaction((tx) => fn(new ConsultaRepository(tx, true)));
  }

  /**
   * `FOR UPDATE` nas duas linhas na mesma ordem em toda criação evita que duas
   * transações vejam a agenda livre e marquem o mesmo horário simultaneamente.
   */
  async bloquearPetEVeterinario(petId: number, veterinarioId: number): Promise<void> {
    await this.prisma.$queryRaw`SELECT id FROM Pet WHERE id = ${petId} FOR UPDATE`;
    await this.prisma.$queryRaw`SELECT id FROM Usuario WHERE id = ${veterinarioId} FOR UPDATE`;
  }

  listar(opcoes: OpcoesListagemConsulta): Promise<RegistroAgenda[]> {
    const where: Prisma.ConsultaWhereInput = {};
    if (opcoes.de !== undefined || opcoes.ate !== undefined) {
      const intervalo: Prisma.DateTimeFilter = {};
      if (opcoes.de !== undefined) intervalo.gte = opcoes.de;
      if (opcoes.ate !== undefined) intervalo.lte = opcoes.ate;
      where.dataHora = intervalo;
    }
    if (opcoes.veterinarioId !== undefined) where.veterinarioId = opcoes.veterinarioId;

    return this.prisma.consulta.findMany({
      where,
      select: selecaoAgenda,
      orderBy: [{ dataHora: 'asc' }, { id: 'asc' }],
      take: LIMITE_LISTAGEM_CONSULTAS,
    });
  }

  buscarPorId(id: number): Promise<RegistroConsulta | null> {
    return this.prisma.consulta.findUnique({ where: { id }, select: selecaoConsulta });
  }

  buscarAgendaPorId(id: number): Promise<RegistroAgenda | null> {
    return this.prisma.consulta.findUnique({ where: { id }, select: selecaoAgenda });
  }

  async petExiste(id: number): Promise<boolean> {
    return (await this.prisma.pet.count({ where: { id } })) > 0;
  }

  buscarVeterinarioAtivo(id: number): Promise<VeterinarioResumo | null> {
    return this.prisma.usuario.findFirst({
      where: { id, role: 'VETERINARIO', ativo: true },
      select: { id: true, nome: true, crmv: true },
    });
  }

  listarVeterinarios(): Promise<VeterinarioResumo[]> {
    return this.prisma.usuario.findMany({
      where: { role: 'VETERINARIO', ativo: true },
      select: { id: true, nome: true, crmv: true },
      orderBy: { nome: 'asc' },
    });
  }

  /**
   * Busca indexada em `[inicio - 24h, fim)` para encontrar consultas que
   * começaram antes do novo horário. O service aplica o corte exato com a
   * `duracaoMinutos` de cada registro.
   */
  buscarConflitos(
    criterio: CriterioConflito,
    inicio: Date,
    fim: Date,
    ignorarConsultaId?: number
  ): Promise<RegistroConflito[]> {
    const inicioBusca = new Date(
      inicio.getTime() - JANELA_BUSCA_CONFLITOS_HORAS * 60 * 60 * 1000
    );
    const where: Prisma.ConsultaWhereInput = {
      status: { in: [...STATUS_CANCELAVEIS] },
      dataHora: { gte: inicioBusca, lt: fim },
    };
    if ('veterinarioId' in criterio) {
      where.veterinarioId = criterio.veterinarioId;
    } else {
      where.petId = criterio.petId;
    }
    if (ignorarConsultaId !== undefined) {
      where.id = { not: ignorarConsultaId };
    }

    return this.prisma.consulta.findMany({
      where,
      select: selecaoConflito,
      orderBy: { dataHora: 'asc' },
    });
  }

  criar(dados: DadosCriacaoConsulta): Promise<RegistroAgenda> {
    return this.prisma.consulta.create({
      data: {
        petId: dados.petId,
        veterinarioId: dados.veterinarioId,
        dataHora: dados.dataHora,
        motivo: dados.motivo.trim(),
        status: 'AGENDADA',
        criadoPorId: dados.criadoPorId,
      },
      select: selecaoAgenda,
    });
  }

  /** `where` preserva a janela de status entre a checagem e a escrita. */
  async atualizar(id: number, dados: DadosReagendamentoConsulta): Promise<boolean> {
    const resultado = await this.prisma.consulta.updateMany({
      where: { id, status: { in: [...STATUS_CANCELAVEIS] } },
      data: {
        dataHora: dados.dataHora,
        motivo: dados.motivo.trim(),
        veterinarioId: dados.veterinarioId,
      },
    });
    return resultado.count === 1;
  }

  async cancelar(id: number, dados: DadosCancelamentoConsulta): Promise<boolean> {
    const resultado = await this.prisma.consulta.updateMany({
      where: { id, status: { in: [...STATUS_CANCELAVEIS] } },
      data: {
        status: 'CANCELADA',
        canceladoPorId: dados.canceladoPorId,
        canceladoEm: dados.canceladoEm,
        motivoCancelamento: dados.motivoCancelamento.trim(),
      },
    });
    return resultado.count === 1;
  }

  async concluir(id: number, dados: DadosConclusaoConsulta): Promise<boolean> {
    const resultado = await this.prisma.consulta.updateMany({
      where: { id, status: { in: [...STATUS_CONCLUIVEIS] } },
      data: {
        status: 'CONCLUIDA',
        concluidaPorId: dados.concluidaPorId,
        concluidaEm: dados.concluidaEm,
      },
    });
    return resultado.count === 1;
  }

  /** `where` também exclui canceladas para fechar a janela entre checagem e escrita. */
  async salvarProntuario(id: number, dados: DadosEscritaProntuario): Promise<boolean> {
    const resultado = await this.prisma.consulta.updateMany({
      where: { id, status: { not: 'CANCELADA' } },
      data: {
        exameClinico: dados.exameClinico,
        diagnostico: dados.diagnostico,
        conduta: dados.conduta,
        pesoAferido: dados.pesoAferido,
        temperaturaC: dados.temperaturaC,
      },
    });
    return resultado.count === 1;
  }

  listarPorPet(petId: number, veterinarioId?: number): Promise<RegistroConsulta[]> {
    const where: Prisma.ConsultaWhereInput = { petId };
    if (veterinarioId !== undefined) where.veterinarioId = veterinarioId;

    return this.prisma.consulta.findMany({
      where,
      select: selecaoConsulta,
      orderBy: [{ dataHora: 'desc' }, { id: 'desc' }],
      take: LIMITE_LISTAGEM_CONSULTAS,
    });
  }
}
