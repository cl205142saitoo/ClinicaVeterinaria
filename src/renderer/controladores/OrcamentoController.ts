/** Orçamentos: itens de produto/serviço, desconto em BRL e fluxo de status. */

import { ITEM_QUANTIDADE_MAXIMA, ORCAMENTO_STATUS, PRECO_ITEM_TIPOS } from '../../shared/constants';
import { dataCivilClinica } from '../../shared/datas';
import { ehDataCivil } from '../../shared/validators';
import type {
  Cliente,
  DadosAtualizacaoOrcamento,
  DadosItemOrcamento,
  DadosOrcamento,
  DadosStatusOrcamento,
  ItemOrcamentoTipo,
  Orcamento,
  OrcamentoStatus,
  Pet,
  Produto,
  TabelaPreco,
} from '../types';
import {
  aplicarMascaraPreco,
  criarBadge,
  criarBotaoAcao,
  criarCelula,
  exigir,
  focarPrimeiroInvalido,
  formatarDataCivil,
  formatarMoeda,
  linhaMensagem,
  limparValidacao,
  mensagemErro,
  mostrarToast,
  obrigatorio,
  pedirMotivo,
  precoOuNull,
  setCarregando,
  textoOuTraco,
  textoPreco,
} from '../ui';
import type { ContextoApp } from './contexto';

const COLUNAS_ORCAMENTOS = 7;
const COLUNAS_ITENS = 6;

interface ItemDraft extends DadosItemOrcamento {
  /** Presente somente em itens carregados de um orçamento existente. */
  id?: number;
}

const CLASSES_STATUS: Readonly<Record<OrcamentoStatus, string>> = {
  PENDENTE: 'text-bg-warning',
  APROVADO: 'text-bg-success',
  REPROVADO: 'text-bg-danger',
  CANCELADO: 'text-bg-secondary',
};

const ROTULOS_STATUS: Readonly<Record<OrcamentoStatus, string>> = {
  PENDENTE: 'Pendente',
  APROVADO: 'Aprovado',
  REPROVADO: 'Reprovado',
  CANCELADO: 'Cancelado',
};

type StatusAlteravel = Exclude<OrcamentoStatus, 'CANCELADO'>;

export class OrcamentoController {
  private clientes = new Map<number, Cliente>();
  private pets = new Map<number, Pet>();
  private produtos = new Map<number, Produto>();
  private tabelas = new Map<number, TabelaPreco>();
  private orcamentosVisiveis = new Map<number, Orcamento>();
  private itens: ItemDraft[] = [];
  private idEdicao: number | null = null;
  private sequenciaCarregamento = 0;
  private eventosLigados = false;

  constructor(private readonly contexto: ContextoApp) {}

  iniciar(): void {
    if (!this.eventosLigados) {
      this.eventosLigados = true;
      aplicarMascaraPreco(obrigatorio<HTMLInputElement>('#orDesconto'));
      aplicarMascaraPreco(obrigatorio<HTMLInputElement>('#orItemPreco'));
      this.configurarEventos();
    }
    this.aplicarPermissoes();
    this.sairDaEdicao(false);
    this.renderizarVazio();
  }

  /** Recebe clientes/pets já carregados pela tela inicial para evitar IPC duplicado. */
  definirDadosBase(clientes: Cliente[], pets: Pet[]): void {
    this.clientes = new Map(clientes.map((cliente) => [cliente.id, cliente]));
    this.pets = new Map(pets.map((pet) => [pet.id, pet]));
    this.preencherSelectClientes();
    this.preencherSelectPets();
  }

  /** Carrega orçamentos e as bases necessárias para sugerir preços. */
  async carregar(clientes?: Cliente[], pets?: Pet[]): Promise<Orcamento[]> {
    this.aplicarPermissoes();
    if (clientes !== undefined || pets !== undefined) {
      this.definirDadosBase(clientes ?? [], pets ?? []);
    } else if (this.clientes.size === 0) {
      const [clientesApi, petsApi] = await Promise.all([
        window.api.listarClientes(),
        window.api.listarPets(),
      ]);
      this.definirDadosBase(clientesApi, petsApi);
    }

    const sequencia = this.sequenciaCarregamento + 1;
    this.sequenciaCarregamento = sequencia;
    const corpo = obrigatorio<HTMLTableSectionElement>('#tbOrcamentos');
    const corpoItens = obrigatorio<HTMLTableSectionElement>('#tbItensOrcamento');
    corpo.setAttribute('aria-busy', 'true');
    corpo.replaceChildren(linhaMensagem('Carregando orçamentos…', COLUNAS_ORCAMENTOS));
    corpoItens.setAttribute('aria-busy', 'true');

    try {
      const [orcamentos, produtos, tabelas] = await Promise.all([
        window.api.orcamentosListar(),
        window.api.estoqueProdutosListar(),
        window.api.tabelaPrecoListar(),
      ]);
      if (sequencia !== this.sequenciaCarregamento) return [];

      this.produtos = new Map(produtos.map((produto) => [produto.id, produto]));
      this.tabelas = new Map(tabelas.map((tabela) => [tabela.id, tabela]));
      this.preencherSelectProdutos();
      this.preencherSelectServicos();
      this.atualizarCamposItem();
      this.renderizarOrcamentos(orcamentos);
      return orcamentos;
    } catch (erro) {
      if (sequencia !== this.sequenciaCarregamento) return [];
      corpo.replaceChildren(
        linhaMensagem(
          'Não foi possível carregar os orçamentos.',
          COLUNAS_ORCAMENTOS,
          'text-center text-danger py-4'
        )
      );
      obrigatorio<HTMLElement>('#orResumo').hidden = true;
      mostrarToast(mensagemErro(erro), 'erro');
      return [];
    } finally {
      if (sequencia === this.sequenciaCarregamento) {
        corpo.setAttribute('aria-busy', 'false');
        corpoItens.setAttribute('aria-busy', 'false');
      }
    }
  }

  /** Zera itens, formulário e listagens ao sair; ignora respostas antigas. */
  limpar(): void {
    this.sequenciaCarregamento += 1;
    this.idEdicao = null;
    this.itens = [];
    this.clientes = new Map();
    this.pets = new Map();
    this.produtos = new Map();
    this.tabelas = new Map();
    this.orcamentosVisiveis = new Map();
    setCarregando(obrigatorio<HTMLButtonElement>('#btnSalvarOrcamento'), false);
    this.sairDaEdicao(false);
    this.renderizarVazio();
    obrigatorio<HTMLElement>('#orAvisoLeitura').hidden = true;
    obrigatorio<HTMLElement>('#orAreaEdicao').hidden = true;
  }

  private podeEditar(): boolean {
    const papel = this.contexto.auth.obterUsuario()?.role;
    return papel === 'ADMIN' || papel === 'VETERINARIO';
  }

  /** Atendentes leem todas as abas; apenas os controles de escrita são escondidos. */
  private aplicarPermissoes(): void {
    const usuario = this.contexto.auth.obterUsuario();
    const podeEditar = usuario !== null && this.podeEditar();
    obrigatorio<HTMLElement>('#orAvisoLeitura').hidden = usuario === null || podeEditar;
    obrigatorio<HTMLElement>('#orAreaEdicao').hidden = !podeEditar;
    if (!podeEditar && this.idEdicao !== null) this.sairDaEdicao(false);
  }

  private renderizarVazio(): void {
    this.preencherSelectClientes();
    this.preencherSelectPets();
    this.preencherSelectProdutos();
    this.preencherSelectServicos();
    this.renderizarItens();
    this.renderizarOrcamentos([]);
  }

  private preencherSelectClientes(): void {
    const select = obrigatorio<HTMLSelectElement>('#orCliente');
    const anterior = select.value;
    select.replaceChildren();

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent =
      this.clientes.size > 0 ? 'Selecione o cliente…' : 'Cadastre um cliente primeiro';
    select.append(placeholder);

    for (const cliente of this.clientes.values()) {
      const opcao = document.createElement('option');
      opcao.value = String(cliente.id);
      opcao.textContent = `${cliente.nome} — ${cliente.cidade}/${cliente.uf}`;
      select.append(opcao);
    }

    select.value = [...this.clientes.keys()].some((id) => String(id) === anterior) ? anterior : '';
  }

  /** Usa `pet.cliente` quando presente; a listagem antiga traz só `clienteId`. */
  private preencherSelectPets(clienteId?: number | null, selecionar?: number | null): void {
    const select = obrigatorio<HTMLSelectElement>('#orPet');
    const idCliente = clienteId ?? this.idClienteSelecionado();
    const anterior = selecionar ?? (select.value === '' ? null : Number(select.value));
    select.replaceChildren();

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = idCliente === null ? 'Selecione um cliente primeiro' : 'Sem pet específico';
    select.append(placeholder);

    if (idCliente !== null) {
      for (const pet of this.pets.values()) {
        const pertenceAoCliente = pet.clienteId === idCliente || pet.cliente?.id === idCliente;
        if (!pertenceAoCliente) continue;
        const opcao = document.createElement('option');
        opcao.value = String(pet.id);
        opcao.textContent = `${pet.nome} — ${pet.especie}/${pet.raca}`;
        select.append(opcao);
      }
    }

    select.value =
      anterior !== null && [...select.options].some((opcao) => opcao.value === String(anterior))
        ? String(anterior)
        : '';
  }

  private idClienteSelecionado(): number | null {
    const valor = obrigatorio<HTMLSelectElement>('#orCliente').value;
    if (valor === '') return null;
    const id = Number(valor);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  private preencherSelectProdutos(): void {
    const select = obrigatorio<HTMLSelectElement>('#orItemProduto');
    const anterior = select.value;
    select.replaceChildren();

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent =
      this.produtos.size > 0 ? 'Selecione um produto…' : 'Cadastre produtos no estoque primeiro';
    select.append(placeholder);

    for (const produto of this.produtos.values()) {
      const opcao = document.createElement('option');
      opcao.value = String(produto.id);
      opcao.textContent = `${produto.nome} — ${produto.categoria}`;
      select.append(opcao);
    }

    select.value = [...this.produtos.keys()].some((id) => String(id) === anterior) ? anterior : '';
  }

  private preencherSelectServicos(): void {
    const select = obrigatorio<HTMLSelectElement>('#orItemServico');
    const anterior = select.value;
    select.replaceChildren();

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = this.tabelas.size > 0 ? 'Selecione um serviço…' : 'Cadastre uma tabela de preço primeiro';
    select.append(placeholder);

    for (const tabela of this.tabelas.values()) {
      if (tabela.ativo === false) continue;
      const opcao = document.createElement('option');
      opcao.value = String(tabela.id);
      opcao.textContent = `${tabela.codigo} — ${tabela.descricao}`;
      select.append(opcao);
    }

    select.value = [...this.tabelas.keys()].some((id) => String(id) === anterior) ? anterior : '';
  }

  private atualizarCamposItem(): void {
    const tipo = obrigatorio<HTMLSelectElement>('#orItemTipo').value;
    const servico = tipo === 'SERVICO';
    obrigatorio<HTMLElement>('#orGrupoProduto').hidden = servico;
    obrigatorio<HTMLElement>('#orGrupoServico').hidden = !servico;
    this.sugerirPreco();
  }

  /** O preço vem de Produto.precoBrl ou TabelaPreco.preco; o backend valida. */
  private sugerirPreco(): void {
    const campo = obrigatorio<HTMLInputElement>('#orItemPreco');
    const status = obrigatorio<HTMLElement>('#orStatusItem');
    const servico = obrigatorio<HTMLSelectElement>('#orItemTipo').value === 'SERVICO';
    const select = obrigatorio<HTMLSelectElement>(servico ? '#orItemServico' : '#orItemProduto');
    const id = select.value === '' ? null : Number(select.value);
    const origem = servico
      ? id === null
        ? undefined
        : this.tabelas.get(id)
      : id === null
        ? undefined
        : this.produtos.get(id);

    if (origem === undefined) {
      campo.value = '';
      status.textContent = 'Selecione um item para sugerir o preço.';
      return;
    }
    const preco = 'precoBrl' in origem ? origem.precoBrl : origem.preco;
    campo.value = textoPreco(preco);
    status.textContent = 'Preço sugerido. Ajuste o valor antes de adicionar, se necessário.';
  }

  private renderizarItens(): void {
    const corpo = obrigatorio<HTMLTableSectionElement>('#tbItensOrcamento');
    corpo.replaceChildren();
    if (this.itens.length === 0) {
      corpo.append(linhaMensagem('Nenhum item adicionado ao orçamento.', COLUNAS_ITENS));
      this.recalcularTotal();
      return;
    }

    this.itens.forEach((item, indice) => {
      const linha = document.createElement('tr');
      linha.append(
        criarCelula(item.tipo === 'PRODUTO' ? 'Produto' : 'Serviço', 'small'),
        criarCelula(textoOuTraco(item.descricao), 'small text-break'),
        criarCelula(String(item.quantidade), 'small text-end'),
        criarCelula(formatarMoeda(item.precoUnitario), 'small text-end text-nowrap'),
        criarCelula(formatarMoeda(item.quantidade * item.precoUnitario), 'small text-end text-nowrap fw-semibold')
      );

      const celulaAcao = document.createElement('td');
      if (this.podeEditar()) {
        const botao = criarBotaoAcao(
          'remover-item',
          indice,
          'Remover',
          `Remover o item ${item.descricao}`,
          'btn-outline-danger'
        );
        botao.dataset.indice = String(indice);
        delete botao.dataset.id;
        celulaAcao.append(botao);
      } else {
        celulaAcao.textContent = '—';
      }
      linha.append(celulaAcao);
      corpo.append(linha);
    });
    this.recalcularTotal();
  }

  private recalcularTotal(): void {
    const subtotal = this.itens.reduce((soma, item) => soma + item.quantidade * item.precoUnitario, 0);
    const desconto = precoOuNull(obrigatorio<HTMLInputElement>('#orDesconto').value) ?? 0;
    const total = Math.max(0, subtotal - desconto);
    obrigatorio<HTMLElement>('#orSubtotal').textContent = formatarMoeda(subtotal);
    obrigatorio<HTMLElement>('#orTotal').textContent = formatarMoeda(total);
  }

  private renderizarOrcamentos(orcamentos: Orcamento[]): void {
    const corpo = obrigatorio<HTMLTableSectionElement>('#tbOrcamentos');
    const resumo = obrigatorio<HTMLElement>('#orResumo');
    corpo.replaceChildren();
    this.orcamentosVisiveis = new Map(orcamentos.map((orcamento) => [orcamento.id, orcamento]));
    resumo.hidden = orcamentos.length === 0;
    resumo.textContent =
      orcamentos.length === 0
        ? ''
        : `${orcamentos.length} ${orcamentos.length === 1 ? 'orçamento' : 'orçamentos'}`;

    if (orcamentos.length === 0) {
      corpo.append(linhaMensagem('Nenhum orçamento registrado.', COLUNAS_ORCAMENTOS));
      return;
    }

    for (const orcamento of orcamentos) {
      const linha = document.createElement('tr');
      linha.append(
        criarCelula(orcamento.numero, 'small text-nowrap'),
        criarCelula(textoOuTraco(orcamento.clienteNome), 'small text-break'),
        criarCelula(textoOuTraco(orcamento.petNome), 'small'),
        criarCelula(formatarDataCivil(orcamento.validade), 'small text-nowrap'),
        this.celulaStatus(orcamento.status),
        criarCelula(formatarMoeda(orcamento.total), 'small text-end text-nowrap fw-semibold')
      );

      const celulaAcoes = document.createElement('td');
      if (this.podeEditar() && orcamento.status !== 'CANCELADO') {
        const grupo = document.createElement('div');
        grupo.className = 'd-flex flex-wrap gap-1';
        grupo.setAttribute('role', 'group');
        grupo.setAttribute('aria-label', `Ações do orçamento ${orcamento.numero}`);
        grupo.append(
          criarBotaoAcao('editar-orcamento', orcamento.id, 'Editar', `Editar o orçamento ${orcamento.numero}`)
        );
        for (const status of this.statusesAlteraveis()) {
          const botao = criarBotaoAcao(
            'status-orcamento',
            orcamento.id,
            ROTULOS_STATUS[status],
            `Definir status ${ROTULOS_STATUS[status]} para o orçamento ${orcamento.numero}`,
            status === 'APROVADO' ? 'btn-outline-success' : status === 'REPROVADO' ? 'btn-outline-danger' : 'btn-outline-secondary'
          );
          botao.dataset.status = status;
          grupo.append(botao);
        }
        grupo.append(
          criarBotaoAcao(
            'cancelar-orcamento',
            orcamento.id,
            'Cancelar',
            `Cancelar o orçamento ${orcamento.numero}`,
            'btn-outline-warning'
          )
        );
        celulaAcoes.append(grupo);
      } else {
        celulaAcoes.textContent = '—';
      }
      linha.append(celulaAcoes);
      corpo.append(linha);
    }
  }

  private statusesAlteraveis(): StatusAlteravel[] {
    return ORCAMENTO_STATUS.filter((status): status is StatusAlteravel => status !== 'CANCELADO');
  }

  private celulaStatus(status: OrcamentoStatus): HTMLTableCellElement {
    const celula = document.createElement('td');
    celula.append(criarBadge(ROTULOS_STATUS[status], CLASSES_STATUS[status]));
    return celula;
  }

  private preencherFormulario(orcamento: Orcamento): void {
    this.idEdicao = orcamento.id;
    obrigatorio<HTMLSelectElement>('#orCliente').value = String(orcamento.clienteId);
    this.preencherSelectPets(orcamento.clienteId, orcamento.petId);
    obrigatorio<HTMLInputElement>('#orValidade').value = orcamento.validade;
    obrigatorio<HTMLInputElement>('#orDesconto').value = textoPreco(orcamento.desconto);
    obrigatorio<HTMLTextAreaElement>('#orObservacoes').value = orcamento.observacoes ?? '';
    this.itens = orcamento.itens.map((item) => ({ ...item }));
    this.renderizarItens();
    obrigatorio<HTMLElement>('#orTituloForm').textContent = `Editar orçamento — ${orcamento.numero}`;
    obrigatorio<HTMLButtonElement>('#btnSalvarOrcamento').textContent = 'Salvar alterações';
    obrigatorio<HTMLButtonElement>('#btnCancelarEdicaoOrcamento').hidden = false;
    limparValidacao(obrigatorio<HTMLFormElement>('#formOrcamento'));
    obrigatorio<HTMLSelectElement>('#orCliente').focus();
  }

  private sairDaEdicao(focar = true): void {
    this.idEdicao = null;
    this.itens = [];
    const formulario = obrigatorio<HTMLFormElement>('#formOrcamento');
    formulario.reset();
    limparValidacao(formulario);
    const validade = new Date();
    validade.setDate(validade.getDate() + 30);
    obrigatorio<HTMLInputElement>('#orValidade').value = dataCivilClinica(validade);
    obrigatorio<HTMLInputElement>('#orItemQuantidade').value = '1';
    obrigatorio<HTMLSelectElement>('#orItemTipo').value = 'PRODUTO';
    obrigatorio<HTMLElement>('#orTituloForm').textContent = 'Novo orçamento';
    obrigatorio<HTMLButtonElement>('#btnSalvarOrcamento').textContent = 'Salvar orçamento';
    obrigatorio<HTMLButtonElement>('#btnCancelarEdicaoOrcamento').hidden = true;
    this.atualizarCamposItem();
    this.renderizarItens();
    if (focar) obrigatorio<HTMLSelectElement>('#orCliente').focus();
  }

  private adicionarItem(): void {
    if (!this.podeEditar()) return;
    const tipoCampo = obrigatorio<HTMLSelectElement>('#orItemTipo');
    const tipoTexto = tipoCampo.value;
    const tipoValido = PRECO_ITEM_TIPOS.some((tipo) => tipo === tipoTexto);
    exigir(tipoCampo, tipoValido, 'Selecione um tipo de item válido.');
    if (!tipoValido) return;

    const tipo: ItemOrcamentoTipo = tipoTexto === 'PRODUTO' ? 'PRODUTO' : 'SERVICO';
    const select = obrigatorio<HTMLSelectElement>(tipo === 'PRODUTO' ? '#orItemProduto' : '#orItemServico');
    const id = select.value === '' ? null : Number(select.value);
    let produtoId: number | null = null;
    let tabelaPrecoId: number | null = null;
    let descricao = '';

    if (tipo === 'PRODUTO') {
      const produto = id === null ? undefined : this.produtos.get(id);
      const selecionado = exigir(
        select,
        produto !== undefined,
        'Selecione um produto do estoque para adicionar ao orçamento.'
      );
      if (!selecionado || produto === undefined) return;
      produtoId = produto.id;
      descricao = produto.nome;
    } else {
      const tabela = id === null ? undefined : this.tabelas.get(id);
      const selecionado = exigir(
        select,
        tabela !== undefined && tabela.ativo !== false,
        'Selecione uma tabela de preço ativa para adicionar ao orçamento.'
      );
      if (!selecionado || tabela === undefined) return;
      tabelaPrecoId = tabela.id;
      descricao = tabela.descricao;
    }

    const descricaoValida = descricao.trim().length >= 2 && descricao.trim().length <= 200;
    exigir(select, descricaoValida, 'A descrição do item deve ter de 2 a 200 caracteres.');
    const quantidadeCampo = obrigatorio<HTMLInputElement>('#orItemQuantidade');
    const quantidadeTexto = quantidadeCampo.value.trim();
    const quantidade =
      /^\d+$/.test(quantidadeTexto) && Number(quantidadeTexto) >= 1 && Number(quantidadeTexto) <= ITEM_QUANTIDADE_MAXIMA
        ? Number(quantidadeTexto)
        : null;
    const quantidadeValida = exigir(
      quantidadeCampo,
      quantidade !== null,
      `Informe uma quantidade inteira de 1 a ${ITEM_QUANTIDADE_MAXIMA}.`
    );

    const precoCampo = obrigatorio<HTMLInputElement>('#orItemPreco');
    const precoUnitario = precoOuNull(precoCampo.value);
    const precoValido = exigir(
      precoCampo,
      precoUnitario !== null,
      'Informe o preço unitário com até duas casas decimais.'
    );

    if (!descricaoValida || !quantidadeValida || !precoValido || quantidade === null || precoUnitario === null) {
      focarPrimeiroInvalido(obrigatorio<HTMLFormElement>('#formOrcamento'));
      return;
    }

    this.itens.push({
      tipo,
      produtoId,
      tabelaPrecoId,
      descricao: descricao.trim(),
      quantidade,
      precoUnitario,
    });
    this.renderizarItens();
    obrigatorio<HTMLInputElement>('#orItemQuantidade').value = '1';
    this.sugerirPreco();
  }

  private async salvar(evento: Event, botao: HTMLButtonElement): Promise<void> {
    evento.preventDefault();
    const formulario = obrigatorio<HTMLFormElement>('#formOrcamento');
    limparValidacao(formulario);

    if (!this.podeEditar()) {
      mostrarToast('Sua sessão não permite registrar orçamentos.', 'erro');
      return;
    }

    const clienteSelect = obrigatorio<HTMLSelectElement>('#orCliente');
    const clienteId = clienteSelect.value === '' ? null : Number(clienteSelect.value);
    const clienteValido = exigir(
      clienteSelect,
      clienteId !== null && Number.isInteger(clienteId) && clienteId > 0,
      'Selecione o cliente do orçamento.'
    );

    const petSelect = obrigatorio<HTMLSelectElement>('#orPet');
    const petId = petSelect.value === '' ? null : Number(petSelect.value);
    const petValido =
      petId === null || (Number.isInteger(petId) && petId > 0 && this.pets.has(petId));
    exigir(petSelect, petValido, 'Selecione um pet válido ou deixe em branco.');

    const validadeCampo = obrigatorio<HTMLInputElement>('#orValidade');
    const validade = validadeCampo.value.trim();
    const validadeValida = exigir(
      validadeCampo,
      ehDataCivil(validade),
      'Informe a data de validade (AAAA-MM-DD).'
    );

    const descontoCampo = obrigatorio<HTMLInputElement>('#orDesconto');
    const descontoTexto = descontoCampo.value.trim();
    const desconto = descontoTexto === '' ? 0 : precoOuNull(descontoTexto);
    const descontoValido = exigir(
      descontoCampo,
      desconto !== null,
      'Informe o desconto em reais, com até duas casas decimais.'
    );

    const observacoesCampo = obrigatorio<HTMLTextAreaElement>('#orObservacoes');
    const observacoes = observacoesCampo.value.trim();
    const observacoesValidas = exigir(
      observacoesCampo,
      observacoes.length <= 2000,
      'As observações devem ter no máximo 2000 caracteres.'
    );

    const subtotal = this.itens.reduce((soma, item) => soma + item.quantidade * item.precoUnitario, 0);
    const descontoValidoNoTotal =
      desconto === null
        ? false
        : exigir(descontoCampo, desconto <= subtotal, 'O desconto não pode exceder o total dos itens.');

    if (this.itens.length === 0) {
      mostrarToast('Adicione pelo menos um item antes de salvar o orçamento.', 'erro');
      obrigatorio<HTMLButtonElement>('#btnAdicionarItem').focus();
      return;
    }

    if (
      !clienteValido ||
      clienteId === null ||
      !petValido ||
      !validadeValida ||
      !descontoValido ||
      desconto === null ||
      !observacoesValidas ||
      !descontoValidoNoTotal
    ) {
      focarPrimeiroInvalido(formulario);
      return;
    }

    const dados: DadosOrcamento = {
      clienteId,
      petId,
      validade,
      desconto,
      observacoes: observacoes || null,
      itens: this.itens.map((item): DadosItemOrcamento => ({
        tipo: item.tipo,
        produtoId: item.produtoId,
        tabelaPrecoId: item.tabelaPrecoId,
        descricao: item.descricao,
        quantidade: item.quantidade,
        precoUnitario: item.precoUnitario,
      })),
    };
    const id = this.idEdicao;

    setCarregando(botao, true, 'Salvando…');
    let salvoComSucesso = false;
    try {
      if (id === null) {
        await window.api.orcamentoCriar(dados);
        mostrarToast('Orçamento criado com sucesso.', 'sucesso');
      } else {
        const atualizacao: DadosAtualizacaoOrcamento = { ...dados, id };
        await window.api.orcamentoAtualizar(atualizacao);
        mostrarToast('Orçamento atualizado com sucesso.', 'sucesso');
      }
      salvoComSucesso = true;
      await this.carregar();
    } catch (erro) {
      mostrarToast(mensagemErro(erro), 'erro');
    } finally {
      // Restaura o texto do botão antes de limpar o modo de edição.
      setCarregando(botao, false);
      if (salvoComSucesso) this.sairDaEdicao(false);
    }
  }

  private async definirStatus(
    orcamento: Orcamento,
    status: StatusAlteravel,
    botao: HTMLButtonElement
  ): Promise<void> {
    if (!this.podeEditar() || orcamento.status === 'CANCELADO' || orcamento.status === status) return;
    const dados: DadosStatusOrcamento = { id: orcamento.id, status };
    setCarregando(botao, true, 'Salvando…');
    try {
      await window.api.orcamentoDefinirStatus(dados);
      mostrarToast(`Orçamento ${orcamento.numero} marcado como ${ROTULOS_STATUS[status].toLowerCase()}.`, 'sucesso');
      await this.carregar();
    } catch (erro) {
      mostrarToast(mensagemErro(erro), 'erro');
    } finally {
      setCarregando(botao, false);
    }
  }

  private async cancelar(orcamento: Orcamento, botao: HTMLButtonElement): Promise<void> {
    if (!this.podeEditar()) return;
    const motivo = await pedirMotivo({
      titulo: 'Cancelar orçamento',
      descricao:
        `O orçamento ${orcamento.numero} será cancelado. ` +
        'O motivo fica registrado na auditoria.',
      rotuloConfirmar: 'Cancelar orçamento',
    });
    if (motivo === null) return;

    setCarregando(botao, true, 'Cancelando…');
    try {
      await window.api.orcamentoCancelar({ id: orcamento.id, motivo });
      if (this.idEdicao === orcamento.id) this.sairDaEdicao(false);
      mostrarToast('Orçamento cancelado. O motivo foi registrado na auditoria.', 'sucesso');
      await this.carregar();
    } catch (erro) {
      mostrarToast(mensagemErro(erro), 'erro');
    } finally {
      setCarregando(botao, false);
    }
  }

  private configurarEventos(): void {
    obrigatorio<HTMLSelectElement>('#orCliente').addEventListener('change', () => {
      this.preencherSelectPets(this.idClienteSelecionado());
    });
    obrigatorio<HTMLSelectElement>('#orItemTipo').addEventListener('change', () => {
      this.atualizarCamposItem();
    });
    obrigatorio<HTMLSelectElement>('#orItemProduto').addEventListener('change', () => {
      this.sugerirPreco();
    });
    obrigatorio<HTMLSelectElement>('#orItemServico').addEventListener('change', () => {
      this.sugerirPreco();
    });
    obrigatorio<HTMLInputElement>('#orDesconto').addEventListener('input', () => {
      this.recalcularTotal();
    });
    obrigatorio<HTMLButtonElement>('#btnAdicionarItem').addEventListener('click', () => {
      this.adicionarItem();
    });
    obrigatorio<HTMLButtonElement>('#btnCancelarEdicaoOrcamento').addEventListener('click', () => {
      this.sairDaEdicao();
    });
    obrigatorio<HTMLFormElement>('#formOrcamento').addEventListener('submit', (evento) => {
      void this.salvar(evento, obrigatorio<HTMLButtonElement>('#btnSalvarOrcamento'));
    });

    obrigatorio<HTMLTableSectionElement>('#tbItensOrcamento').addEventListener('click', (evento) => {
      const alvo = evento.target;
      if (!(alvo instanceof Element)) return;
      const botao = alvo.closest<HTMLButtonElement>('button[data-acao][data-indice]');
      if (!botao || botao.disabled || !this.podeEditar()) return;
      if (botao.dataset.acao !== 'remover-item') return;
      const indice = Number(botao.dataset.indice);
      if (!Number.isInteger(indice) || indice < 0 || indice >= this.itens.length) return;
      this.itens.splice(indice, 1);
      this.renderizarItens();
    });

    obrigatorio<HTMLTableSectionElement>('#tbOrcamentos').addEventListener('click', (evento) => {
      const alvo = evento.target;
      if (!(alvo instanceof Element)) return;
      const botao = alvo.closest<HTMLButtonElement>('button[data-acao][data-id]');
      if (!botao || botao.disabled || !this.podeEditar()) return;
      const id = Number(botao.dataset.id);
      if (!Number.isInteger(id) || id <= 0) return;
      const orcamento = this.orcamentosVisiveis.get(id);
      if (orcamento === undefined || orcamento.status === 'CANCELADO') return;

      const acao = botao.dataset.acao;
      if (acao === 'editar-orcamento') this.preencherFormulario(orcamento);
      else if (acao === 'cancelar-orcamento') void this.cancelar(orcamento, botao);
      else if (acao === 'status-orcamento') {
        const status = botao.dataset.status;
        if (status === 'PENDENTE' || status === 'APROVADO' || status === 'REPROVADO') {
          void this.definirStatus(orcamento, status, botao);
        }
      }
    });
  }
}
