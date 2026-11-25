import { Prisma } from '@prisma/client';
import type { DadosTabelaPreco } from '../../shared/types';
import { Database } from '../database/PrismaClient';

const LIMITE_LISTAGEM_TABELAS = 200;

const selecaoTabela = {
  id: true,
  codigo: true,
  descricao: true,
  categoria: true,
  preco: true,
  ativo: true,
  inativadoEm: true,
  motivoInativacao: true,
} satisfies Prisma.TabelaPrecoSelect;

type RegistroTabela = Prisma.TabelaPrecoGetPayload<{ select: typeof selecaoTabela }>;

/** Espelho persistido: `preco` ainda é `Prisma.Decimal`. */
export interface TabelaPrecoPersistido {
  id: number;
  codigo: string;
  descricao: string;
  categoria: string;
  preco: Prisma.Decimal;
  ativo: boolean;
  inativadoEm: Date | null;
  motivoInativacao: string | null;
}

export interface TabelaPrecoRepositorio {
  listar(): Promise<TabelaPrecoPersistido[]>;
  buscarPorId(id: number): Promise<TabelaPrecoPersistido | null>;
  codigoExiste(codigo: string, ignorarId?: number): Promise<boolean>;
  criar(dados: DadosTabelaPreco): Promise<TabelaPrecoPersistido>;
  atualizar(dados: DadosTabelaPreco & { id: number }): Promise<TabelaPrecoPersistido>;
  inativar(
    id: number,
    responsavelId: number,
    agora: Date,
    motivo: string
  ): Promise<TabelaPrecoPersistido | null>;
  reativar(id: number): Promise<TabelaPrecoPersistido | null>;
}

function paraTabela(registro: RegistroTabela): TabelaPrecoPersistido {
  return {
    id: registro.id,
    codigo: registro.codigo,
    descricao: registro.descricao,
    categoria: registro.categoria,
    preco: registro.preco,
    ativo: registro.ativo,
    inativadoEm: registro.inativadoEm,
    motivoInativacao: registro.motivoInativacao,
  };
}

export class TabelaPrecoRepository implements TabelaPrecoRepositorio {
  private prisma = Database.getInstance();

  async listar(): Promise<TabelaPrecoPersistido[]> {
    const registros = await this.prisma.tabelaPreco.findMany({
      select: selecaoTabela,
      orderBy: [{ codigo: 'asc' }, { id: 'asc' }],
      take: LIMITE_LISTAGEM_TABELAS,
    });
    return registros.map(paraTabela);
  }

  async buscarPorId(id: number): Promise<TabelaPrecoPersistido | null> {
    const registro = await this.prisma.tabelaPreco.findUnique({
      where: { id },
      select: selecaoTabela,
    });
    return registro === null ? null : paraTabela(registro);
  }

  async codigoExiste(codigo: string, ignorarId?: number): Promise<boolean> {
    return (
      (await this.prisma.tabelaPreco.count({
        where: { codigo, ...(ignorarId === undefined ? {} : { id: { not: ignorarId } }) },
      })) > 0
    );
  }

  async criar(dados: DadosTabelaPreco): Promise<TabelaPrecoPersistido> {
    const registro = await this.prisma.tabelaPreco.create({
      data: {
        codigo: dados.codigo.trim(),
        descricao: dados.descricao.trim(),
        categoria: dados.categoria.trim(),
        preco: new Prisma.Decimal(dados.preco),
      },
      select: selecaoTabela,
    });
    return paraTabela(registro);
  }

  async atualizar(dados: DadosTabelaPreco & { id: number }): Promise<TabelaPrecoPersistido> {
    const registro = await this.prisma.tabelaPreco.update({
      where: { id: dados.id },
      data: {
        codigo: dados.codigo.trim(),
        descricao: dados.descricao.trim(),
        categoria: dados.categoria.trim(),
        preco: new Prisma.Decimal(dados.preco),
      },
      select: selecaoTabela,
    });
    return paraTabela(registro);
  }

  async inativar(
    id: number,
    responsavelId: number,
    agora: Date,
    motivo: string
  ): Promise<TabelaPrecoPersistido | null> {
    const resultado = await this.prisma.tabelaPreco.updateMany({
      where: { id, ativo: true },
      data: {
        ativo: false,
        inativadoPorId: responsavelId,
        inativadoEm: agora,
        motivoInativacao: motivo.trim(),
      },
    });
    if (resultado.count !== 1) return null;
    return this.buscarPorId(id);
  }

  /** Reativação limpa os campos de inativação para manter o estado coerente. */
  async reativar(id: number): Promise<TabelaPrecoPersistido | null> {
    const resultado = await this.prisma.tabelaPreco.updateMany({
      where: { id, ativo: false },
      data: {
        ativo: true,
        inativadoPorId: null,
        inativadoEm: null,
        motivoInativacao: null,
      },
    });
    if (resultado.count !== 1) return null;
    return this.buscarPorId(id);
  }
}
