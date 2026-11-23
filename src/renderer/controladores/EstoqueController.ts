/** Estoque e lotes: consulta para todos os perfis; cadastro, edição e baixa só de ADMIN. */

import { ESTOQUE_ALERTA_PADRAO, ESTOQUE_ALERTA_VALIDADE_DIAS } from '../../shared/constants';
import { dataCivilClinica } from '../../shared/datas';
import type {
  CotacaoDolar,
  DadosAtualizacaoLote,
  DadosAtualizacaoProduto,
  DadosLote,
  DadosProduto,
  Lote,
  Produto,
} from '../types';
import {
  criarBadge,
  criarBotaoAcao,
  criarCelula,
  exigir,
  focarPrimeiroInvalido,
  formatarDataCivil,
  formatarDataHora,
  linhaMensagem,
  limparValidacao,
  mensagemErro,
  mostrarToast,
  obrigatorio,
  pedirMotivo,
  setCarregando,
  textoOuTraco,
} from '../ui';
import type { ContextoApp } from './contexto';

const FORMATO_DATA_CIVIL = /^\d{4}-\d{2}-\d{2}$/;
const COLUNAS_PRODUTOS = 8;
const COLUNAS_LOTES = 6;
const NOME_MAXIMO = 120;
const CATEGORIA_MAXIMA = 80;
const CODIGO_LOTE_MAXIMO = 64;

interface Situacao {
  readonly texto: string;
  readonly classe: string;
}

export class EstoqueController {
  private produtosVisiveis = new Map<number, Produto>();
  private lotesVisiveis = new Map<number, Lote>();
  private idProdutoEdicao: number | null = null;
  private idLoteEdicao: number | null = null;
  private sequenciaCarregamento = 0;
  private eventosLigados = false;
  private cotacao: CotacaoDolar | null = null;
  private cotacaoSequencia = 0;

  constructor(private readonly contexto: ContextoApp) {}

  iniciar(): void {
    if (!this.eventosLigados) {
      this.eventosLigados = true;
      this.configurarEventos();
    }
    this.aplicarPermissoes();
    this.renderizarVazio();
    this.limparCamposProduto();
    this.limparCamposLote();
    this.limparCotacao();
  }

  /** Recarrega listagens e resumos; ignora respostas de cargas anteriores. */
  async carregar(): Promise<void> {
    this.aplicarPermissoes();

    const sequencia = this.sequenciaCarregamento + 1;
    this.sequenciaCarregamento = sequencia;
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
      if (sequencia !== this.sequenciaCarregamento) return;

      this.preencherSelectProdutos(produtos);
      this.renderizarProdutos(produtos);
      this.renderizarLotes(lotes);
      if (this.cotacao === null) void this.atualizarCotacao();
    } catch (erro) {
      if (sequencia !== this.sequenciaCarregamento) return;
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
      if (sequencia === this.sequenciaCarregamento) {
        corpoProdutos.setAttribute('aria-busy', 'false');
        corpoLotes.setAttribute('aria-busy', 'false');
      }
    }
  }

  /** Limpa estado, seleção e mensagens ao sair; ignora respostas antigas. */
  limpar(): void {
    this.sequenciaCarregamento += 1;
    this.idProdutoEdicao = null;
    this.idLoteEdicao = null;
    this.produtosVisiveis = new Map();
    this.lotesVisiveis = new Map();
    this.renderizarVazio();
    this.limparCamposProduto();
    this.limparCamposLote();
    setCarregando(obrigatorio<HTMLButtonElement>('#btnSalvarProduto'), false);
    setCarregando(obrigatorio<HTMLButtonElement>('#btnSalvarLote'), false);
    obrigatorio<HTMLTableSectionElement>('#tbProdutos').setAttribute('aria-busy', 'false');
    obrigatorio<HTMLTableSectionElement>('#tbLotes').setAttribute('aria-busy', 'false');
    obrigatorio<HTMLElement>('#esAvisoLeitura').hidden = true;
    obrigatorio<HTMLElement>('#esAreaEdicao').hidden = true;
    this.limparCotacao();
  }

  private definirStatusCotacao(texto: string, erro = false): void {
    const status = obrigatorio<HTMLElement>('#inCotacaoStatus');
    status.textContent = texto;
    status.classList.toggle('text-danger', erro);
    status.classList.toggle('text-muted', !erro);
  }

  private limparCotacao(): void {
    this.cotacaoSequencia += 1;
    this.cotacao = null;
    obrigatorio<HTMLInputElement>('#inValorUsd').value = '';
    obrigatorio<HTMLInputElement>('#inValorBrlCalculado').value = '';
    this.definirStatusCotacao('Consulte a cotação para habilitar o cálculo.');
    setCarregando(obrigatorio<HTMLButtonElement>('#btnAtualizarCotacao'), false);
  }

  private recalcularBrl(): void {
    const texto = obrigatorio<HTMLInputElement>('#inValorUsd').value.trim().replace(',', '.');
    const calculado = obrigatorio<HTMLInputElement>('#inValorBrlCalculado');
    const usd = texto === '' ? null : Number(texto);

    if (usd === null || !Number.isFinite(usd) || usd < 0) {
      calculado.value = '';
      return;
    }
    if (this.cotacao === null) {
      calculado.value = '';
      this.definirStatusCotacao('Atualize a cotação para calcular o valor em reais.');
      return;
    }
    calculado.value = (usd * this.cotacao.valor).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  }

  /** Consulta a API na abertura da tela e sempre que o usuário pede atualização. */
  private async atualizarCotacao(): Promise<void> {
    const sequencia = this.cotacaoSequencia + 1;
    this.cotacaoSequencia = sequencia;
    const botao = obrigatorio<HTMLButtonElement>('#btnAtualizarCotacao');
    this.definirStatusCotacao('Consultando a cotação do dólar…');
    setCarregando(botao, true, 'Consultando…');

    try {
      const cotacao = await window.api.cotacaoDolar();
      if (sequencia !== this.cotacaoSequencia) return;
      if (!Number.isFinite(cotacao.valor) || cotacao.valor <= 0) {
        throw new Error('Cotação inválida');
      }
      this.cotacao = cotacao;
      this.definirStatusCotacao(
        `1 USD = R$ ${cotacao.valor.toFixed(4)} em ${formatarDataCivil(cotacao.dataReferencia)} · ` +
          `fonte: ${textoOuTraco(cotacao.fonte)} · consultado em ${formatarDataHora(cotacao.consultadoEm)}.`
      );
      this.recalcularBrl();
    } catch (erro) {
      if (sequencia !== this.cotacaoSequencia) return;
      this.cotacao = null;
      obrigatorio<HTMLInputElement>('#inValorBrlCalculado').value = '';
      this.definirStatusCotacao('Não foi possível obter a cotação do dólar. Tente novamente mais tarde.', true);
      mostrarToast(mensagemErro(erro), 'erro');
    } finally {
      if (sequencia === this.cotacaoSequencia) setCarregando(botao, false);
    }
  }

  private formatarMoeda(valor: number): string {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  private hojeCivil(): string {
    return dataCivilClinica(new Date());
  }

  /** Soma os dias de alerta em UTC para manter a comparação das datas como strings. */
  private limiteAlerta(): string {
    const [ano, mes, dia] = this.hojeCivil().split('-').map(Number);
    const limite = new Date(Date.UTC(ano, mes - 1, dia + ESTOQUE_ALERTA_VALIDADE_DIAS));
    return limite.toISOString().slice(0, 10);
  }

  private situacaoLote(validade: string, hoje: string, limite: string): Situacao {
    if (validade < hoje) return { texto: 'Vencido', classe: 'text-bg-danger' };
    if (validade <= limite) return { texto: 'Vence em breve', classe: 'text-bg-warning' };
    return { texto: 'Válido', classe: 'text-bg-success' };
  }

  private situacaoProduto(total: number, estoqueMinimo: number): Situacao {
    if (total <= estoqueMinimo) {
      return { texto: 'Estoque mínimo atingido', classe: 'text-bg-warning' };
    }
    return { texto: 'Estoque OK', classe: 'text-bg-success' };
  }

  /** A flag desliga somente o alerta de quantidade; a validade dos lotes continua ativa. */
  private situacaoAlerta(alertaHabilitado: boolean): Situacao {
    return alertaHabilitado
      ? { texto: 'Alerta ativo', classe: 'text-bg-success' }
      : { texto: 'Alerta desativado', classe: 'text-bg-secondary' };
  }

  private celulaSituacao(situacao: Situacao): HTMLTableCellElement {
    const celula = document.createElement('td');
    celula.append(criarBadge(situacao.texto, situacao.classe));
    return celula;
  }

  private atualizarResumo(seletor: string, quantidade: number, singular: string, plural: string): void {
    const resumo = obrigatorio<HTMLElement>(seletor);
    resumo.hidden = quantidade === 0;
    resumo.textContent = quantidade === 0 ? '' : `${quantidade} ${quantidade === 1 ? singular : plural}`;
  }

  /** Célula de lotes do produto: total de unidades e uma linha por lote. */
  private celulaLotes(lotes: Lote[], total: number): HTMLTableCellElement {
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

  private celulaAcoes(botoes: HTMLButtonElement[]): HTMLTableCellElement {
    const celula = document.createElement('td');
    if (botoes.length === 0) {
      celula.textContent = '—';
      return celula;
    }
    const grupo = document.createElement('div');
    grupo.className = 'd-flex flex-wrap gap-1';
    grupo.setAttribute('role', 'group');
    grupo.append(...botoes);
    celula.append(grupo);
    return celula;
  }

  private renderizarProdutos(produtos: Produto[]): void {
    const corpo = obrigatorio<HTMLTableSectionElement>('#tbProdutos');
    corpo.replaceChildren();
    this.produtosVisiveis = new Map(produtos.map((produto) => [produto.id, produto]));
    this.atualizarResumo('#esResumoProdutos', produtos.length, 'produto', 'produtos');

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
        criarCelula(this.formatarMoeda(produto.precoBrl), 'text-nowrap small'),
        criarCelula(String(produto.estoqueMinimo), 'text-nowrap small'),
        this.celulaSituacao(this.situacaoAlerta(produto.alertaEstoque)),
        this.celulaLotes(produto.lotes, total),
        this.celulaSituacao(this.situacaoProduto(total, produto.estoqueMinimo))
      );

      const botoes: HTMLButtonElement[] = [];
      if (this.contexto.auth.isAdmin()) {
        botoes.push(
          criarBotaoAcao(
            'editar-produto',
            produto.id,
            'Editar',
            `Editar o produto ${produto.nome}`
          ),
          criarBotaoAcao(
            'inativar-produto',
            produto.id,
            'Inativar',
            `Inativar o produto ${produto.nome}`,
            'btn-outline-warning'
          )
        );
      }
      linha.append(this.celulaAcoes(botoes));
      corpo.append(linha);
    }
  }

  private renderizarLotes(lotes: Lote[]): void {
    const corpo = obrigatorio<HTMLTableSectionElement>('#tbLotes');
    corpo.replaceChildren();
    this.lotesVisiveis = new Map(lotes.map((lote) => [lote.id, lote]));
    this.atualizarResumo('#esResumoLotes', lotes.length, 'lote', 'lotes');

    if (lotes.length === 0) {
      corpo.append(linhaMensagem('Nenhum lote cadastrado.', COLUNAS_LOTES));
      return;
    }

    const hoje = this.hojeCivil();
    const limite = this.limiteAlerta();
    for (const lote of lotes) {
      const linha = document.createElement('tr');
      linha.append(
        criarCelula(textoOuTraco(lote.codigo), 'text-break small'),
        criarCelula(textoOuTraco(lote.produto?.nome), 'text-break small'),
        criarCelula(formatarDataCivil(lote.validade), 'text-nowrap small'),
        criarCelula(`${lote.quantidade} un.`, 'text-nowrap small'),
        this.celulaSituacao(this.situacaoLote(lote.validade, hoje, limite))
      );

      const botoes: HTMLButtonElement[] = [];
      if (this.contexto.auth.isAdmin()) {
        botoes.push(
          criarBotaoAcao('editar-lote', lote.id, 'Editar', `Editar o lote ${lote.codigo}`),
          criarBotaoAcao(
            'baixar-lote',
            lote.id,
            'Baixar',
            `Baixar o lote ${lote.codigo}`,
            'btn-outline-warning'
          )
        );
      }
      linha.append(this.celulaAcoes(botoes));
      corpo.append(linha);
    }
  }

  /** Preenche o seletor do formulário de lote preservando a seleção atual. */
  private preencherSelectProdutos(produtos: Produto[]): void {
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

  private renderizarVazio(): void {
    this.preencherSelectProdutos([]);
    this.renderizarProdutos([]);
    this.renderizarLotes([]);
  }

  /** Usabilidade apenas: o backend continua sendo a autoridade final. */
  private aplicarPermissoes(): void {
    const aviso = obrigatorio<HTMLElement>('#esAvisoLeitura');
    const area = obrigatorio<HTMLElement>('#esAreaEdicao');
    const usuario = this.contexto.auth.obterUsuario();
    const podeEditar = usuario !== null && this.contexto.auth.isAdmin();

    aviso.hidden = usuario === null || podeEditar;
    area.hidden = !podeEditar;
  }

  private dataCivilValida(valor: string): boolean {
    if (!FORMATO_DATA_CIVIL.test(valor)) return false;
    const [ano, mes, dia] = valor.split('-').map(Number);
    const data = new Date(Date.UTC(ano, mes - 1, dia));
    return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
  }

  private inteiroOuNull(valor: string): number | null {
    const texto = valor.trim();
    if (!/^\d+$/.test(texto)) return null;
    const numero = Number(texto);
    return Number.isFinite(numero) && numero >= 0 ? numero : null;
  }

  /** Aceita vírgula decimal e no máximo duas casas após o separador. */
  private precoOuNull(valor: string): number | null {
    const texto = valor.trim().replace(',', '.');
    if (!/^\d+(?:\.\d{1,2})?$/.test(texto)) return null;
    const numero = Number(texto);
    return Number.isFinite(numero) && numero >= 0 ? numero : null;
  }

  private limparCamposProduto(): void {
    this.idProdutoEdicao = null;
    const formulario = obrigatorio<HTMLFormElement>('#formProduto');
    formulario.reset();
    obrigatorio<HTMLInputElement>('#esAlertaEstoque').checked = ESTOQUE_ALERTA_PADRAO;
    limparValidacao(formulario);
    obrigatorio<HTMLButtonElement>('#btnSalvarProduto').textContent = 'Salvar produto';
    obrigatorio<HTMLButtonElement>('#btnCancelarEdicaoProduto').hidden = true;
    obrigatorio<HTMLElement>('#tituloFormProduto').textContent = 'Novo produto';
  }

  /** Limpa o formulário de lote sem perder o produto selecionado. */
  private limparCamposLote(): void {
    this.idLoteEdicao = null;
    const formulario = obrigatorio<HTMLFormElement>('#formLote');
    const produto = obrigatorio<HTMLSelectElement>('#esLoteProduto');
    const anterior = produto.value;
    formulario.reset();
    produto.value = anterior;
    limparValidacao(formulario);
    obrigatorio<HTMLButtonElement>('#btnSalvarLote').textContent = 'Salvar lote';
    obrigatorio<HTMLButtonElement>('#btnCancelarEdicaoLote').hidden = true;
    obrigatorio<HTMLElement>('#tituloFormLote').textContent = 'Novo lote';
  }

  private preencherFormularioProduto(produto: Produto): void {
    this.idProdutoEdicao = produto.id;
    this.definirValor('#esNome', produto.nome);
    this.definirValor('#esCategoria', produto.categoria);
    this.definirValor('#esEstoqueMinimo', String(produto.estoqueMinimo));
    this.definirValor('#esPreco', String(produto.precoBrl));
    obrigatorio<HTMLInputElement>('#esAlertaEstoque').checked = produto.alertaEstoque;
    obrigatorio<HTMLButtonElement>('#btnSalvarProduto').textContent = 'Salvar alterações';
    obrigatorio<HTMLButtonElement>('#btnCancelarEdicaoProduto').hidden = false;
    obrigatorio<HTMLElement>('#tituloFormProduto').textContent = `Editar produto — ${produto.nome}`;
    limparValidacao(obrigatorio<HTMLFormElement>('#formProduto'));
    obrigatorio<HTMLInputElement>('#esNome').focus();
  }

  private preencherFormularioLote(lote: Lote): void {
    this.idLoteEdicao = lote.id;
    obrigatorio<HTMLSelectElement>('#esLoteProduto').value = String(lote.produtoId);
    this.definirValor('#esLoteCodigo', lote.codigo);
    this.definirValor('#esLoteValidade', lote.validade);
    this.definirValor('#esLoteQuantidade', String(lote.quantidade));
    obrigatorio<HTMLButtonElement>('#btnSalvarLote').textContent = 'Salvar alterações';
    obrigatorio<HTMLButtonElement>('#btnCancelarEdicaoLote').hidden = false;
    obrigatorio<HTMLElement>('#tituloFormLote').textContent = `Editar lote — ${lote.codigo}`;
    limparValidacao(obrigatorio<HTMLFormElement>('#formLote'));
    obrigatorio<HTMLInputElement>('#esLoteCodigo').focus();
  }

  private definirValor(seletor: string, valor: string): void {
    obrigatorio<HTMLInputElement>(seletor).value = valor;
  }

  private async salvarProduto(evento: Event, botao: HTMLButtonElement): Promise<void> {
    evento.preventDefault();
    const formulario = obrigatorio<HTMLFormElement>('#formProduto');
    limparValidacao(formulario);

    if (!this.contexto.auth.isAdmin()) {
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

    const estoqueMinimo = this.inteiroOuNull(estoqueMinimoCampo.value);
    const estoqueValido = exigir(
      estoqueMinimoCampo,
      estoqueMinimo !== null && estoqueMinimo >= 0,
      'Informe o estoque mínimo como número inteiro igual ou maior que zero.'
    );

    const precoBrl = this.precoOuNull(precoCampo.value);
    const precoValido = exigir(
      precoCampo,
      precoBrl !== null,
      'Informe um preço válido, com até duas casas decimais.'
    );

    if (
      !nomeValido ||
      !categoriaValida ||
      !estoqueValido ||
      !precoValido ||
      estoqueMinimo === null ||
      precoBrl === null
    ) {
      focarPrimeiroInvalido(formulario);
      return;
    }

    const dados: DadosProduto = {
      nome: nome.value.trim(),
      categoria: categoria.value.trim(),
      estoqueMinimo,
      alertaEstoque: obrigatorio<HTMLInputElement>('#esAlertaEstoque').checked,
      precoBrl,
    };
    const id = this.idProdutoEdicao;

    setCarregando(botao, true, 'Salvando…');
    try {
      if (id === null) {
        await window.api.estoqueProdutosCriar(dados);
        mostrarToast('Produto cadastrado com sucesso.', 'sucesso');
      } else {
        const atualizacao: DadosAtualizacaoProduto = { ...dados, id };
        await window.api.estoqueProdutosAtualizar(atualizacao);
        mostrarToast('Produto atualizado com sucesso.', 'sucesso');
      }
      this.limparCamposProduto();
      await this.carregar();
    } catch (erro) {
      mostrarToast(mensagemErro(erro), 'erro');
    } finally {
      setCarregando(botao, false);
    }
  }

  private async salvarLote(evento: Event, botao: HTMLButtonElement): Promise<void> {
    evento.preventDefault();
    const formulario = obrigatorio<HTMLFormElement>('#formLote');
    limparValidacao(formulario);

    if (!this.contexto.auth.isAdmin()) {
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
      this.dataCivilValida(validadeTexto),
      'Informe uma data de validade válida (AAAA-MM-DD).'
    );

    const quantidade = this.inteiroOuNull(quantidadeCampo.value);
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
    const id = this.idLoteEdicao;

    setCarregando(botao, true, 'Salvando…');
    try {
      if (id === null) {
        await window.api.estoqueLotesCriar(dados);
        mostrarToast('Lote cadastrado com sucesso.', 'sucesso');
      } else {
        const atualizacao: DadosAtualizacaoLote = { ...dados, id };
        await window.api.estoqueLotesAtualizar(atualizacao);
        mostrarToast('Lote atualizado com sucesso.', 'sucesso');
      }
      this.limparCamposLote();
      await this.carregar();
    } catch (erro) {
      mostrarToast(mensagemErro(erro), 'erro');
    } finally {
      setCarregando(botao, false);
    }
  }

  private async inativarProduto(produto: Produto, botao: HTMLButtonElement): Promise<void> {
    if (!this.contexto.auth.isAdmin()) return;
    const motivo = await pedirMotivo({
      titulo: 'Inativar produto',
      descricao:
        `O produto "${produto.nome}" deixará de aparecer nas listagens ativas. ` +
        'O histórico é preservado e o motivo fica registrado na auditoria.',
      rotuloConfirmar: 'Inativar produto',
    });
    if (motivo === null) return;

    setCarregando(botao, true, 'Inativando…');
    try {
      await window.api.estoqueProdutosInativar({ id: produto.id, motivo });
      if (this.idProdutoEdicao === produto.id) this.limparCamposProduto();
      mostrarToast('Produto inativado. O motivo foi registrado na auditoria.', 'sucesso');
      await this.carregar();
    } catch (erro) {
      mostrarToast(mensagemErro(erro), 'erro');
    } finally {
      setCarregando(botao, false);
    }
  }

  private async baixarLote(lote: Lote, botao: HTMLButtonElement): Promise<void> {
    if (!this.contexto.auth.isAdmin()) return;
    const motivo = await pedirMotivo({
      titulo: 'Baixar lote',
      descricao:
        `O lote "${lote.codigo}" será baixado. ` +
        'A quantidade não desaparece sem rastreio e o motivo fica registrado na auditoria.',
      rotuloConfirmar: 'Baixar lote',
    });
    if (motivo === null) return;

    setCarregando(botao, true, 'Baixando…');
    try {
      await window.api.estoqueLotesBaixar({ id: lote.id, motivo });
      if (this.idLoteEdicao === lote.id) this.limparCamposLote();
      mostrarToast('Lote baixado. O motivo foi registrado na auditoria.', 'sucesso');
      await this.carregar();
    } catch (erro) {
      mostrarToast(mensagemErro(erro), 'erro');
    } finally {
      setCarregando(botao, false);
    }
  }

  private configurarEventos(): void {
    obrigatorio<HTMLFormElement>('#formProduto').addEventListener('submit', (evento) => {
      void this.salvarProduto(evento, obrigatorio<HTMLButtonElement>('#btnSalvarProduto'));
    });
    obrigatorio<HTMLFormElement>('#formLote').addEventListener('submit', (evento) => {
      void this.salvarLote(evento, obrigatorio<HTMLButtonElement>('#btnSalvarLote'));
    });
    obrigatorio<HTMLButtonElement>('#btnCancelarEdicaoProduto').addEventListener('click', () => {
      this.limparCamposProduto();
    });
    obrigatorio<HTMLButtonElement>('#btnCancelarEdicaoLote').addEventListener('click', () => {
      this.limparCamposLote();
    });
    obrigatorio<HTMLInputElement>('#inValorUsd').addEventListener('input', () => {
      this.recalcularBrl();
    });
    obrigatorio<HTMLButtonElement>('#btnAtualizarCotacao').addEventListener('click', () => {
      void this.atualizarCotacao();
    });

    obrigatorio<HTMLTableSectionElement>('#tbProdutos').addEventListener('click', (evento) => {
      const alvo = evento.target;
      if (!(alvo instanceof Element)) return;
      const botao = alvo.closest<HTMLButtonElement>('button[data-acao][data-id]');
      if (!botao || botao.disabled) return;
      const id = Number(botao.dataset.id);
      if (!Number.isInteger(id) || id <= 0) return;
      const produto = this.produtosVisiveis.get(id);
      if (produto === undefined) return;
      if (botao.dataset.acao === 'editar-produto') this.preencherFormularioProduto(produto);
      else if (botao.dataset.acao === 'inativar-produto') void this.inativarProduto(produto, botao);
    });

    obrigatorio<HTMLTableSectionElement>('#tbLotes').addEventListener('click', (evento) => {
      const alvo = evento.target;
      if (!(alvo instanceof Element)) return;
      const botao = alvo.closest<HTMLButtonElement>('button[data-acao][data-id]');
      if (!botao || botao.disabled) return;
      const id = Number(botao.dataset.id);
      if (!Number.isInteger(id) || id <= 0) return;
      const lote = this.lotesVisiveis.get(id);
      if (lote === undefined) return;
      if (botao.dataset.acao === 'editar-lote') this.preencherFormularioLote(lote);
      else if (botao.dataset.acao === 'baixar-lote') void this.baixarLote(lote, botao);
    });
  }
}
