/** Agenda de consultas: filtros, cadastro, ações, reagendamento e exclusão auditada. */

import { STATUS_CANCELAVEIS, STATUS_CONCLUIVEIS } from '../../shared/constants';
import type { ConsultaAgenda, DadosAtualizacaoConsulta, FiltroAgenda, Pet, Role, VeterinarioResumo } from '../types';
import {
  criarBadge,
  criarBotaoAcao,
  criarCelula,
  exigir,
  focarPrimeiroInvalido,
  formatarDataHora,
  linhaMensagem,
  limparValidacao,
  marcarInvalido,
  mensagemErro,
  mostrarToast,
  obrigatorio,
  pedirMotivo,
  setCarregando,
  textoOuTraco,
} from '../ui';
import type { ContextoApp } from './contexto';

const ROTULOS_STATUS: Readonly<Record<string, string>> = {
  AGENDADA: 'Agendada',
  CONFIRMADA: 'Confirmada',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
};

const CLASSES_STATUS: Readonly<Record<string, string>> = {
  AGENDADA: 'text-bg-primary',
  CONFIRMADA: 'text-bg-info',
  CONCLUIDA: 'text-bg-success',
  CANCELADA: 'text-bg-secondary',
};

export class AgendaController {
  private filtroAtual: FiltroAgenda | undefined;
  private selectsCarregados = false;
  private sequenciaCarregamento = 0;
  private sequenciaVeterinarios = 0;
  private consultasVisiveis = new Map<number, ConsultaAgenda>();
  private veterinarios: VeterinarioResumo[] = [];
  private idReagendamento: number | null = null;
  private eventosLigados = false;

  constructor(private readonly contexto: ContextoApp) {}

  iniciar(): void {
    if (this.eventosLigados) return;
    this.eventosLigados = true;
    this.configurarFormulario();
    this.configurarFiltros();
    this.configurarAcoes();
    this.configurarReagendamento();
    obrigatorio<HTMLButtonElement>('#abaAgenda-tab').addEventListener('shown.bs.tab', () => {
      if (this.contexto.auth.obterUsuario() === null) return;
      void this.carregarVeterinarios().catch((erro: unknown) =>
        mostrarToast(mensagemErro(erro), 'erro')
      );
    });
  }

  /** Recarrega selects e tabela; usado também pelo contexto compartilhado. */
  async carregar(filtro: FiltroAgenda | undefined = this.filtroAtual): Promise<void> {
    const corpo = obrigatorio<HTMLTableSectionElement>('#tbAgenda');
    const sequencia = this.sequenciaCarregamento + 1;
    this.sequenciaCarregamento = sequencia;
    corpo.setAttribute('aria-busy', 'true');
    corpo.replaceChildren(linhaMensagem('Carregando consultas…', 7));

    try {
      if (!this.selectsCarregados) await this.carregarSelects();
      const consultas = await window.api.consultasListar(filtro);
      if (sequencia === this.sequenciaCarregamento) this.renderizar(consultas);
    } catch (erro) {
      const mensagem = mensagemErro(erro);
      if (sequencia === this.sequenciaCarregamento) {
        corpo.replaceChildren(
          linhaMensagem('Não foi possível carregar as consultas.', 7, 'text-center text-danger py-4')
        );
        mostrarToast(mensagem, 'erro');
      }
    } finally {
      if (sequencia === this.sequenciaCarregamento) corpo.removeAttribute('aria-busy');
    }
  }

  /** Preenche o seletor de pets da agenda preservando a seleção atual. */
  preencherSelectPets(pets: Pet[]): void {
    this.preencherSelect(
      '#aPet',
      pets.map((pet) => ({ id: pet.id, texto: `${pet.nome} — tutor(a): ${pet.cliente?.nome ?? '—'}` })),
      'Cadastre um pet primeiro'
    );
  }

  /** Limpa a agenda ao sair e invalida carregamentos pendentes. */
  limpar(): void {
    this.sequenciaCarregamento += 1;
    this.sequenciaVeterinarios += 1;
    this.filtroAtual = undefined;
    this.selectsCarregados = false;
    this.idReagendamento = null;
    for (const seletor of ['#aPet', '#aVeterinario', '#reVeterinario']) {
      const select = obrigatorio<HTMLSelectElement>(seletor);
      select.replaceChildren();
      select.disabled = false;
    }
    for (const seletor of ['#aDe', '#aAte', '#aDataHora', '#aMotivo', '#reDataHora', '#reMotivo']) {
      obrigatorio<HTMLInputElement | HTMLTextAreaElement>(seletor).value = '';
    }
    const formularioFiltros = obrigatorio<HTMLFormElement>('#formFiltrosAgenda');
    const formularioConsulta = obrigatorio<HTMLFormElement>('#formAgenda');
    limparValidacao(formularioFiltros);
    limparValidacao(formularioConsulta);
    this.renderizar([]);
  }

  private rotuloStatus(status: string): string {
    return ROTULOS_STATUS[status] ?? status;
  }

  /** O fuso da clínica é o fuso local da máquina: não fixar `timeZone` é intencional. */
  private dataLocalParaIso(data: string, fimDoDia: boolean): string | null {
    const horario = fimDoDia ? '23:59:59' : '00:00:00';
    try {
      return new Date(`${data}T${horario}`).toISOString();
    } catch {
      return null;
    }
  }

  private preencherSelect(
    seletor: string,
    itens: readonly { id: number; texto: string }[],
    textoVazio: string
  ): HTMLSelectElement {
    const select = obrigatorio<HTMLSelectElement>(seletor);
    const anterior = select.value;
    select.replaceChildren();

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = itens.length ? 'Selecione…' : textoVazio;
    select.append(placeholder);

    for (const item of itens) {
      const opcao = document.createElement('option');
      opcao.value = String(item.id);
      opcao.textContent = item.texto;
      select.append(opcao);
    }

    select.value = itens.some((item) => String(item.id) === anterior) ? anterior : '';
    return select;
  }

  private descricaoVeterinario(veterinario: ConsultaAgenda['veterinario']): string {
    const crmv = veterinario.crmv?.trim();
    return `${veterinario.nome} — ${crmv && crmv !== '' ? crmv : 'CRMV não informado'}`;
  }

  private preencherSelectVeterinarios(veterinarios: VeterinarioResumo[]): void {
    const usuario = this.contexto.auth.obterUsuario();
    const itens = veterinarios.map((veterinario) => ({
      id: veterinario.id,
      texto: this.descricaoVeterinario(veterinario),
    }));

    if (usuario?.role === 'VETERINARIO' && !itens.some((item) => item.id === usuario.id)) {
      itens.push({ id: usuario.id, texto: `${usuario.nome} — CRMV não informado` });
    }

    const select = this.preencherSelect('#aVeterinario', itens, 'Nenhum veterinário ativo cadastrado');
    if (usuario?.role === 'VETERINARIO') {
      select.value = String(usuario.id);
      select.disabled = true;
    } else {
      select.disabled = false;
    }
  }

  private async carregarVeterinarios(): Promise<void> {
    const sequencia = this.sequenciaVeterinarios + 1;
    this.sequenciaVeterinarios = sequencia;
    const veterinarios = await window.api.veterinariosListar();
    if (sequencia !== this.sequenciaVeterinarios) return;
    this.veterinarios = veterinarios;
    this.preencherSelectVeterinarios(veterinarios);
    this.preencherSelectReagendamento();
  }

  private async carregarSelects(): Promise<void> {
    const pets = await window.api.listarPets();
    this.preencherSelectPets(pets);
    await this.carregarVeterinarios();
    this.selectsCarregados = true;
  }

  private preencherSelectReagendamento(): void {
    const itens = this.veterinarios.map((veterinario) => ({
      id: veterinario.id,
      texto: this.descricaoVeterinario(veterinario),
    }));
    this.preencherSelect('#reVeterinario', itens, 'Nenhum veterinário ativo cadastrado');
  }

  private renderizar(consultas: ConsultaAgenda[]): void {
    const corpo = obrigatorio<HTMLTableSectionElement>('#tbAgenda');
    corpo.replaceChildren();
    this.consultasVisiveis = new Map(consultas.map((consulta) => [consulta.id, consulta]));

    if (consultas.length === 0) {
      corpo.append(linhaMensagem('Nenhuma consulta encontrada para o período.', 7));
      return;
    }

    for (const consulta of consultas) {
      const linha = document.createElement('tr');
      linha.append(
        criarCelula(formatarDataHora(consulta.dataHora)),
        criarCelula(consulta.pet.nome),
        criarCelula(consulta.pet.clienteNome),
        criarCelula(this.descricaoVeterinario(consulta.veterinario)),
        criarCelula(consulta.motivo, 'text-break'),
      );

      const status = document.createElement('td');
      status.append(
        criarBadge(
          this.rotuloStatus(consulta.status),
          CLASSES_STATUS[consulta.status] ?? 'text-bg-secondary'
        )
      );
      linha.append(status);

      const acoes = document.createElement('td');
      const botoes = this.criarBotoesAcao(consulta);
      if (botoes.length === 0) {
        acoes.textContent = '—';
      } else {
        const grupo = document.createElement('div');
        grupo.className = 'd-flex flex-wrap gap-1';
        grupo.setAttribute('role', 'group');
        grupo.setAttribute('aria-label', `Ações da consulta de ${consulta.pet.nome}`);
        grupo.append(...botoes);
        acoes.append(grupo);
      }
      linha.append(acoes);
      corpo.append(linha);
    }
  }

  private criarBotaoAcao(acao: string, consulta: ConsultaAgenda): HTMLButtonElement {
    const rotulos: Readonly<Record<string, string>> = {
      cancelar: 'Cancelar',
      concluir: 'Concluir',
      reagendar: 'Reagendar',
      excluir: 'Excluir',
    };
    const classes: Readonly<Record<string, string>> = {
      cancelar: 'btn-outline-danger',
      concluir: 'btn-outline-success',
      reagendar: 'btn-outline-primary',
      excluir: 'btn-outline-danger danger',
    };
    const botao = criarBotaoAcao(
      acao,
      consulta.id,
      rotulos[acao] ?? acao,
      `${rotulos[acao] ?? acao} consulta de ${consulta.pet.nome} em ${formatarDataHora(consulta.dataHora)}`,
      classes[acao] ?? 'btn-outline-secondary'
    );
    return botao;
  }

  /** Esconder botões é usabilidade: a autoridade é o backend. */
  private criarBotoesAcao(consulta: ConsultaAgenda): HTMLButtonElement[] {
    const usuario = this.contexto.auth.obterUsuario();
    if (usuario === null) return [];

    const papel: Role = usuario.role;
    const responsavel = usuario.id === consulta.veterinarioId;
    const cancelavel = STATUS_CANCELAVEIS.some((status) => status === consulta.status);
    const concluivel = STATUS_CONCLUIVEIS.some((status) => status === consulta.status);
    const reagendavel = consulta.status === 'AGENDADA' || consulta.status === 'CONFIRMADA';
    const botoes: HTMLButtonElement[] = [];

    const podeCancelar =
      papel === 'ADMIN' || papel === 'ATENDENTE' || (papel === 'VETERINARIO' && responsavel);
    const podeConcluir = papel === 'ADMIN' || (papel === 'VETERINARIO' && responsavel);
    const podeReagendar = papel === 'ADMIN' || papel === 'ATENDENTE' || (papel === 'VETERINARIO' && responsavel);
    const podeExcluir = papel === 'ADMIN';

    if (reagendavel && podeReagendar) botoes.push(this.criarBotaoAcao('reagendar', consulta));
    if (cancelavel && podeCancelar) botoes.push(this.criarBotaoAcao('cancelar', consulta));
    if (concluivel && podeConcluir) botoes.push(this.criarBotaoAcao('concluir', consulta));
    if (podeExcluir) botoes.push(this.criarBotaoAcao('excluir', consulta));
    return botoes;
  }

  private configurarFormulario(): void {
    const formulario = obrigatorio<HTMLFormElement>('#formAgenda');
    const botaoSalvar = obrigatorio<HTMLButtonElement>('#btnSalvarAgenda');
    const pet = obrigatorio<HTMLSelectElement>('#aPet');
    const veterinario = obrigatorio<HTMLSelectElement>('#aVeterinario');
    const dataHora = obrigatorio<HTMLInputElement>('#aDataHora');
    const motivo = obrigatorio<HTMLTextAreaElement>('#aMotivo');

    formulario.addEventListener('submit', (evento) => {
      void this.agendar(evento, botaoSalvar, pet, veterinario, dataHora, motivo);
    });
  }

  private async agendar(
    evento: Event,
    botao: HTMLButtonElement,
    pet: HTMLSelectElement,
    veterinario: HTMLSelectElement,
    dataHora: HTMLInputElement,
    motivo: HTMLTextAreaElement
  ): Promise<void> {
    evento.preventDefault();
    const formulario = obrigatorio<HTMLFormElement>('#formAgenda');
    limparValidacao(formulario);

    const usuario = this.contexto.auth.obterUsuario();
    const ehVeterinario = usuario !== null && usuario.role === 'VETERINARIO';
    const idVeterinario = ehVeterinario && usuario !== null ? usuario.id : Number(veterinario.value);
    const instante = dataHora.value === '' ? null : new Date(dataHora.value);

    const textoMotivo = motivo.value.trim();
    const motivoValido = textoMotivo.length >= 3 && textoMotivo.length <= 500;
    const dataValida =
      dataHora.value !== '' &&
      dataHora.checkValidity() &&
      instante !== null &&
      !Number.isNaN(instante.getTime());
    const futura = instante !== null && !Number.isNaN(instante.getTime()) && instante.getTime() > Date.now();

    const resultados = [
      exigir(pet, pet.value !== '', 'Selecione o pet da consulta.'),
      exigir(
        veterinario,
        ehVeterinario || (Number.isInteger(idVeterinario) && idVeterinario > 0),
        'Selecione o veterinário responsável.'
      ),
      exigir(dataHora, dataValida, 'Informe uma data e um horário válidos.'),
      exigir(motivo, motivoValido, 'Informe o motivo da consulta (de 3 a 500 caracteres).'),
    ];
    if (dataValida && !futura) {
      marcarInvalido(dataHora, 'A data e o horário da consulta devem estar no futuro.');
      resultados[2] = false;
    }
    if (!resultados.every(Boolean) || instante === null) {
      focarPrimeiroInvalido(formulario);
      return;
    }

    setCarregando(botao, true, 'Agendando…');
    try {
      await window.api.consultasCriar({
        petId: Number(pet.value),
        veterinarioId: idVeterinario,
        dataHora: instante.toISOString(),
        motivo: textoMotivo,
      });
      formulario.reset();
      limparValidacao(formulario);
      if (ehVeterinario && usuario !== null) veterinario.value = String(usuario.id);
      mostrarToast('Consulta agendada com sucesso.', 'sucesso');
      pet.focus();
      await this.carregar();
    } catch (erro) {
      const mensagem = mensagemErro(erro);
      marcarInvalido(dataHora, mensagem);
      mostrarToast(mensagem, 'erro');
      dataHora.focus();
    } finally {
      setCarregando(botao, false);
    }
  }

  private configurarFiltros(): void {
    const formulario = obrigatorio<HTMLFormElement>('#formFiltrosAgenda');
    const de = obrigatorio<HTMLInputElement>('#aDe');
    const ate = obrigatorio<HTMLInputElement>('#aAte');
    const botaoLimpar = obrigatorio<HTMLButtonElement>('#btnLimparFiltrosAgenda');

    formulario.addEventListener('submit', (evento) => {
      evento.preventDefault();
      limparValidacao(formulario);

      const valorDe = de.value;
      const valorAte = ate.value;
      const formatoData = /^\d{4}-\d{2}-\d{2}$/;
      const deValido = valorDe === '' || (formatoData.test(valorDe) && de.checkValidity());
      const ateValido = valorAte === '' || (formatoData.test(valorAte) && ate.checkValidity());
      const ordemValida = valorDe === '' || valorAte === '' || valorDe <= valorAte;

      exigir(de, deValido, 'Informe uma data inicial válida.');
      exigir(ate, ateValido, 'Informe uma data final válida.');
      if (!ordemValida) marcarInvalido(ate, 'A data final deve ser igual ou posterior à inicial.');

      const filtro: FiltroAgenda = {};
      let datasConvertidas = true;
      if (deValido && valorDe !== '') {
        const inicio = this.dataLocalParaIso(valorDe, false);
        if (inicio === null) {
          marcarInvalido(de, 'Data inicial inválida. Confira o valor digitado.');
          datasConvertidas = false;
        } else {
          filtro.de = inicio;
        }
      }
      if (ateValido && valorAte !== '') {
        const fim = this.dataLocalParaIso(valorAte, true);
        if (fim === null) {
          marcarInvalido(ate, 'Data final inválida. Confira o valor digitado.');
          datasConvertidas = false;
        } else {
          filtro.ate = fim;
        }
      }

      if (!deValido || !ateValido || !ordemValida || !datasConvertidas) {
        focarPrimeiroInvalido(formulario);
        mostrarToast('Confira as datas do período antes de filtrar.', 'erro');
        return;
      }

      this.filtroAtual = Object.keys(filtro).length === 0 ? undefined : filtro;
      void this.carregar(this.filtroAtual);
    });

    botaoLimpar.addEventListener('click', () => {
      formulario.reset();
      limparValidacao(formulario);
      this.filtroAtual = undefined;
      void this.carregar();
      de.focus();
    });
  }

  private pedirMotivoCancelamento(): Promise<string | null> {
    return pedirMotivo({
      titulo: 'Cancelar consulta',
      descricao: 'O cancelamento é auditado: o motivo informado, a data e o responsável ficam registrados.',
      rotuloConfirmar: 'Confirmar cancelamento',
    });
  }

  private confirmarConclusao(botao: HTMLButtonElement): Promise<boolean> {
    const modalElemento = obrigatorio<HTMLDivElement>('#modalConfirmarConsulta');
    const descricao = obrigatorio<HTMLElement>('#modalConfirmarConsultaDescricao');
    const confirmar = obrigatorio<HTMLButtonElement>('#btnConfirmarConclusao');
    const voltar = obrigatorio<HTMLButtonElement>('#btnFecharConfirmacaoConsulta');
    const pet = botao.dataset.pet ?? 'o pet';
    const dataHora = botao.dataset.dataHora ?? '';

    descricao.textContent =
      `Deseja concluir a consulta de ${pet} em ${formatarDataHora(dataHora)}? Esta ação não pode ser desfeita.`;
    confirmar.textContent = 'Concluir consulta';
    const modal = new window.bootstrap.Modal(modalElemento, { backdrop: 'static', keyboard: false });

    return new Promise<boolean>((resolve) => {
      let resolvido = false;
      const finalizar = (resposta: boolean): void => {
        if (resolvido) return;
        resolvido = true;
        confirmar.removeEventListener('click', aceitar);
        voltar.removeEventListener('click', recusar);
        modalElemento.removeEventListener('hidden.bs.modal', aoOcultar);
        modal.hide();
        resolve(resposta);
      };
      const aceitar = (): void => finalizar(true);
      const recusar = (): void => finalizar(false);
      const aoOcultar = (): void => finalizar(false);

      confirmar.addEventListener('click', aceitar);
      voltar.addEventListener('click', recusar);
      modalElemento.addEventListener('hidden.bs.modal', aoOcultar);
      modalElemento.addEventListener('shown.bs.modal', () => confirmar.focus(), { once: true });
      modal.show();
    });
  }

  private configurarAcoes(): void {
    const corpo = obrigatorio<HTMLTableSectionElement>('#tbAgenda');
    corpo.addEventListener('click', (evento) => {
      const alvo = evento.target;
      if (!(alvo instanceof Element)) return;
      const botao = alvo.closest<HTMLButtonElement>('button[data-acao][data-id]');
      if (botao === null || botao.disabled) return;

      const id = Number(botao.dataset.id);
      if (!Number.isInteger(id) || id <= 0) return;
      const consulta = this.consultasVisiveis.get(id);
      if (consulta === undefined) return;

      if (botao.dataset.acao === 'cancelar') void this.cancelar(consulta, botao);
      else if (botao.dataset.acao === 'concluir') void this.concluir(consulta, botao);
      else if (botao.dataset.acao === 'reagendar') this.abrirReagendamento(consulta);
      else if (botao.dataset.acao === 'excluir') void this.excluir(consulta, botao);
    });
  }

  private async cancelar(consulta: ConsultaAgenda, botao: HTMLButtonElement): Promise<void> {
    const motivo = await this.pedirMotivoCancelamento();
    if (motivo === null) return;

    setCarregando(botao, true, 'Cancelando…');
    try {
      await window.api.consultasCancelar(consulta.id, motivo);
      mostrarToast('Consulta cancelada. O motivo foi registrado na auditoria.', 'sucesso');
      await this.carregar();
    } catch (erro) {
      mostrarToast(mensagemErro(erro), 'erro');
    } finally {
      setCarregando(botao, false);
    }
  }

  private async concluir(consulta: ConsultaAgenda, botao: HTMLButtonElement): Promise<void> {
    if (!(await this.confirmarConclusao(botao))) return;

    setCarregando(botao, true, 'Concluindo…');
    try {
      await window.api.consultasConcluir(consulta.id);
      mostrarToast('Consulta concluída com sucesso.', 'sucesso');
      await this.carregar();
    } catch (erro) {
      mostrarToast(mensagemErro(erro), 'erro');
    } finally {
      setCarregando(botao, false);
    }
  }

  private async excluir(consulta: ConsultaAgenda, botao: HTMLButtonElement): Promise<void> {
    if (!this.contexto.auth.isAdmin()) return;
    const motivo = await pedirMotivo({
      titulo: 'Excluir registro de consulta',
      descricao:
        `A consulta de ${consulta.pet.nome} em ${formatarDataHora(consulta.dataHora)} ` +
        'será marcada como excluída. O registro é preservado para auditoria.',
      rotuloConfirmar: 'Excluir consulta',
    });
    if (motivo === null) return;

    setCarregando(botao, true, 'Excluindo…');
    try {
      await window.api.consultasExcluir({ id: consulta.id, motivo });
      mostrarToast('Registro de consulta excluído. O motivo foi registrado na auditoria.', 'sucesso');
      await this.carregar();
    } catch (erro) {
      mostrarToast(mensagemErro(erro), 'erro');
    } finally {
      setCarregando(botao, false);
    }
  }

  private configurarReagendamento(): void {
    const formulario = obrigatorio<HTMLFormElement>('#formReagendarConsulta');
    const botaoSalvar = obrigatorio<HTMLButtonElement>('#btnSalvarReagendamento');
    const botaoFechar = obrigatorio<HTMLButtonElement>('#btnFecharReagendamento');
    const modalElemento = obrigatorio<HTMLDivElement>('#modalReagendarConsulta');

    formulario.addEventListener('submit', (evento) => {
      void this.reagendar(evento, botaoSalvar);
    });
    botaoFechar.addEventListener('click', () => {
      new window.bootstrap.Modal(modalElemento).hide();
    });
    modalElemento.addEventListener('hidden.bs.modal', () => {
      this.idReagendamento = null;
      limparValidacao(formulario);
    });
  }

  private abrirReagendamento(consulta: ConsultaAgenda): void {
    const usuario = this.contexto.auth.obterUsuario();
    if (usuario === null) return;
    if (usuario.role === 'VETERINARIO' && usuario.id !== consulta.veterinarioId) return;

    this.idReagendamento = consulta.id;
    obrigatorio<HTMLInputElement>('#reConsultaId').value = String(consulta.id);
    obrigatorio<HTMLElement>('#rePetInfo').textContent =
      `${consulta.pet.nome} — tutor(a): ${consulta.pet.clienteNome} — atual: ${formatarDataHora(consulta.dataHora)}`;
    obrigatorio<HTMLTextAreaElement>('#reMotivo').value = consulta.motivo;

    const data = new Date(consulta.dataHora);
    obrigatorio<HTMLInputElement>('#reDataHora').value = Number.isNaN(data.getTime())
      ? ''
      : this.paraDatetimeLocal(data);

    const veterinario = obrigatorio<HTMLSelectElement>('#reVeterinario');
    if (usuario.role === 'VETERINARIO') {
      veterinario.value = String(usuario.id);
      veterinario.disabled = true;
    } else {
      this.preencherSelectReagendamento();
      veterinario.value = String(consulta.veterinarioId);
      veterinario.disabled = false;
    }

    const formulario = obrigatorio<HTMLFormElement>('#formReagendarConsulta');
    limparValidacao(formulario);
    const modal = new window.bootstrap.Modal(obrigatorio<HTMLDivElement>('#modalReagendarConsulta'), {
      backdrop: 'static',
      keyboard: false,
    });
    modal.show();
  }

  /** `datetime-local` usa o fuso local da clínica (sem UTC). */
  private paraDatetimeLocal(data: Date): string {
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    const hora = String(data.getHours()).padStart(2, '0');
    const minuto = String(data.getMinutes()).padStart(2, '0');
    return `${ano}-${mes}-${dia}T${hora}:${minuto}`;
  }

  private async reagendar(evento: Event, botao: HTMLButtonElement): Promise<void> {
    evento.preventDefault();
    const formulario = obrigatorio<HTMLFormElement>('#formReagendarConsulta');
    limparValidacao(formulario);
    const id = this.idReagendamento;
    if (id === null) return;

    const dataHora = obrigatorio<HTMLInputElement>('#reDataHora');
    const motivo = obrigatorio<HTMLTextAreaElement>('#reMotivo');
    const veterinario = obrigatorio<HTMLSelectElement>('#reVeterinario');
    const instante = dataHora.value === '' ? null : new Date(dataHora.value);
    const dataValida =
      instante !== null && !Number.isNaN(instante.getTime()) && instante.getTime() > Date.now();
    const idVeterinario = Number(veterinario.value);
    const textoMotivo = motivo.value.trim();

    const resultados = [
      exigir(dataHora, dataValida, 'Informe uma data e um horário futuros válidos.'),
      exigir(motivo, textoMotivo.length >= 3 && textoMotivo.length <= 500, 'Informe o motivo (de 3 a 500 caracteres).'),
      exigir(
        veterinario,
        Number.isInteger(idVeterinario) && idVeterinario > 0,
        'Selecione o veterinário responsável.'
      ),
    ];
    if (!resultados.every(Boolean) || instante === null) {
      focarPrimeiroInvalido(formulario);
      return;
    }

    const dados: DadosAtualizacaoConsulta = {
      id,
      dataHora: instante.toISOString(),
      motivo: textoMotivo,
      veterinarioId: idVeterinario,
    };

    setCarregando(botao, true, 'Reagendando…');
    try {
      await window.api.consultasAtualizar(dados);
      new window.bootstrap.Modal(obrigatorio<HTMLDivElement>('#modalReagendarConsulta')).hide();
      mostrarToast('Consulta reagendada com sucesso.', 'sucesso');
      await this.carregar();
    } catch (erro) {
      mostrarToast(mensagemErro(erro), 'erro');
    } finally {
      setCarregando(botao, false);
    }
  }
}
