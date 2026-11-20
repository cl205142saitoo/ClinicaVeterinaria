import { Prisma } from '@prisma/client';
import { LIMITE_LISTAGEM_ESTOQUE } from '../../shared/constants';
import type { DadosLote, DadosProduto } from '../../shared/types';
import { Database } from '../database/PrismaClient';

const selecaoLote = {
  id: true,
  codigo: true,
  validade: true,
  quantidade: true,
  produtoId: true,
  criadoEm: true,
  atualizadoEm: true,
} satisfies Prisma.LoteSelect;

const selecaoLoteComProduto = {
  ...selecaoLote,
  produto: { select: { id: true, nome: true, categoria: true } },
} satisfies Prisma.LoteSelect;

const selecaoProduto = {
  id: true,
  nome: true,
  categoria: true,
  estoqueMinimo: true,
  precoBrl: true,
  lotes: {
    select: selecaoLote,
    orderBy: [{ validade: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.ProdutoSelect;

/** Espelho persistido do contrato: Decimal e datas ainda não cruzaram a ponte IPC. */
export interface LotePersistido {
  id: number;
  codigo: string;
  validade: Date;
  quantidade: number;
  produtoId: number;
  produto?: { id: number; nome: string; categoria: string };
  criadoEm: Date;
  atualizadoEm: Date;
}

export interface ProdutoPersistido {
  id: number;
  nome: string;
  categoria: string;
  estoqueMinimo: number;
  precoBrl: Prisma.Decimal;
  lotes: LotePersistido[];
}

/** Porta de persistência: o service não conhece Prisma nem Electron. */
export interface EstoqueRepositorio {
  listarProdutos(): Promise<ProdutoPersistido[]>;
  listarLotes(): Promise<LotePersistido[]>;
  criarProduto(dados: DadosProduto): Promise<ProdutoPersistido>;
  criarLote(dados: DadosLote): Promise<LotePersistido>;
  produtoExiste(id: number): Promise<boolean>;
  loteComCodigoExiste(codigo: string): Promise<boolean>;
}

export class EstoqueRepository implements EstoqueRepositorio {
  private prisma = Database.getInstance();

  listarProdutos(): Promise<ProdutoPersistido[]> {
    return this.prisma.produto.findMany({
      select: selecaoProduto,
      orderBy: { id: 'asc' },
      take: LIMITE_LISTAGEM_ESTOQUE,
    });
  }

  listarLotes(): Promise<LotePersistido[]> {
    return this.prisma.lote.findMany({
      select: selecaoLoteComProduto,
      orderBy: [{ validade: 'asc' }, { id: 'asc' }],
      take: LIMITE_LISTAGEM_ESTOQUE,
    });
  }

  criarProduto(dados: DadosProduto): Promise<ProdutoPersistido> {
    return this.prisma.produto.create({
      data: {
        nome: dados.nome,
        categoria: dados.categoria,
        estoqueMinimo: dados.estoqueMinimo,
        precoBrl: new Prisma.Decimal(dados.precoBrl),
      },
      select: selecaoProduto,
    });
  }

  criarLote(dados: DadosLote): Promise<LotePersistido> {
    return this.prisma.lote.create({
      data: {
        produtoId: dados.produtoId,
        codigo: dados.codigo,
        validade: new Date(`${dados.validade}T00:00:00.000Z`),
        quantidade: dados.quantidade,
      },
      select: selecaoLoteComProduto,
    });
  }

  async produtoExiste(id: number): Promise<boolean> {
    return (await this.prisma.produto.count({ where: { id } })) > 0;
  }

  async loteComCodigoExiste(codigo: string): Promise<boolean> {
    return (await this.prisma.lote.count({ where: { codigo } })) > 0;
  }
}
