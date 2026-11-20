import { ErroAplicacao } from '../../shared/errors';
import type {
  DadosLote,
  DadosProduto,
  Lote,
  Produto,
  Role,
  Usuario,
} from '../../shared/types';
import type {
  EstoqueRepositorio,
  LotePersistido,
  ProdutoPersistido,
} from '../repositories/EstoqueRepository';

const PERFIS_LEITURA: readonly Role[] = ['ADMIN', 'VETERINARIO', 'ATENDENTE'];

function exigirLeitura(usuario: Usuario): void {
  if (!PERFIS_LEITURA.includes(usuario.role)) {
    throw new ErroAplicacao('Perfil de acesso inválido para consultar o estoque. Procure o administrador.');
  }
}

function exigirAdmin(usuario: Usuario): void {
  if (usuario.role !== 'ADMIN') {
    throw new ErroAplicacao('Somente administradores podem cadastrar produtos e lotes.');
  }
}

function paraLote(lote: LotePersistido): Lote {
  const dados: Lote = {
    id: lote.id,
    codigo: lote.codigo,
    validade: lote.validade.toISOString().slice(0, 10),
    quantidade: lote.quantidade,
    produtoId: lote.produtoId,
    criadoEm: lote.criadoEm.toISOString(),
    atualizadoEm: lote.atualizadoEm.toISOString(),
  };
  if (lote.produto === undefined) return dados;

  return {
    ...dados,
    produto: {
      id: lote.produto.id,
      nome: lote.produto.nome,
      categoria: lote.produto.categoria,
    },
  };
}

function paraProduto(produto: ProdutoPersistido): Produto {
  return {
    id: produto.id,
    nome: produto.nome,
    categoria: produto.categoria,
    estoqueMinimo: produto.estoqueMinimo,
    precoBrl: produto.precoBrl.toNumber(),
    lotes: produto.lotes.map(paraLote),
  };
}

export class EstoqueService {
  constructor(private readonly repo: EstoqueRepositorio) {}

  async listarProdutos(usuario: Usuario): Promise<Produto[]> {
    exigirLeitura(usuario);
    const produtos = await this.repo.listarProdutos();
    return produtos.map(paraProduto);
  }

  async listarLotes(usuario: Usuario): Promise<Lote[]> {
    exigirLeitura(usuario);
    const lotes = await this.repo.listarLotes();
    return lotes.map(paraLote);
  }

  async criarProduto(dados: DadosProduto, usuario: Usuario): Promise<Produto> {
    exigirAdmin(usuario);
    const produto = await this.repo.criarProduto({
      nome: dados.nome.trim(),
      categoria: dados.categoria.trim(),
      estoqueMinimo: dados.estoqueMinimo,
      precoBrl: dados.precoBrl,
    });
    return paraProduto(produto);
  }

  async criarLote(dados: DadosLote, usuario: Usuario): Promise<Lote> {
    exigirAdmin(usuario);
    if (!(await this.repo.produtoExiste(dados.produtoId))) {
      throw new ErroAplicacao('Produto não encontrado. Confira o produto selecionado.');
    }

    const codigo = dados.codigo.trim();
    if (await this.repo.loteComCodigoExiste(codigo)) {
      throw new ErroAplicacao('Já existe um lote com este código. Informe um código diferente.');
    }

    const lote = await this.repo.criarLote({
      produtoId: dados.produtoId,
      codigo,
      validade: dados.validade,
      quantidade: dados.quantidade,
    });
    return paraLote(lote);
  }
}
