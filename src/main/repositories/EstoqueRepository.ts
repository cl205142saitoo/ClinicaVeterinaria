import { Prisma } from '@prisma/client';
import { LIMITE_LISTAGEM_ESTOQUE } from '../../shared/constants';
import type {
  DadosAtualizacaoLote,
  DadosAtualizacaoProduto,
  DadosLote,
  DadosProduto,
} from '../../shared/types';
import { Database } from '../database/PrismaClient';

const selecaoLote = {
  id: true,
  codigo: true,
  validade: true,
  quantidade: true,
  produtoId: true,
  ativo: true,
  baixadoEm: true,
  motivoBaixa: true,
  criadoEm: true,
  atualizadoEm: true,
} satisfies Prisma.LoteSelect;

const selecaoLoteComProduto = {
  ...selecaoLote,
  produto: { select: { id: true, nome: true, categoria: true } },
} satisfies Prisma.LoteSelect;

const selecaoProdutoBase = {
  id: true,
  nome: true,
  categoria: true,
  estoqueMinimo: true,
  alertaEstoque: true,
  precoBrl: true,
  ativo: true,
  inativadoEm: true,
  motivoInativacao: true,
} satisfies Prisma.ProdutoSelect;

const selecaoProduto = {
  ...selecaoProdutoBase,
  lotes: {
    select: selecaoLote,
    orderBy: [{ validade: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.ProdutoSelect;

type RegistroLote = Prisma.LoteGetPayload<{ select: typeof selecaoLote }>;
type RegistroLoteComProduto = Prisma.LoteGetPayload<{ select: typeof selecaoLoteComProduto }>;
type RegistroProduto = Prisma.ProdutoGetPayload<{ select: typeof selecaoProdutoBase }>;
type RegistroProdutoComLotes = Prisma.ProdutoGetPayload<{ select: typeof selecaoProduto }>;

/** Espelho persistido do contrato: Decimal e datas ainda não cruzaram a ponte IPC. */
export interface LotePersistido {
  id: number;
  codigo: string;
  validade: Date;
  quantidade: number;
  produtoId: number;
  produto?: { id: number; nome: string; categoria: string };
  ativo: boolean;
  baixadoEm: Date | null;
  motivoBaixa: string | null;
  criadoEm: Date;
  atualizadoEm: Date;
}

export interface ProdutoPersistido {
  id: number;
  nome: string;
  categoria: string;
  estoqueMinimo: number;
  alertaEstoque: boolean;
  precoBrl: Prisma.Decimal;
  ativo: boolean;
  inativadoEm: Date | null;
  motivoInativacao: string | null;
  lotes: LotePersistido[];
}

/** Porta de persistência: o service não conhece Prisma nem Electron. */
export interface EstoqueRepositorio {
  listarProdutos(): Promise<ProdutoPersistido[]>;
  listarLotes(): Promise<LotePersistido[]>;
  criarProduto(dados: DadosProduto): Promise<ProdutoPersistido>;
  criarLote(dados: DadosLote): Promise<LotePersistido>;
  produtoExiste(id: number): Promise<boolean>;
  buscarProdutoPorId(id: number): Promise<ProdutoPersistido | null>;
  loteComCodigoExiste(codigo: string, ignorarId?: number): Promise<boolean>;
  buscarLotePorId(id: number): Promise<LotePersistido | null>;
  atualizarProduto(dados: DadosAtualizacaoProduto): Promise<ProdutoPersistido>;
  inativarProduto(
    id: number,
    responsavelId: number,
    agora: Date,
    motivo: string
  ): Promise<ProdutoPersistido | null>;
  contarLotesAtivos(produtoId: number): Promise<number>;
  atualizarLote(dados: DadosAtualizacaoLote): Promise<LotePersistido>;
  baixarLote(
    id: number,
    responsavelId: number,
    agora: Date,
    motivo: string
  ): Promise<LotePersistido | null>;
}

function paraLote(registro: RegistroLote): LotePersistido {
  return {
    id: registro.id,
    codigo: registro.codigo,
    validade: registro.validade,
    quantidade: registro.quantidade,
    produtoId: registro.produtoId,
    ativo: registro.ativo,
    baixadoEm: registro.baixadoEm,
    motivoBaixa: registro.motivoBaixa,
    criadoEm: registro.criadoEm,
    atualizadoEm: registro.atualizadoEm,
  };
}

function paraLoteComProduto(registro: RegistroLoteComProduto): LotePersistido {
  return {
    ...paraLote(registro),
    produto: registro.produto,
  };
}

function paraProduto(registro: RegistroProduto): ProdutoPersistido {
  return {
    id: registro.id,
    nome: registro.nome,
    categoria: registro.categoria,
    estoqueMinimo: registro.estoqueMinimo,
    alertaEstoque: registro.alertaEstoque,
    precoBrl: registro.precoBrl,
    ativo: registro.ativo,
    inativadoEm: registro.inativadoEm,
    motivoInativacao: registro.motivoInativacao,
    lotes: [],
  };
}

function paraProdutoComLotes(registro: RegistroProdutoComLotes): ProdutoPersistido {
  return {
    ...paraProduto(registro),
    lotes: registro.lotes.map(paraLote),
  };
}

/** `@db.Date`/DATETIME ancorados em UTC: mesma convenção do criar lote. */
function dataCivil(valor: string): Date {
  return new Date(`${valor}T00:00:00.000Z`);
}

export class EstoqueRepository implements EstoqueRepositorio {
  private prisma = Database.getInstance();

  async listarProdutos(): Promise<ProdutoPersistido[]> {
    const registros = await this.prisma.produto.findMany({
      select: selecaoProduto,
      orderBy: { id: 'asc' },
      take: LIMITE_LISTAGEM_ESTOQUE,
    });
    return registros.map(paraProdutoComLotes);
  }

  async listarLotes(): Promise<LotePersistido[]> {
    const registros = await this.prisma.lote.findMany({
      select: selecaoLoteComProduto,
      orderBy: [{ validade: 'asc' }, { id: 'asc' }],
      take: LIMITE_LISTAGEM_ESTOQUE,
    });
    return registros.map(paraLoteComProduto);
  }

  async criarProduto(dados: DadosProduto): Promise<ProdutoPersistido> {
    const registro = await this.prisma.produto.create({
      data: {
        nome: dados.nome.trim(),
        categoria: dados.categoria.trim(),
        estoqueMinimo: dados.estoqueMinimo,
        alertaEstoque: dados.alertaEstoque,
        precoBrl: new Prisma.Decimal(dados.precoBrl),
      },
      select: selecaoProduto,
    });
    return paraProdutoComLotes(registro);
  }

  async criarLote(dados: DadosLote): Promise<LotePersistido> {
    const registro = await this.prisma.lote.create({
      data: {
        produtoId: dados.produtoId,
        codigo: dados.codigo.trim(),
        validade: dataCivil(dados.validade),
        quantidade: dados.quantidade,
      },
      select: selecaoLoteComProduto,
    });
    return paraLoteComProduto(registro);
  }

  async produtoExiste(id: number): Promise<boolean> {
    return (await this.prisma.produto.count({ where: { id } })) > 0;
  }

  async buscarProdutoPorId(id: number): Promise<ProdutoPersistido | null> {
    const registro = await this.prisma.produto.findUnique({
      where: { id },
      select: selecaoProdutoBase,
    });
    return registro === null ? null : paraProduto(registro);
  }

  async loteComCodigoExiste(codigo: string, ignorarId?: number): Promise<boolean> {
    return (
      (await this.prisma.lote.count({
        where: { codigo, ...(ignorarId === undefined ? {} : { id: { not: ignorarId } }) },
      })) > 0
    );
  }

  async buscarLotePorId(id: number): Promise<LotePersistido | null> {
    const registro = await this.prisma.lote.findUnique({
      where: { id },
      select: selecaoLoteComProduto,
    });
    return registro === null ? null : paraLoteComProduto(registro);
  }

  async atualizarProduto(dados: DadosAtualizacaoProduto): Promise<ProdutoPersistido> {
    const registro = await this.prisma.produto.update({
      where: { id: dados.id },
      data: {
        nome: dados.nome.trim(),
        categoria: dados.categoria.trim(),
        estoqueMinimo: dados.estoqueMinimo,
        alertaEstoque: dados.alertaEstoque,
        precoBrl: new Prisma.Decimal(dados.precoBrl),
      },
      select: selecaoProduto,
    });
    return paraProdutoComLotes(registro);
  }

  async inativarProduto(
    id: number,
    responsavelId: number,
    agora: Date,
    motivo: string
  ): Promise<ProdutoPersistido | null> {
    const resultado = await this.prisma.produto.updateMany({
      where: { id, ativo: true },
      data: {
        ativo: false,
        inativadoPorId: responsavelId,
        inativadoEm: agora,
        motivoInativacao: motivo.trim(),
      },
    });
    if (resultado.count !== 1) return null;
    return this.buscarProdutoPorId(id);
  }

  contarLotesAtivos(produtoId: number): Promise<number> {
    return this.prisma.lote.count({ where: { produtoId, ativo: true } });
  }

  async atualizarLote(dados: DadosAtualizacaoLote): Promise<LotePersistido> {
    const registro = await this.prisma.lote.update({
      where: { id: dados.id },
      data: {
        produtoId: dados.produtoId,
        codigo: dados.codigo.trim(),
        validade: dataCivil(dados.validade),
        quantidade: dados.quantidade,
      },
      select: selecaoLoteComProduto,
    });
    return paraLoteComProduto(registro);
  }

  async baixarLote(
    id: number,
    responsavelId: number,
    agora: Date,
    motivo: string
  ): Promise<LotePersistido | null> {
    const resultado = await this.prisma.lote.updateMany({
      where: { id, ativo: true },
      data: {
        ativo: false,
        baixadoPorId: responsavelId,
        baixadoEm: agora,
        motivoBaixa: motivo.trim(),
      },
    });
    if (resultado.count !== 1) return null;
    return this.buscarLotePorId(id);
  }
}
