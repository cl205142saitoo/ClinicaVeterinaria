/** Financeiro: movimentações, baixa auditada, cancelamento e indicadores. */

import {
  ESTOQUE_CATEGORIA_MAXIMO,
  FORMA_PAGAMENTO_MAXIMA,
  MOVIMENTACAO_STATUS,
  MOVIMENTACAO_TIPOS,
} from '../../shared/constants';
import { dataCivilClinica } from '../../shared/datas';
import { ehDataCivil } from '../../shared/validators';
import type {
  BootstrapModal,
  DadosAtualizacaoMovimentacao,
  DadosBaixaMovimentacao,
  DadosInativacao,
  DadosMovimentacao,
  MovimentacaoFinanceira,
  MovimentacaoStatus,
  MovimentacaoTipo,
  Orcamento,
  ResumoFinanceiro,
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
  formatarPercentual,
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

const COLUNAS = 8;

/** Cancelamento é operação própria e nunca chega pelo formulário. */
type StatusEdicao = Exclude<MovimentacaoStatus, 'CANCELADO'>;

const ROTULOS_STATUS: Readonly<Record<MovimentacaoStatus, string>> = {
  PENDENTE: 'Pendente',
  PAGO: 'Pago',
  CANCELADO: 'Cancelado',
};

const CLASSES_STATUS: Readonly<Record<MovimentacaoStatus, string>> = {
  PENDENTE: 'text-bg-warning',
  PAGO: 'text-bg-success',
  CANCELADO: 'text-bg-secondary',
};

const ROTULOS_TIPO: Readonly<Record<MovimentacaoTipo, string>> = {
  RECEITA: 'Receita',
  DESPESA: 'Despesa',
};

const CLASSES_TIPO: Readonly<Record<MovimentacaoTipo, string>> = {
  RECEITA: 'text-bg-success',
  DESPESA: 'text-bg-danger',
};

function ehTipoEdicao(valor: string): valor is MovimentacaoTipo {
  return MOVIMENTACAO_TIPOS.some((tipo) => tipo === valor);
}

function ehStatusEdicao(valor: string): valor is StatusEdicao {
  return MOVIMENTACAO_STATUS.some((status) => status === valor && status !== 'CANCELADO');
}

export class FinanceiroController {
  private movimentacoesVisiveis = new Map<number, MovimentacaoFinanceira>();
  private orcamentos = new Map<number, Orcamento>();
  private idEdicao: number | null = null;
  private sequenciaCarregamento = 0;
  private eventosLigados = false;

  constructor(private readonly contexto: ContextoApp) {}

  iniciar(): void {
    if (!this.eventosLigados) {
      this.eventosLigados = true;
      aplicarMascaraPreco(obrigatorio<HTMLInputElement>('#fnValor'));
      this.configurarEventos();
    }
    this.aplicarPermissoes();
    this.sairDaEdicao(false);
    this.renderizarVazio();
  }

  /** Carrega movimentações, resumo e a lista de orçamentos vinculáveis. */
  async carregar(orcamentos?: Orcamento[]): Promise<void> {
    this.aplicarPermissoes();
    const sequencia = this.sequenciaCarregamento + 1;
    this.sequenciaCarregamento = sequencia;
    const corpo = obrigatorio<HTMLTableSectionElement>('#tbMovimentacoes');
    const resumo = obrigatorio<HTMLElement>('#fnResumo');
    corpo.setAttribute('aria-busy', 'true');
    resumo.setAttribute('aria-busy', 'true');
    corpo.replaceChildren(linhaMensagem('Carregando movimentações…', COLUNAS));

    try {
      const [movimentacoes, resumoApi, orcamentosApi] = await Promise.all([
        window.api.movimentacoesListar(),
        window.api.resumoFinanceiro(),
        orcamentos === undefined ? window.api.orcamentosListar() : Promise.resolve(orcamentos),
      ]);
      if (sequencia !== this.sequenciaCarregamento) return;

      this.definirOrcamentos(orcamentos === undefined ? orcamentosApi : orcamentos);
      this.renderizarMovimentacoes(movimentacoes);
      this.renderizarResumo(resumoApi);
    } catch (erro) {
      if (sequencia !== this.sequenciaCarregamento) return;
      corpo.replaceChildren(
        linhaMensagem(
          'Não foi possível carregar as movimentações.',
          COLUNAS,
          'text-center text-danger py-4'
        )
      );
      this.renderizarResumoVazio();
      obrigatorio<HTMLElement>('#fnAvisoLeitura').hidden = true;
      obrigatorio<HTMLElement>('#fnAreaEdicao').hidden = true;
      mostrarToast(mensagemErro(erro), 'erro');
    } finally {
      if (sequencia === this.sequenciaCarregamento) {
        corpo.setAttribute('aria-busy', 'false');
        resumo.setAttribute('aria-busy', 'false');
      }
    }
  }

  /** Limpa tabela, indicadores, seleção e formulário ao encerrar a sessão. */
  limpar(): void {
    this.sequenciaCarregamento += 1;
    this.idEdicao = null;
    this.movimentacoesVisiveis = new Map();
    this.orcamentos = new Map();
    setCarregando(obrigatorio<HTMLButtonElement>('#btnSalvarMovimentacao'), false);
    this.sairDaEdicao(false);
    this.renderizarVazio();
    obrigatorio<HTMLElement>('#fnAvisoLeitura').hidden = true;
    obrigatorio<HTMLElement>('#fnAreaEdicao').hidden = true;
  }

  /** ADMIN e VETERINARIO escrevem; ATENDENTE mantém acesso somente de leitura. */
  private podeEditar(): boolean {
    const papel = this.contexto.auth.obterUsuario()?.role;
    return papel === 'ADMIN' || papel === 'VETERINARIO';
  }

  private aplicarPermissoes(): void {
    const usuario = this.contexto.auth.obterUsuario();
    const podeEditar = usuario !== null && this.podeEditar();
    obrigatorio<HTMLElement>('#fnAvisoLeitura').hidden = usuario === null || podeEditar;
    obrigatorio<HTMLElement>('#fnAreaEdicao').hidden = !podeEditar;
    if (!podeEditar && this.idEdicao !== null) this.sairDaEdicao(false);
  }

  private definirOrcamentos(lista: Orcamento[]): void {
    this.orcamentos = new Map(lista.map((orcamento) => [orcamento.id, orcamento]));
    this.preencherSelectOrcamentos();
  }

  private preencherSelectOrcamentos(): void {
    const select = obrigatorio<HTMLSelectElement>('#fnOrcamento');
    const anterior = select.value;
    select.replaceChildren();

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent =
      this.orcamentos.size > 0 ? 'Nenhum (opcional)' : 'Cadastre um orçamento para vincular';
    select.append(placeholder);

    for (const orcamento of this.orcamentos.values()) {
      const opcao = document.createElement('option');
      opcao.value = String(orcamento.id);
      opcao.textContent = `${orcamento.numero} — ${textoOuTraco(orcamento.clienteNome)}`;
      select.append(opcao);
    }

    select.value = [...this.orcamentos.keys()].some((id) => String(id) === anterior) ? anterior : '';
  }

  private renderizarVazio(): void {
    this.preencherSelectOrcamentos();
    this.renderizarMovimentacoes([]);
    this.renderizarResumoVazio();
    const corpo = obrigatorio<HTMLTableSectionElement>('#tbMovimentacoes');
    const resumo = obrigatorio<HTMLElement>('#fnResumo');
    corpo.setAttribute('aria-busy', 'false');
    resumo.setAttribute('aria-busy', 'false');
  }

  private renderizarMovimentacoes(movimentacoes: MovimentacaoFinanceira[]): void {
    const corpo = obrigatorio<HTMLTableSectionElement>('#tbMovimentacoes');
    corpo.replaceChildren();
    this.movimentacoesVisiveis = new Map(movimentacoes.map((item) => [item.id, item]));

    if (movimentacoes.length === 0) {
      corpo.append(linhaMensagem('Nenhuma movimentação registrada.', COLUNAS));
      return;
    }

    const podeEditar = this.podeEditar();
    for (const movimentacao of movimentacoes) {
      const linha = document.createElement('tr');
      linha.append(
        this.celulaBadge(ROTULOS_TIPO[movimentacao.tipo], CLASSES_TIPO[movimentacao.tipo]),
        criarCelula(textoOuTraco(movimentacao.descricao), 'small text-break'),
        criarCelula(formatarMoeda(movimentacao.valor), 'small text-nowrap text-end fw-semibold'),
        criarCelula(formatarDataCivil(movimentacao.vencimento), 'small text-nowrap'),
        criarCelula(formatarDataCivil(movimentacao.pagamento), 'small text-nowrap'),
        this.celulaBadge(ROTULOS_STATUS[movimentacao.status], CLASSES_STATUS[movimentacao.status]),
        criarCelula(textoOuTraco(movimentacao.orcamentoNumero), 'small text-nowrap')
      );

      const celulaAcoes = document.createElement('td');
      if (podeEditar && movimentacao.status !== 'CANCELADO') {
        const grupo = document.createElement('div');
        grupo.className = 'd-flex flex-wrap gap-1';
        grupo.setAttribute('role', 'group');
        grupo.setAttribute('aria-label', `Ações da movimentação ${movimentacao.descricao}`);
        grupo.append(
          criarBotaoAcao(
            'editar-movimentacao',
            movimentacao.id,
            'Editar',
            `Editar a movimentação ${movimentacao.descricao}`
          )
        );
        if (movimentacao.status === 'PENDENTE') {
          grupo.append(
            criarBotaoAcao(
              'baixar-movimentacao',
              movimentacao.id,
              'Baixar',
              `Baixar a movimentação ${movimentacao.descricao}`,
              'btn-outline-success'
            )
          );
        }
        grupo.append(
          criarBotaoAcao(
            'cancelar-movimentacao',
            movimentacao.id,
            'Cancelar',
            `Cancelar a movimentação ${movimentacao.descricao}`,
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

  private celulaBadge(texto: string, classe: string): HTMLTableCellElement {
    const celula = document.createElement('td');
    celula.append(criarBadge(texto, classe));
    return celula;
  }

  private renderizarResumoVazio(): void {
    obrigatorio<HTMLElement>('#fnReceitas').textContent = '—';
    obrigatorio<HTMLElement>('#fnDespesas').textContent = '—';
    obrigatorio<HTMLElement>('#fnSaldo').textContent = '—';
    obrigatorio<HTMLElement>('#fnInadimplencia').textContent = '—';
    obrigatorio<HTMLElement>('#fnReceitasPendentes').textContent = '—';
    obrigatorio<HTMLElement>('#fnDespesasPendentes').textContent = '—';
  }

  private renderizarResumo(resumo: ResumoFinanceiro): void {
    const receitas = obrigatorio<HTMLElement>('#fnReceitas');
    const despesas = obrigatorio<HTMLElement>('#fnDespesas');
    const saldo = obrigatorio<HTMLElement>('#fnSaldo');
    const inadimplencia = obrigatorio<HTMLElement>('#fnInadimplencia');

    receitas.textContent = formatarMoeda(resumo.receitasPagas);
    despesas.textContent = formatarMoeda(resumo.despesasPagas);
    saldo.textContent = formatarMoeda(resumo.saldo);
    saldo.classList.toggle('text-danger', resumo.saldo < 0);
    saldo.classList.toggle('text-success', resumo.saldo >= 0);
    // O backend devolve 0..1; a formatação em porcentagem fica na camada visual.
    inadimplencia.textContent = formatarPercentual(resumo.inadimplencia);
    obrigatorio<HTMLElement>('#fnReceitasPendentes').textContent = formatarMoeda(
      resumo.receitasPendentes
    );
    obrigatorio<HTMLElement>('#fnDespesasPendentes').textContent = formatarMoeda(
      resumo.despesasPendentes
    );
  }

  private preencherFormulario(movimentacao: MovimentacaoFinanceira): void {
    this.idEdicao = movimentacao.id;
    obrigatorio<HTMLSelectElement>('#fnTipo').value = movimentacao.tipo;
    obrigatorio<HTMLInputElement>('#fnCategoria').value = movimentacao.categoria;
    obrigatorio<HTMLInputElement>('#fnDescricao').value = movimentacao.descricao;
    obrigatorio<HTMLInputElement>('#fnValor').value = textoPreco(movimentacao.valor);
    obrigatorio<HTMLInputElement>('#fnVencimento').value = movimentacao.vencimento;
    obrigatorio<HTMLInputElement>('#fnPagamento').value = movimentacao.pagamento ?? '';
    obrigatorio<HTMLSelectElement>('#fnStatus').value =
      movimentacao.status === 'PAGO' ? 'PAGO' : 'PENDENTE';
    obrigatorio<HTMLInputElement>('#fnFormaPagamento').value = movimentacao.formaPagamento ?? '';
    obrigatorio<HTMLSelectElement>('#fnOrcamento').value =
      movimentacao.orcamentoId === null ? '' : String(movimentacao.orcamentoId);
    obrigatorio<HTMLElement>('#fnTituloForm').textContent = `Editar movimentação #${movimentacao.id}`;
    obrigatorio<HTMLButtonElement>('#btnSalvarMovimentacao').textContent = 'Salvar alterações';
    obrigatorio<HTMLButtonElement>('#btnCancelarEdicaoMovimentacao').hidden = false;
    limparValidacao(obrigatorio<HTMLFormElement>('#formMovimentacao'));
    this.atualizarExigenciaPagamento();
    obrigatorio<HTMLInputElement>('#fnCategoria').focus();
  }

  private sairDaEdicao(focar = true): void {
    this.idEdicao = null;
    const formulario = obrigatorio<HTMLFormElement>('#formMovimentacao');
    formulario.reset();
    limparValidacao(formulario);
    obrigatorio<HTMLSelectElement>('#fnTipo').value = 'RECEITA';
    obrigatorio<HTMLSelectElement>('#fnStatus').value = 'PENDENTE';
    obrigatorio<HTMLInputElement>('#fnVencimento').value = dataCivilClinica(new Date());
    obrigatorio<HTMLElement>('#fnTituloForm').textContent = 'Nova movimentação';
    obrigatorio<HTMLButtonElement>('#btnSalvarMovimentacao').textContent = 'Salvar movimentação';
    obrigatorio<HTMLButtonElement>('#btnCancelarEdicaoMovimentacao').hidden = true;
    this.atualizarExigenciaPagamento();
    if (focar) obrigatorio<HTMLInputElement>('#fnCategoria').focus();
  }

  /** `novalidate` mantém a validação visual padronizada; o atributo ajuda a leitores de tela. */
  private atualizarExigenciaPagamento(): void {
    const pago = obrigatorio<HTMLSelectElement>('#fnStatus').value === 'PAGO';
    obrigatorio<HTMLInputElement>('#fnPagamento').required = pago;
  }

  private async salvar(evento: Event, botao: HTMLButtonElement): Promise<void> {
    evento.preventDefault();
    const formulario = obrigatorio<HTMLFormElement>('#formMovimentacao');
    limparValidacao(formulario);

    if (!this.podeEditar()) {
      mostrarToast('Sua sessão não permite registrar movimentações.', 'erro');
      return;
    }

    const tipoCampo = obrigatorio<HTMLSelectElement>('#fnTipo');
    const tipoTexto = tipoCampo.value;
    const tipoValido = exigir(
      tipoCampo,
      ehTipoEdicao(tipoTexto),
      'Selecione um tipo de movimentação válido.'
    );

    const categoriaCampo = obrigatorio<HTMLInputElement>('#fnCategoria');
    const categoria = categoriaCampo.value.trim();
    const categoriaValida = exigir(
      categoriaCampo,
      categoria.length >= 2 && categoria.length <= ESTOQUE_CATEGORIA_MAXIMO,
      `Informe a categoria (de 2 a ${ESTOQUE_CATEGORIA_MAXIMO} caracteres).`
    );

    const descricaoCampo = obrigatorio<HTMLInputElement>('#fnDescricao');
    const descricao = descricaoCampo.value.trim();
    const descricaoValida = exigir(
      descricaoCampo,
      descricao.length >= 3 && descricao.length <= 200,
      'Informe a descrição (de 3 a 200 caracteres).'
    );

    const valorCampo = obrigatorio<HTMLInputElement>('#fnValor');
    const valor = precoOuNull(valorCampo.value, false);
    const valorValido = exigir(
      valorCampo,
      valor !== null,
      'Informe um valor maior que zero, com até duas casas decimais.'
    );

    const vencimentoCampo = obrigatorio<HTMLInputElement>('#fnVencimento');
    const vencimento = vencimentoCampo.value.trim();
    const vencimentoValido = exigir(
      vencimentoCampo,
      ehDataCivil(vencimento),
      'Informe a data de vencimento (AAAA-MM-DD).'
    );

    const statusCampo = obrigatorio<HTMLSelectElement>('#fnStatus');
    const statusTexto = statusCampo.value;
    const statusValido = exigir(
      statusCampo,
      ehStatusEdicao(statusTexto),
      'Selecione um status válido (pendente ou pago).'
    );

    const pagamentoCampo = obrigatorio<HTMLInputElement>('#fnPagamento');
    const pagamentoTexto = pagamentoCampo.value.trim();
    const pagamentoValido = exigir(
      pagamentoCampo,
      pagamentoTexto === '' || ehDataCivil(pagamentoTexto),
      'Informe a data do pagamento (AAAA-MM-DD).'
    );
    const pagamentoObrigatorio = exigir(
      pagamentoCampo,
      statusTexto !== 'PAGO' || ehDataCivil(pagamentoTexto),
      'Informe a data do pagamento para movimentações pagas.'
    );

    const formaCampo = obrigatorio<HTMLInputElement>('#fnFormaPagamento');
    const formaTexto = formaCampo.value.trim();
    const formaValida = exigir(
      formaCampo,
      formaTexto === '' || (formaTexto.length >= 1 && formaTexto.length <= FORMA_PAGAMENTO_MAXIMA),
      `A forma de pagamento deve ter até ${FORMA_PAGAMENTO_MAXIMA} caracteres.`
    );

    const orcamentoCampo = obrigatorio<HTMLSelectElement>('#fnOrcamento');
    const orcamentoId = orcamentoCampo.value === '' ? null : Number(orcamentoCampo.value);
    const orcamentoValido = exigir(
      orcamentoCampo,
      orcamentoId === null || (Number.isInteger(orcamentoId) && orcamentoId > 0 && this.orcamentos.has(orcamentoId)),
      'Selecione um orçamento válido ou deixe em branco.'
    );

    if (
      !tipoValido ||
      !categoriaValida ||
      !descricaoValida ||
      !valorValido ||
      !vencimentoValido ||
      !statusValido ||
      !pagamentoValido ||
      !pagamentoObrigatorio ||
      !formaValida ||
      !orcamentoValido ||
      valor === null ||
      !ehTipoEdicao(tipoTexto) ||
      !ehStatusEdicao(statusTexto)
    ) {
      focarPrimeiroInvalido(formulario);
      return;
    }

    const dados: DadosMovimentacao = {
      tipo: tipoTexto,
      categoria,
      descricao,
      valor,
      vencimento,
      pagamento: pagamentoTexto === '' ? null : pagamentoTexto,
      status: statusTexto,
      formaPagamento: formaTexto === '' ? null : formaTexto,
      orcamentoId,
    };
    const id = this.idEdicao;

    setCarregando(botao, true, 'Salvando…');
    let salvoComSucesso = false;
    try {
      if (id === null) {
        await window.api.movimentacaoCriar(dados);
        mostrarToast('Movimentação registrada com sucesso.', 'sucesso');
      } else {
        const atualizacao: DadosAtualizacaoMovimentacao = { ...dados, id };
        await window.api.movimentacaoAtualizar(atualizacao);
        mostrarToast('Movimentação atualizada com sucesso.', 'sucesso');
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

  /** Modal próprio para baixa: data e forma de pagamento, sem exigir motivo. */
  private abrirBaixa(movimentacao: MovimentacaoFinanceira): Promise<DadosBaixaMovimentacao | null> {
    const modalElemento = obrigatorio<HTMLDivElement>('#modalBaixaFinanceira');
    const formulario = obrigatorio<HTMLFormElement>('#formBaixaFinanceira');
    const descricao = obrigatorio<HTMLElement>('#modalBaixaFinanceiraDescricao');
    const pagamento = obrigatorio<HTMLInputElement>('#bfPagamento');
    const forma = obrigatorio<HTMLInputElement>('#bfFormaPagamento');
    const confirmar = obrigatorio<HTMLButtonElement>('#btnConfirmarBaixaFinanceira');
    const fechar = obrigatorio<HTMLButtonElement>('#btnFecharBaixaFinanceira');

    descricao.textContent = `${movimentacao.descricao} — ${formatarMoeda(movimentacao.valor)}`;
    pagamento.value = dataCivilClinica(new Date());
    forma.value = movimentacao.formaPagamento ?? '';
    limparValidacao(formulario);

    const modal: BootstrapModal = new window.bootstrap.Modal(modalElemento, {
      backdrop: 'static',
      keyboard: false,
    });

    return new Promise<DadosBaixaMovimentacao | null>((resolve) => {
      let resolvido = false;
      const finalizar = (resposta: DadosBaixaMovimentacao | null): void => {
        if (resolvido) return;
        resolvido = true;
        confirmar.removeEventListener('click', aceitar);
        fechar.removeEventListener('click', recusar);
        formulario.removeEventListener('submit', enviar);
        modalElemento.removeEventListener('hidden.bs.modal', aoOcultar);
        modal.hide();
        resolve(resposta);
      };
      const aceitar = (): void => {
        limparValidacao(formulario);
        const data = pagamento.value.trim();
        const formaTexto = forma.value.trim();
        const dataValida = exigir(pagamento, ehDataCivil(data), 'Informe a data do pagamento (AAAA-MM-DD).');
        const formaValida = exigir(
          forma,
          formaTexto === '' || (formaTexto.length >= 1 && formaTexto.length <= FORMA_PAGAMENTO_MAXIMA),
          `A forma de pagamento deve ter até ${FORMA_PAGAMENTO_MAXIMA} caracteres.`
        );
        if (!dataValida || !formaValida) {
          focarPrimeiroInvalido(formulario);
          return;
        }
        finalizar({
          id: movimentacao.id,
          pagamento: data,
          formaPagamento: formaTexto === '' ? null : formaTexto,
        });
      };
      const enviar = (evento: Event): void => {
        evento.preventDefault();
        aceitar();
      };
      const recusar = (): void => finalizar(null);
      const aoOcultar = (): void => finalizar(null);

      confirmar.addEventListener('click', aceitar);
      fechar.addEventListener('click', recusar);
      formulario.addEventListener('submit', enviar);
      modalElemento.addEventListener('hidden.bs.modal', aoOcultar);
      modalElemento.addEventListener('shown.bs.modal', () => pagamento.focus(), { once: true });
      modal.show();
    });
  }

  private async baixar(movimentacao: MovimentacaoFinanceira, botao: HTMLButtonElement): Promise<void> {
    if (!this.podeEditar() || movimentacao.status !== 'PENDENTE') return;
    const dados = await this.abrirBaixa(movimentacao);
    if (dados === null) return;

    setCarregando(botao, true, 'Baixando…');
    try {
      await window.api.movimentacaoBaixar(dados);
      mostrarToast('Baixa registrada com sucesso.', 'sucesso');
      await this.carregar();
    } catch (erro) {
      mostrarToast(mensagemErro(erro), 'erro');
    } finally {
      setCarregando(botao, false);
    }
  }

  private async cancelar(movimentacao: MovimentacaoFinanceira, botao: HTMLButtonElement): Promise<void> {
    if (!this.podeEditar() || movimentacao.status === 'CANCELADO') return;
    const motivo = await pedirMotivo({
      titulo: 'Cancelar movimentação',
      descricao:
        `A movimentação "${movimentacao.descricao}" será cancelada. ` +
        'O motivo, o responsável e o instante ficam registrados na auditoria.',
      rotuloConfirmar: 'Cancelar movimentação',
    });
    if (motivo === null) return;

    const dados: DadosInativacao = { id: movimentacao.id, motivo };
    setCarregando(botao, true, 'Cancelando…');
    try {
      await window.api.movimentacaoCancelar(dados);
      if (this.idEdicao === movimentacao.id) this.sairDaEdicao(false);
      mostrarToast('Movimentação cancelada. O motivo foi registrado na auditoria.', 'sucesso');
      await this.carregar();
    } catch (erro) {
      mostrarToast(mensagemErro(erro), 'erro');
    } finally {
      setCarregando(botao, false);
    }
  }

  private configurarEventos(): void {
    obrigatorio<HTMLFormElement>('#formMovimentacao').addEventListener('submit', (evento) => {
      void this.salvar(evento, obrigatorio<HTMLButtonElement>('#btnSalvarMovimentacao'));
    });
    obrigatorio<HTMLButtonElement>('#btnCancelarEdicaoMovimentacao').addEventListener('click', () => {
      this.sairDaEdicao();
    });
    obrigatorio<HTMLSelectElement>('#fnStatus').addEventListener('change', () => {
      this.atualizarExigenciaPagamento();
    });

    obrigatorio<HTMLTableSectionElement>('#tbMovimentacoes').addEventListener('click', (evento) => {
      const alvo = evento.target;
      if (!(alvo instanceof Element)) return;
      const botao = alvo.closest<HTMLButtonElement>('button[data-acao][data-id]');
      if (!botao || botao.disabled || !this.podeEditar()) return;
      const id = Number(botao.dataset.id);
      if (!Number.isInteger(id) || id <= 0) return;
      const movimentacao = this.movimentacoesVisiveis.get(id);
      if (movimentacao === undefined || movimentacao.status === 'CANCELADO') return;

      const acao = botao.dataset.acao;
      if (acao === 'editar-movimentacao') this.preencherFormulario(movimentacao);
      else if (acao === 'baixar-movimentacao') void this.baixar(movimentacao, botao);
      else if (acao === 'cancelar-movimentacao') void this.cancelar(movimentacao, botao);
    });
  }
}
