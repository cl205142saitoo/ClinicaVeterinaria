/** Integrações: IBGE (município), feriados nacionais e resumo da API local. */

import type { Cliente, Feriado, MunicipioIbge, ResumoDashboard } from '../types';
import {
  exigir,
  focarPrimeiroInvalido,
  formatarDataCivil,
  limparValidacao,
  mensagemErro,
  mostrarToast,
  obrigatorio,
  setCarregando,
  textoOuTraco,
} from '../ui';
import type { ContextoApp } from './contexto';

const TEXTO_INDISPONIVEL = 'Serviço indisponível no momento. Os dados locais continuam disponíveis.';

export class IntegracaoController {
  private clientes = new Map<number, Cliente>();
  private feriados: Feriado[] = [];
  private eventosLigados = false;

  constructor(private readonly contexto: ContextoApp) {}

  iniciar(): void {
    if (this.eventosLigados) return;
    this.eventosLigados = true;

    obrigatorio<HTMLButtonElement>('#btnBuscarMunicipio').addEventListener('click', () => {
      void this.buscarMunicipio();
    });
    obrigatorio<HTMLButtonElement>('#btnRecarregarFeriados').addEventListener('click', () => {
      void this.carregarFeriados();
    });
    obrigatorio<HTMLButtonElement>('#btnRecarregarResumo').addEventListener('click', () => {
      void this.carregarResumo();
    });
  }

  /** Atualiza o contexto usado na busca de município sem duplicar chamadas de API. */
  definirClientes(clientes: Cliente[]): void {
    this.clientes = new Map(clientes.map((cliente) => [cliente.id, cliente]));
    this.preencherSelectClientes();
  }

  /** Recarrega as três integrações com tratamento de falha independente. */
  async carregar(): Promise<void> {
    await Promise.all([this.carregarFeriados(), this.carregarResumo()]);
    this.preencherSelectClientes();
    this.limparMunicipio();
  }

  limpar(): void {
    this.clientes.clear();
    this.feriados = [];
    this.preencherSelectClientes();
    this.limparMunicipio();
    this.definirStatus('#inStatusFeriados', 'Selecione “Atualizar” para consultar os feriados do ano.');
    this.definirStatus('#inStatusResumo', 'Selecione “Atualizar” para consultar o resumo do sistema.');
    this.renderizarFeriados([]);
    this.renderizarResumo(null);
    obrigatorio<HTMLDivElement>('#inAvisoFeriadosAgenda').hidden = true;
  }

  private definirStatus(seletor: string, texto: string, erro = false): void {
    const status = obrigatorio<HTMLElement>(seletor);
    status.textContent = texto;
    status.classList.toggle('text-danger', erro);
    status.classList.toggle('text-muted', !erro);
  }

  private preencherSelectClientes(): void {
    const select = obrigatorio<HTMLSelectElement>('#inCliente');
    const anterior = select.value;
    select.replaceChildren();

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = this.clientes.size > 0 ? 'Selecione um cliente…' : 'Cadastre um cliente primeiro';
    select.append(placeholder);

    for (const cliente of this.clientes.values()) {
      const opcao = document.createElement('option');
      opcao.value = String(cliente.id);
      opcao.textContent = `${cliente.nome} — ${cliente.cidade}/${cliente.uf}`;
      select.append(opcao);
    }

    select.value = [...this.clientes.keys()].some((id) => String(id) === anterior) ? anterior : '';
    const botao = obrigatorio<HTMLButtonElement>('#btnBuscarMunicipio');
    botao.disabled = this.clientes.size === 0;
  }

  private limparMunicipio(): void {
    obrigatorio<HTMLOutputElement>('#inMunicipioResultado').textContent = '—';
    this.definirStatus('#inStatusMunicipio', 'Selecione um cliente cadastrado para consultar o código IBGE.');
    limparValidacao(obrigatorio<HTMLFormElement>('#formIntegracaoMunicipio'));
  }

  private formatarMunicipio(municipio: MunicipioIbge | null): string {
    if (municipio === null) return 'Município não encontrado na base do IBGE. Confira cidade e UF do cliente.';
    return `${municipio.nome} — ${municipio.uf} · código IBGE: ${municipio.id}`;
  }

  private async buscarMunicipio(): Promise<void> {
    const formulario = obrigatorio<HTMLFormElement>('#formIntegracaoMunicipio');
    const select = obrigatorio<HTMLSelectElement>('#inCliente');
    const botao = obrigatorio<HTMLButtonElement>('#btnBuscarMunicipio');
    limparValidacao(formulario);
    this.definirStatus('#inStatusMunicipio', 'Consultando o IBGE…');

    const id = Number(select.value);
    const cliente = Number.isInteger(id) && id > 0 ? this.clientes.get(id) : undefined;
    if (cliente === undefined) {
      exigir(select, false, 'Selecione um cliente com cidade e UF cadastrados.');
      this.definirStatus('#inStatusMunicipio', 'Selecione um cliente válido.', true);
      focarPrimeiroInvalido(formulario);
      return;
    }

    const cidade = cliente.cidade.trim();
    const uf = cliente.uf.trim().toUpperCase();
    if (cidade === '' || !/^[A-Z]{2}$/.test(uf)) {
      this.definirStatus(
        '#inStatusMunicipio',
        'O cliente selecionado não possui cidade e UF válidos. Atualize o cadastro.',
        true
      );
      return;
    }

    setCarregando(botao, true, 'Buscando…');
    try {
      const municipio = await window.api.buscarMunicipioIbge(cidade, uf);
      obrigatorio<HTMLOutputElement>('#inMunicipioResultado').textContent = this.formatarMunicipio(municipio);
      this.definirStatus('#inStatusMunicipio', 'Consulta ao IBGE concluída.');
      if (municipio === null) mostrarToast('Município não encontrado na base do IBGE.', 'info');
    } catch (erro) {
      mostrarToast(mensagemErro(erro), 'erro');
      this.definirStatus('#inStatusMunicipio', TEXTO_INDISPONIVEL, true);
      obrigatorio<HTMLOutputElement>('#inMunicipioResultado').textContent = `${cidade} — ${uf} (dado local do cliente)`;
    } finally {
      setCarregando(botao, false);
    }
  }

  private async carregarFeriados(): Promise<void> {
    const botao = obrigatorio<HTMLButtonElement>('#btnRecarregarFeriados');
    const ano = new Date().getFullYear();
    this.definirStatus('#inStatusFeriados', `Consultando os feriados nacionais de ${ano}…`);

    setCarregando(botao, true, 'Atualizando…');
    try {
      const feriados = await window.api.listarFeriados(ano);
      this.feriados = feriados;
      this.renderizarFeriados(feriados);
      this.definirStatus(
        '#inStatusFeriados',
        feriados.length === 0
          ? `Nenhum feriado nacional retornado para ${ano}.`
          : `${feriados.length} feriados nacionais de ${ano} carregados.`
      );
    } catch (erro) {
      mostrarToast(mensagemErro(erro), 'erro');
      this.feriados = [];
      this.renderizarFeriados([]);
      this.definirStatus('#inStatusFeriados', TEXTO_INDISPONIVEL, true);
    } finally {
      setCarregando(botao, false);
    }
  }

  private renderizarFeriados(feriados: Feriado[]): void {
    const lista = obrigatorio<HTMLUListElement>('#inListaFeriados');
    lista.replaceChildren();
    if (feriados.length === 0) {
      const item = document.createElement('li');
      item.className = 'list-group-item text-muted fst-italic';
      item.textContent = 'Nenhum feriado disponível.';
      lista.append(item);
      return;
    }

    for (const feriado of feriados) {
      const item = document.createElement('li');
      item.className = 'list-group-item d-flex justify-content-between gap-2 small';
      const nome = document.createElement('span');
      nome.textContent = feriado.nome;
      const data = document.createElement('span');
      data.className = 'text-nowrap text-muted';
      data.textContent = formatarDataCivil(feriado.data);
      item.append(nome, data);
      lista.append(item);
    }

    this.atualizarAvisoAgenda();
  }

  private atualizarAvisoAgenda(): void {
    const aviso = obrigatorio<HTMLDivElement>('#inAvisoFeriadosAgenda');
    const texto = obrigatorio<HTMLElement>('#inAvisoFeriadosTexto');
    const proximo = this.proximoFeriado();
    aviso.hidden = proximo === null;
    texto.textContent =
      proximo === null
        ? ''
        : `Atenção: ${proximo.nome} em ${formatarDataCivil(proximo.data)}. Verifique a agenda antes de confirmar consultas.`;
  }

  private proximoFeriado(): Feriado | null {
    const hoje = new Date();
    const hojeCivil = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(
      hoje.getDate()
    ).padStart(2, '0')}`;
    const futuros = this.feriados.filter((feriado) => feriado.data >= hojeCivil);
    return futuros.length > 0 ? futuros[0] : null;
  }

  private async carregarResumo(): Promise<void> {
    const botao = obrigatorio<HTMLButtonElement>('#btnRecarregarResumo');
    this.definirStatus('#inStatusResumo', 'Consultando o resumo da API local…');

    setCarregando(botao, true, 'Atualizando…');
    try {
      const resumo = await window.api.resumoDashboard();
      this.renderizarResumo(resumo);
      this.definirStatus('#inStatusResumo', 'Resumo atualizado pela API local do sistema.');
    } catch (erro) {
      mostrarToast(mensagemErro(erro), 'erro');
      this.renderizarResumo(null);
      this.definirStatus('#inStatusResumo', TEXTO_INDISPONIVEL, true);
    } finally {
      setCarregando(botao, false);
    }
  }

  private renderizarResumo(resumo: ResumoDashboard | null): void {
    const valores: Readonly<Record<string, string>> = {
      '#inResumoClientes': resumo === null ? '—' : String(resumo.clientesAtivos),
      '#inResumoPets': resumo === null ? '—' : String(resumo.petsAtivos),
      '#inResumoConsultasHoje': resumo === null ? '—' : String(resumo.consultasHoje),
      '#inResumoAgendadas': resumo === null ? '—' : String(resumo.consultasAgendadas),
      '#inResumoVacinasHoje': resumo === null ? '—' : String(resumo.vacinasRegistradasHoje),
    };
    for (const [seletor, valor] of Object.entries(valores)) {
      obrigatorio<HTMLElement>(seletor).textContent = valor;
    }
  }
}
