import { Prisma } from '@prisma/client';
import { ErroAplicacao } from '../../shared/errors';
import type {
  ItemOrcamentoTipo,
  OrcamentoStatus,
} from '../../shared/types';
import { Database } from '../database/PrismaClient';

const LIMITE_LISTAGEM_ORCAMENTOS = 200;

const selecaoItem = {
  id: true,
  orcamentoId: true,
  tipo: true,
  produtoId: true,
  tabelaPrecoId: true,
  descricao: true,
  quantidade: true,
  precoUnitario: true,
  subtotal: true,
} satisfies Prisma.OrcamentoItemSelect;

const selecaoOrcamento = {
  id: true,
  numero: true,
  clienteId: true,
  cliente: { select: { nome: true } },
  petId: true,
  pet: { select: { nome: true } },
  status: true,
  validade: true,
  desconto: true,
  observacoes: true,
  canceladoEm: true,
  motivoCancelamento: true,
  criadoEm: true,
  itens: { select: selecaoItem, orderBy: { id: 'asc' } },
} satisfies Prisma.OrcamentoSelect;

type RegistroItem = Prisma.OrcamentoItemGetPayload<{ select: typeof selecaoItem }>;
type RegistroOrcamento = Prisma.OrcamentoGetPayload<{ select: typeof selecaoOrcamento }>;

/** Espelhos persistidos: decimais e datas civis ainda não converteram para o DTO. */
export interface ItemOrcamentoPersistido {
  id: number;
  orcamentoId: number;
  tipo: ItemOrcamentoTipo;
  produtoId: number | null;
  tabelaPrecoId: number | null;
  descricao: string;
  quantidade: number;
  precoUnitario: Prisma.Decimal;
  subtotal: Prisma.Decimal;
}

export interface OrcamentoPersistido {
  id: number;
  numero: string;
  clienteId: number;
  clienteNome: string;
  petId: number | null;
  petNome: string | null;
  status: OrcamentoStatus;
  validade: Date;
  desconto: Prisma.Decimal;
  observacoes: string | null;
  canceladoEm: Date | null;
  motivoCancelamento: string | null;
  criadoEm: Date;
  itens: ItemOrcamentoPersistido[];
}

export interface ItemOrcamentoBanco {
  tipo: ItemOrcamentoTipo;
  produtoId: number | null;
  tabelaPrecoId: number | null;
  descricao: string;
  quantidade: number;
  precoUnitario: number;
  subtotal: number;
}

export interface DadosCriacaoOrcamentoBanco {
  /** YYYY-MM: prefixo do número sequencial. */
  mes: string;
  clienteId: number;
  petId: number | null;
  validade: string;
  desconto: number;
  observacoes: string | null;
  itens: ItemOrcamentoBanco[];
  criadoPorId: number;
}

export interface DadosAtualizacaoOrcamentoBanco {
  id: number;
  clienteId: number;
  petId: number | null;
  validade: string;
  desconto: number;
  observacoes: string | null;
  itens: ItemOrcamentoBanco[];
}

export interface OrcamentoRepositorio {
  listar(): Promise<OrcamentoPersistido[]>;
  buscarPorId(id: number): Promise<OrcamentoPersistido | null>;
  clienteExiste(id: number): Promise<boolean>;
  petExiste(id: number, clienteId?: number): Promise<boolean>;
  produtoAtivoExiste(id: number): Promise<boolean>;
  tabelaPrecoAtivaExiste(id: number): Promise<boolean>;
  criar(dados: DadosCriacaoOrcamentoBanco): Promise<OrcamentoPersistido>;
  atualizar(dados: DadosAtualizacaoOrcamentoBanco): Promise<OrcamentoPersistido>;
  definirStatus(id: number, status: 'APROVADO' | 'REPROVADO'): Promise<OrcamentoPersistido | null>;
  cancelar(
    id: number,
    responsavelId: number,
    agora: Date,
    motivo: string
  ): Promise<OrcamentoPersistido | null>;
}

function paraItem(registro: RegistroItem): ItemOrcamentoPersistido {
  return {
    id: registro.id,
    orcamentoId: registro.orcamentoId,
    tipo: registro.tipo as ItemOrcamentoTipo,
    produtoId: registro.produtoId,
    tabelaPrecoId: registro.tabelaPrecoId,
    descricao: registro.descricao,
    quantidade: registro.quantidade,
    precoUnitario: registro.precoUnitario,
    subtotal: registro.subtotal,
  };
}

function paraOrcamento(registro: RegistroOrcamento): OrcamentoPersistido {
  return {
    id: registro.id,
    numero: registro.numero,
    clienteId: registro.clienteId,
    clienteNome: registro.cliente.nome,
    petId: registro.petId,
    petNome: registro.pet?.nome ?? null,
    status: registro.status as OrcamentoStatus,
    validade: registro.validade,
    desconto: registro.desconto,
    observacoes: registro.observacoes,
    canceladoEm: registro.canceladoEm,
    motivoCancelamento: registro.motivoCancelamento,
    criadoEm: registro.criadoEm,
    itens: registro.itens.map(paraItem),
  };
}

/** `@db.Date` é data civil: ancorá-la em UTC evita deslocamento por fuso. */
function dataCivil(valor: string): Date {
  return new Date(`${valor}T00:00:00.000Z`);
}

function dadosItens(itens: ItemOrcamentoBanco[]) {
  return itens.map((item) => ({
    tipo: item.tipo,
    produtoId: item.produtoId,
    tabelaPrecoId: item.tabelaPrecoId,
    descricao: item.descricao.trim(),
    quantidade: item.quantidade,
    precoUnitario: new Prisma.Decimal(item.precoUnitario),
    subtotal: new Prisma.Decimal(item.subtotal),
  }));
}

export class OrcamentoRepository implements OrcamentoRepositorio {
  private prisma = Database.getInstance();

  async listar(): Promise<OrcamentoPersistido[]> {
    const registros = await this.prisma.orcamento.findMany({
      select: selecaoOrcamento,
      orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
      take: LIMITE_LISTAGEM_ORCAMENTOS,
    });
    return registros.map(paraOrcamento);
  }

  async buscarPorId(id: number): Promise<OrcamentoPersistido | null> {
    const registro = await this.prisma.orcamento.findUnique({
      where: { id },
      select: selecaoOrcamento,
    });
    return registro === null ? null : paraOrcamento(registro);
  }

  async clienteExiste(id: number): Promise<boolean> {
    return (await this.prisma.cliente.count({ where: { id, ativo: true } })) > 0;
  }

  async petExiste(id: number, clienteId?: number): Promise<boolean> {
    return (
      (await this.prisma.pet.count({
        where: { id, ativo: true, ...(clienteId === undefined ? {} : { clienteId }) },
      })) > 0
    );
  }

  async produtoAtivoExiste(id: number): Promise<boolean> {
    return (await this.prisma.produto.count({ where: { id, ativo: true } })) > 0;
  }

  async tabelaPrecoAtivaExiste(id: number): Promise<boolean> {
    return (await this.prisma.tabelaPreco.count({ where: { id, ativo: true } })) > 0;
  }

  /**
   * Gera `ORC-YYYYMM-####` dentro da transação e répete em caso de colisão
   * concorrente do índice único. A consulta ordenada por texto funciona porque
   * o sufixo tem sempre quatro dígitos.
   */
  async criar(dados: DadosCriacaoOrcamentoBanco): Promise<OrcamentoPersistido> {
    const prefixo = `ORC-${dados.mes}-`;
    for (let tentativa = 0; tentativa < 5; tentativa += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const ultimo = await tx.orcamento.findFirst({
            where: { numero: { startsWith: prefixo } },
            orderBy: { numero: 'desc' },
            select: { numero: true },
          });
          const sequencia = ultimo === null ? 1 : Number(ultimo.numero.slice(prefixo.length)) + 1;
          if (!Number.isInteger(sequencia) || sequencia > 9999) {
            throw new ErroAplicacao(
              'Não foi possível gerar um número de orçamento para este mês. Procure o administrador.'
            );
          }
          const registro = await tx.orcamento.create({
            data: {
              numero: `${prefixo}${String(sequencia).padStart(4, '0')}`,
              clienteId: dados.clienteId,
              petId: dados.petId,
              status: 'PENDENTE',
              validade: dataCivil(dados.validade),
              desconto: new Prisma.Decimal(dados.desconto),
              observacoes: dados.observacoes,
              criadoPorId: dados.criadoPorId,
              itens: { create: dadosItens(dados.itens) },
            },
            select: selecaoOrcamento,
          });
          return paraOrcamento(registro);
        });
      } catch (erro) {
        if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
          continue;
        }
        throw erro;
      }
    }
    throw new ErroAplicacao(
      'Não foi possível gerar um número único de orçamento. Tente novamente.'
    );
  }

  /** Número, autor e situação atual são preservados; os itens são recriados. */
  async atualizar(dados: DadosAtualizacaoOrcamentoBanco): Promise<OrcamentoPersistido> {
    return this.prisma.$transaction(async (tx) => {
      await tx.orcamentoItem.deleteMany({ where: { orcamentoId: dados.id } });
      const registro = await tx.orcamento.update({
        where: { id: dados.id },
        data: {
          clienteId: dados.clienteId,
          petId: dados.petId,
          validade: dataCivil(dados.validade),
          desconto: new Prisma.Decimal(dados.desconto),
          observacoes: dados.observacoes,
          itens: { create: dadosItens(dados.itens) },
        },
        select: selecaoOrcamento,
      });
      return paraOrcamento(registro);
    });
  }

  async definirStatus(
    id: number,
    status: 'APROVADO' | 'REPROVADO'
  ): Promise<OrcamentoPersistido | null> {
    const resultado = await this.prisma.orcamento.updateMany({
      where: { id, status: 'PENDENTE' },
      data: { status },
    });
    if (resultado.count !== 1) return null;
    return this.buscarPorId(id);
  }

  async cancelar(
    id: number,
    responsavelId: number,
    agora: Date,
    motivo: string
  ): Promise<OrcamentoPersistido | null> {
    const resultado = await this.prisma.orcamento.updateMany({
      where: { id, status: { not: 'CANCELADO' } },
      data: {
        status: 'CANCELADO',
        canceladoPorId: responsavelId,
        canceladoEm: agora,
        motivoCancelamento: motivo.trim(),
      },
    });
    if (resultado.count !== 1) return null;
    return this.buscarPorId(id);
  }
}
