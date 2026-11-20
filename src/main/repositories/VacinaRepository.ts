import type { Prisma } from '@prisma/client';
import { LIMITE_LISTAGEM_VACINAS } from '../../shared/constants';
import type { VeterinarioResumo } from '../../shared/types';
import { Database } from '../database/PrismaClient';

/** Projeção única das vacinas: nunca traz e-mail, senha ou papel de outros usuários. */
const selecaoVacina = {
  id: true,
  petId: true,
  veterinarioId: true,
  consultaId: true,
  vacina: true,
  fabricante: true,
  lote: true,
  validade: true,
  aplicadaEm: true,
  dose: true,
  proximaDose: true,
  reacao: true,
  observacoes: true,
  registradoPorId: true,
  registradoEm: true,
  veterinario: { select: { id: true, nome: true, crmv: true } },
} satisfies Prisma.RegistroVacinaSelect;

const selecaoConsultaVinculada = {
  id: true,
  petId: true,
  veterinarioId: true,
  status: true,
} satisfies Prisma.ConsultaSelect;

/** Espelho persistido do contrato: datas civis e instantes ainda como `Date`. */
export interface RegistroVacinaPersistido {
  id: number;
  petId: number;
  veterinarioId: number;
  consultaId: number | null;
  vacina: string;
  fabricante: string;
  lote: string;
  validade: Date;
  aplicadaEm: Date;
  dose: string;
  proximaDose: Date | null;
  reacao: string | null;
  observacoes: string | null;
  registradoPorId: number;
  registradoEm: Date;
  veterinario: { id: number; nome: string; crmv: string | null };
}

export interface ResumoConsultaVinculada {
  id: number;
  petId: number;
  veterinarioId: number;
  status: string;
}

/** Dados já validados e normalizados pelo domínio; este módulo cuida do formato do banco. */
export interface DadosCriacaoVacina {
  petId: number;
  veterinarioId: number;
  consultaId: number | null;
  vacina: string;
  fabricante: string;
  lote: string;
  validade: string;
  aplicadaEm: string;
  dose: string;
  proximaDose: string | null;
  reacao: string | null;
  observacoes: string | null;
  registradoPorId: number;
  registradoEm: Date;
}

/** Porta de persistência: o service não conhece Prisma nem Electron. */
export interface VacinaRepositorio {
  listarPorPet(petId: number, veterinarioId?: number): Promise<RegistroVacinaPersistido[]>;
  criar(dados: DadosCriacaoVacina): Promise<RegistroVacinaPersistido>;
  petExiste(id: number): Promise<boolean>;
  buscarVeterinarioAtivo(id: number): Promise<VeterinarioResumo | null>;
  buscarConsulta(id: number): Promise<ResumoConsultaVinculada | null>;
}

/** `@db.Date` é uma data civil: ancorá-la em UTC evita deslocamento por fuso. */
function dataCivil(valor: string): Date {
  return new Date(`${valor}T00:00:00.000Z`);
}

export class VacinaRepository implements VacinaRepositorio {
  private prisma = Database.getInstance();

  listarPorPet(petId: number, veterinarioId?: number): Promise<RegistroVacinaPersistido[]> {
    const where: Prisma.RegistroVacinaWhereInput = { petId };
    if (veterinarioId !== undefined) where.veterinarioId = veterinarioId;

    return this.prisma.registroVacina.findMany({
      where,
      select: selecaoVacina,
      orderBy: [{ aplicadaEm: 'desc' }, { id: 'desc' }],
      take: LIMITE_LISTAGEM_VACINAS,
    });
  }

  criar(dados: DadosCriacaoVacina): Promise<RegistroVacinaPersistido> {
    return this.prisma.registroVacina.create({
      data: {
        petId: dados.petId,
        veterinarioId: dados.veterinarioId,
        consultaId: dados.consultaId,
        vacina: dados.vacina,
        fabricante: dados.fabricante,
        lote: dados.lote,
        validade: dataCivil(dados.validade),
        aplicadaEm: new Date(dados.aplicadaEm),
        dose: dados.dose,
        proximaDose: dados.proximaDose === null ? null : dataCivil(dados.proximaDose),
        reacao: dados.reacao,
        observacoes: dados.observacoes,
        registradoPorId: dados.registradoPorId,
        registradoEm: dados.registradoEm,
      },
      select: selecaoVacina,
    });
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

  buscarConsulta(id: number): Promise<ResumoConsultaVinculada | null> {
    return this.prisma.consulta.findUnique({
      where: { id },
      select: selecaoConsultaVinculada,
    });
  }
}
