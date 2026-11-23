import { Prisma } from '@prisma/client';
import type { OrigemHistoricoPreco } from '../../shared/types';
import { Database } from '../database/PrismaClient';

const LIMITE_LISTAGEM_HISTORICO = 200;

const selecaoHistorico = {
  id: true,
  origem: true,
  origemId: true,
  anterior: true,
  novo: true,
  responsavelId: true,
  responsavel: { select: { nome: true } },
  motivo: true,
  criadoEm: true,
} satisfies Prisma.HistoricoPrecoSelect;

type RegistroHistorico = Prisma.HistoricoPrecoGetPayload<{ select: typeof selecaoHistorico }>;

/** Espelho persistido: os valores ainda são `Prisma.Decimal`. */
export interface HistoricoPrecoPersistido {
  id: number;
  origem: string;
  origemId: number;
  anterior: Prisma.Decimal;
  novo: Prisma.Decimal;
  responsavelId: number;
  responsavelNome: string;
  motivo: string;
  criadoEm: Date;
}

export interface DadosRegistroHistoricoPreco {
  origem: OrigemHistoricoPreco;
  origemId: number;
  anterior: number;
  novo: number;
  responsavelId: number;
  motivo: string;
  criadoEm: Date;
}

export interface HistoricoPrecoRepositorio {
  listar(origem?: OrigemHistoricoPreco, origemId?: number): Promise<HistoricoPrecoPersistido[]>;
  registrar(dados: DadosRegistroHistoricoPreco): Promise<void>;
}

function paraHistorico(registro: RegistroHistorico): HistoricoPrecoPersistido {
  return {
    id: registro.id,
    origem: registro.origem,
    origemId: registro.origemId,
    anterior: registro.anterior,
    novo: registro.novo,
    responsavelId: registro.responsavelId,
    responsavelNome: registro.responsavel.nome,
    motivo: registro.motivo,
    criadoEm: registro.criadoEm,
  };
}

export class HistoricoPrecoRepository implements HistoricoPrecoRepositorio {
  private prisma = Database.getInstance();

  async listar(
    origem?: OrigemHistoricoPreco,
    origemId?: number
  ): Promise<HistoricoPrecoPersistido[]> {
    const where: Prisma.HistoricoPrecoWhereInput = {
      ...(origem === undefined ? {} : { origem }),
      ...(origemId === undefined ? {} : { origemId }),
    };
    const registros = await this.prisma.historicoPreco.findMany({
      where,
      select: selecaoHistorico,
      orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
      take: LIMITE_LISTAGEM_HISTORICO,
    });
    return registros.map(paraHistorico);
  }

  async registrar(dados: DadosRegistroHistoricoPreco): Promise<void> {
    await this.prisma.historicoPreco.create({
      data: {
        origem: dados.origem,
        origemId: dados.origemId,
        anterior: new Prisma.Decimal(dados.anterior),
        novo: new Prisma.Decimal(dados.novo),
        responsavelId: dados.responsavelId,
        motivo: dados.motivo,
        criadoEm: dados.criadoEm,
      },
    });
  }
}
