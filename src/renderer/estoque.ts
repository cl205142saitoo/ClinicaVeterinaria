/** Estoque e lotes: consulta liberada a todos os perfis e cadastro só de ADMIN. */

import { ESTOQUE_ALERTA_VALIDADE_DIAS } from '../shared/constants';
import { dataCivilClinica } from '../shared/datas';
import { isAdmin, obterUsuario } from './auth';
import type { DadosLote, DadosProduto, Lote, Produto } from './types';
import {
  criarCelula,
  exigir,
  focarPrimeiroInvalido,
  limparValidacao,
  mensagemErro,
  mostrarToast,
  obrigatorio,
  setCarregando,
} from './ui';

const FORMATO_DATA_CIVIL = /^\d{4}-\d{2}-\d{2}$/;
const COLUNAS_PRODUTOS = 6;
const COLUNAS_LOTES = 5;
const NOME_MAXIMO = 120;
const CATEGORIA_MAXIMA = 80;
const CODIGO_LOTE_MAXIMO = 64;

interface Situacao {
  readonly texto: string;
  readonly classe: string;
}

/** Response antiga nunca deve sobrescrever uma carga mais recente. */
let sequenciaCarregamento = 0;

function formatarMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function textoOuTraco(valor: string | null | undefined): string {
  const texto = valor?.trim();
  return texto ? texto : '—';
}

/** Data civil (AAAA-MM-DD) em UTC, sem deslocar o dia por fuso horário. */
function formatarDataCivil(valor: string | null | undefined): string {
  if (!valor || !FORMATO_DATA_CIVIL.test(valor)) return '—';
  const data = new Date(`${valor}T00:00:00.000Z`);
  return Number.isNaN(data.getTime()) ? '—' : data.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function hojeCivil(): string {
  return dataCivilClinica(new Date());
}

/** Soma os dias de alerta em UTC para manter a comparação das datas como strings. */
function limiteAlerta(): string {
  const [ano, mes, dia] = hojeCivil().split('-').map(Number);
  const limite = new Date(Date.UTC(ano, mes - 1, dia + ESTOQUE_ALERTA_VALIDADE_DIAS));
  return limite.toISOString().slice(0, 10);
}

function situacaoLote(validade: string, hoje: string, limite: string): Situacao {
  if (validade < hoje) return { texto: 'Vencido', classe: 'text-bg-danger' };
  if (validade <= limite) return { texto: 'Vence em breve', classe: 'text-bg-warning' };
  return { texto: 'Válido', classe: 'text-bg-success' };
}

function situacaoProduto(total: number, estoqueMinimo: number): Situacao {
  if (total <= estoqueMinimo) {
    return { texto: 'Estoque mínimo atingido', classe: 'text-bg-warning' };
  }
  return { texto: 'Estoque OK', classe: 'text-bg-success' };
}

function criarBadge(situacao: Situacao): HTMLSpanElement {
  const badge = document.createElement('span');
  badge.className = `badge ${situacao.classe}`;
  badge.textContent = situacao.texto;
  return badge;
}

function linhaMensagem(
  texto: string,
  colunas: number,
  classe = 'text-center text-muted fst-italic py-4'
): HTMLTableRowElement {
  const linha = document.createElement('tr');
  const celula = criarCelula(texto, classe);
  celula.colSpan = colunas;
  linha.append(celula);
  return linha;
}

function atualizarResumo(seletor: string, quantidade: number, singular: string, plural: string): void {
  const resumo = obrigatorio<HTMLElement>(seletor);
  resumo.hidden = quantidade === 0;
  resumo.textContent = quantidade === 0 ? '' : `${quantidade} ${quantidade === 1 ? singular : plural}`;
}

/** Célula de lotes do produto: total de unidades e uma linha por lote. */
function celulaLotes(lotes: Lote[], total: number): HTMLTableCellElement {
  const celula = criarCelula('', 'small');
  const resumo = document.createElement('div');
  resumo.className = 'fw-semibold';
  resumo.textContent = `${total} un.`;
  celula.append(resumo);

  if (lotes.length === 0) {
    const vazio = document.createElement('div');
    vazio.className = 'text-muted';
    vazio.textContent = '—';
    celula.append(vazio);
    return celula;
  }

  for (const lote of lotes) {
    const item = document.createElement('div');
    item.className = 'text-break';
    item.textContent = `${lote.codigo} — ${formatarDataCivil(lote.validade)} — ${lote.quantidade} un.`;
    celula.append(item);
  }
  return celula;
}

function celulaSituacao(situacao: Situacao): HTMLTableCellElement {
  const celula = document.createElement('td');
  celula.append(criarBadge(situacao));
  return celula;
}

function renderizarProdutos(produtos: Produto[]): void {
  const corpo = obrigatorio<HTMLTableSectionElement>('#tbProdutos');
  corpo.replaceChildren();
  atualizarResumo('#esResumoProdutos', produtos.length, 'produto', 'produtos');

  if (produtos.length === 0) {
    corpo.append(linhaMensagem('Nenhum produto cadastrado.', COLUNAS_PRODUTOS));
    return;
  }

  for (const produto of produtos) {
    const total = produto.lotes.reduce((soma, lote) => soma + lote.quantidade, 0);
    const linha = document.createElement('tr');
    linha.append(
      criarCelula(textoOuTraco(produto.nome), 'text-break small'),
      criarCelula(textoOuTraco(produto.categoria), 'text-break small'),
      criarCelula(formatarMoeda(produto.precoBrl), 'text-nowrap small'),
      criarCelula(String(produto.estoqueMinimo), 'text-nowrap small'),
      celulaLotes(produto.lotes, total),
      celulaSituacao(situacaoProduto(total, produto.estoqueMinimo))
    );
    corpo.append(linha);
  }
}

function renderizarLotes(lotes: Lote[]): void {
  const corpo = obrigatorio<HTMLTableSectionElement>('#tbLotes');
  corpo.replaceChildren();
  atualizarResumo('#esResumoLotes', lotes.length, 'lote', 'lotes');

  if (lotes.length === 0) {
    corpo.append(linhaMensagem('Nenhum lote cadastrado.', COLUNAS_LOTES));
    return;
  }

  const hoje = hojeCivil();
  const limite = limiteAlerta();
  for (const lote of lotes) {
    const linha = document.createElement('tr');
    linha.append(
      criarCelula(textoOuTraco(lote.codigo), 'text-break small'),
      criarCelula(textoOuTraco(lote.produto?.nome), 'text-break small'),
      criarCelula(formatarDataCivil(lote.validade), 'text-nowrap small'),
      criarCelula(`${lote.quantidade} un.`, 'text-nowrap small'),
      celulaSituacao(situacaoLote(lote.validade, hoje, limite))
    );
    corpo.append(linha);
  }
}

/** Preenche o seletor do formulário de lote preservando a seleção atual. */
function preencherSelectProdutos(produtos: Produto[]): void {
  const select = obrigatorio<HTMLSelectElement>('#esLoteProduto');
  const anterior = select.value;
  select.replaceChildren();

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Selecione um produto…';
  select.append(placeholder);

  for (const produto of produtos) {
    const opcao = document.createElement('option');
    opcao.value = String(produto.id);
    opcao.textContent = `${produto.nome} — ${produto.categoria}`;
    select.append(opcao);
  }

  select.value = produtos.some((produto) => String(produto.id) === anterior) ? anterior : '';
}

function renderizarVazio(): void {
  preencherSelectProdutos([]);
  renderizarProdutos([]);
  renderizarLotes([]);
}

/** Usabilidade apenas: o backend continua sendo a autoridade final. */
function aplicarPermissoesEstoque(): void {
  const aviso = obrigatorio<HTMLElement>('#esAvisoLeitura');
  const area = obrigatorio<HTMLElement>('#esAreaEdicao');
  const usuario = obterUsuario();
  const podeEditar = usuario !== null && isAdmin();

  aviso.hidden = usuario === null || podeEditar;
  area.hidden = !podeEditar;
}

/** Recarrega listagens e resumos; ignora respostas de cargas anteriores. */
export async function carregarEstoque(): Promise<void> {
  aplicarPermissoesEstoque();

  const sequencia = sequenciaCarregamento + 1;
  sequenciaCarregamento = sequencia;
  const corpoProdutos = obrigatorio<HTMLTableSectionElement>('#tbProdutos');
  const corpoLotes = obrigatorio<HTMLTableSectionElement>('#tbLotes');
  corpoProdutos.setAttribute('aria-busy', 'true');
  corpoLotes.setAttribute('aria-busy', 'true');
  corpoProdutos.replaceChildren(linhaMensagem('Carregando produtos…', COLUNAS_PRODUTOS));
  corpoLotes.replaceChildren(linhaMensagem('Carregando lotes…', COLUNAS_LOTES));

  try {
    const [produtos, lotes] = await Promise.all([
      window.api.estoqueProdutosListar(),
      window.api.estoqueLotesListar(),
    ]);
    if (sequencia !== sequenciaCarregamento) return;

    preencherSelectProdutos(produtos);
    renderizarProdutos(produtos);
    renderizarLotes(lotes);
  } catch (erro) {
    if (sequencia !== sequenciaCarregamento) return;
    corpoProdutos.replaceChildren(
      linhaMensagem('Não foi possível carregar os produtos.', COLUNAS_PRODUTOS, 'text-center text-danger py-4')
    );
    corpoLotes.replaceChildren(
      linhaMensagem('Não foi possível carregar os lotes.', COLUNAS_LOTES, 'text-center text-danger py-4')
    );
    obrigatorio<HTMLElement>('#esResumoProdutos').hidden = true;
    obrigatorio<HTMLElement>('#esResumoLotes').hidden = true;
    mostrarToast(mensagemErro(erro), 'erro');
  } finally {
    if (sequencia === sequenciaCarregamento) {
      corpoProdutos.setAttribute('aria-busy', 'false');
      corpoLotes.setAttribute('aria-busy', 'false');
    }
  }
}

function dataCivilValida(valor: string): boolean {
  if (!FORMATO_DATA_CIVIL.test(valor)) return false;
  const [ano, mes, dia] = valor.split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
}

function inteiroOuNull(valor: string): number | null {
  const texto = valor.trim();
  if (!/^\d+$/.test(texto)) return null;
  const numero = Number(texto);
  return Number.isFinite(numero) && numero >= 0 ? numero : null;
}

/** Aceita vírgula decimal e no máximo duas casas após o separador. */
function precoOuNull(valor: string): number | null {
  const texto = valor.trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(texto)) return null;
  const numero = Number(texto);
  return Number.isFinite(numero) && numero >= 0 ? numero : null;
}

function limparCamposProduto(): void {
  const formulario = obrigatorio<HTMLFormElement>('#formProduto');
  formulario.reset();
  limparValidacao(formulario);
}

/** Limpa o formulário de lote sem perder o produto selecionado. */
function limparCamposLote(): void {
  const formulario = obrigatorio<HTMLFormElement>('#formLote');
  const produto = obrigatorio<HTMLSelectElement>('#esLoteProduto');
  const anterior = produto.value;
  formulario.reset();
  produto.value = anterior;
  limparValidacao(formulario);
}

async function salvarProduto(evento: Event): Promise<void> {
  evento.preventDefault();
  const formulario = obrigatorio<HTMLFormElement>('#formProduto');
  const botao = obrigatorio<HTMLButtonElement>('#btnSalvarProduto');
  limparValidacao(formulario);

  if (obterUsuario() === null || !isAdmin()) {
    mostrarToast('Sua sessão não permite cadastrar produtos e lotes.', 'erro');
    return;
  }

  const nome = obrigatorio<HTMLInputElement>('#esNome');
  const categoria = obrigatorio<HTMLInputElement>('#esCategoria');
  const estoqueMinimoCampo = obrigatorio<HTMLInputElement>('#esEstoqueMinimo');
  const precoCampo = obrigatorio<HTMLInputElement>('#esPreco');

  const nomeValido = exigir(
    nome,
    nome.value.trim().length >= 2 && nome.value.trim().length <= NOME_MAXIMO,
    `Informe o nome do produto (de 2 a ${NOME_MAXIMO} caracteres).`
  );
  const categoriaValida = exigir(
    categoria,
    categoria.value.trim().length >= 1 && categoria.value.trim().length <= CATEGORIA_MAXIMA,
    `Informe a categoria (até ${CATEGORIA_MAXIMA} caracteres).`
  );

  const estoqueMinimo = inteiroOuNull(estoqueMinimoCampo.value);
  const estoqueValido = exigir(
    estoqueMinimoCampo,
    estoqueMinimo !== null && estoqueMinimo >= 0,
    'Informe o estoque mínimo como número inteiro igual ou maior que zero.'
  );

  const precoBrl = precoOuNull(precoCampo.value);
  const precoValido = exigir(
    precoCampo,
    precoBrl !== null,
    'Informe um preço válido, com até duas casas decimais.'
  );

  if (!nomeValido || !categoriaValida || !estoqueValido || !precoValido || estoqueMinimo === null || precoBrl === null) {
    focarPrimeiroInvalido(formulario);
    return;
  }

  const dados: DadosProduto = {
    nome: nome.value.trim(),
    categoria: categoria.value.trim(),
    estoqueMinimo,
    precoBrl,
  };

  setCarregando(botao, true, 'Salvando…');
  try {
    await window.api.estoqueProdutosCriar(dados);
    mostrarToast('Produto cadastrado com sucesso.', 'sucesso');
    limparCamposProduto();
    await carregarEstoque();
  } catch (erro) {
    mostrarToast(mensagemErro(erro), 'erro');
  } finally {
    setCarregando(botao, false);
  }
}

async function salvarLote(evento: Event): Promise<void> {
  evento.preventDefault();
  const formulario = obrigatorio<HTMLFormElement>('#formLote');
  const botao = obrigatorio<HTMLButtonElement>('#btnSalvarLote');
  limparValidacao(formulario);

  if (obterUsuario() === null || !isAdmin()) {
    mostrarToast('Sua sessão não permite cadastrar produtos e lotes.', 'erro');
    return;
  }

  const produto = obrigatorio<HTMLSelectElement>('#esLoteProduto');
  const codigo = obrigatorio<HTMLInputElement>('#esLoteCodigo');
  const validade = obrigatorio<HTMLInputElement>('#esLoteValidade');
  const quantidadeCampo = obrigatorio<HTMLInputElement>('#esLoteQuantidade');

  const produtoValor = produto.value;
  const produtoId = produtoValor === '' ? null : Number(produtoValor);
  const produtoValido = exigir(
    produto,
    produtoId !== null && Number.isInteger(produtoId) && produtoId > 0,
    'Selecione um produto antes de cadastrar o lote.'
  );

  const codigoValido = exigir(
    codigo,
    codigo.value.trim().length >= 1 && codigo.value.trim().length <= CODIGO_LOTE_MAXIMO,
    `Informe o código do lote (até ${CODIGO_LOTE_MAXIMO} caracteres).`
  );

  const validadeTexto = validade.value.trim();
  const validadeValida = exigir(
    validade,
    dataCivilValida(validadeTexto),
    'Informe uma data de validade válida (AAAA-MM-DD).'
  );

  const quantidade = inteiroOuNull(quantidadeCampo.value);
  const quantidadeValida = exigir(
    quantidadeCampo,
    quantidade !== null && quantidade > 0,
    'Informe a quantidade como número inteiro maior que zero.'
  );

  if (
    !produtoValido ||
    !codigoValido ||
    !validadeValida ||
    !quantidadeValida ||
    produtoId === null ||
    quantidade === null
  ) {
    focarPrimeiroInvalido(formulario);
    return;
  }

  const dados: DadosLote = {
    produtoId,
    codigo: codigo.value.trim(),
    validade: validadeTexto,
    quantidade,
  };

  setCarregando(botao, true, 'Salvando…');
  try {
    await window.api.estoqueLotesCriar(dados);
    mostrarToast('Lote cadastrado com sucesso.', 'sucesso');
    limparCamposLote();
    await carregarEstoque();
  } catch (erro) {
    mostrarToast(mensagemErro(erro), 'erro');
  } finally {
    setCarregando(botao, false);
  }
}

function configurarEventos(): void {
  obrigatorio<HTMLFormElement>('#formProduto').addEventListener('submit', (evento) => {
    void salvarProduto(evento);
  });
  obrigatorio<HTMLFormElement>('#formLote').addEventListener('submit', (evento) => {
    void salvarLote(evento);
  });
}

/** Liga eventos, aplica permissões, renderiza vazio e carrega se já houver sessão. */
export async function iniciarEstoque(): Promise<void> {
  configurarEventos();
  aplicarPermissoesEstoque();
  renderizarVazio();
  limparCamposProduto();
  limparCamposLote();

  // Antes do login não há sessão: `carregarTudo()` faz a carga inicial autorizada.
  if (obterUsuario() === null) return;
  await carregarEstoque();
}

/** Limpa estado, seleção e mensagens ao sair; ignora respostas antigas. */
export function limparEstoque(): void {
  sequenciaCarregamento += 1;
  renderizarVazio();
  limparCamposProduto();
  limparCamposLote();
  setCarregando(obrigatorio<HTMLButtonElement>('#btnSalvarProduto'), false);
  setCarregando(obrigatorio<HTMLButtonElement>('#btnSalvarLote'), false);
  obrigatorio<HTMLTableSectionElement>('#tbProdutos').setAttribute('aria-busy', 'false');
  obrigatorio<HTMLTableSectionElement>('#tbLotes').setAttribute('aria-busy', 'false');
  obrigatorio<HTMLElement>('#esAvisoLeitura').hidden = true;
  obrigatorio<HTMLElement>('#esAreaEdicao').hidden = true;
}
