/** Agenda de consultas: formulário, filtros, listagem e ações por perfil. */

import { STATUS_CANCELAVEIS, STATUS_CONCLUIVEIS } from '../shared/constants';
import { obterUsuario } from './auth';
import type {
  ConsultaAgenda,
  FiltroAgenda,
  Pet,
  Role,
  VeterinarioResumo,
} from './types';
import {
  criarCelula,
  exigir,
  focarPrimeiroInvalido,
  limparValidacao,
  marcarInvalido,
  mensagemErro,
  mostrarToast,
  obrigatorio,
  setCarregando,
} from './ui';

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

let filtroAtual: FiltroAgenda | undefined;
let selectsCarregados = false;
let sequenciaCarregamento = 0;

/** Rótulos amigáveis para o status ASCII usado no contrato. */
function rotuloStatus(status: string): string {
  return ROTULOS_STATUS[status] ?? status;
}

/** O fuso da clínica é o fuso local da máquina: não fixar `timeZone` é intencional. */
function formatarDataHora(dataIso: string): string {
  const data = new Date(dataIso);
  return Number.isNaN(data.getTime()) ? '—' : data.toLocaleString('pt-BR');
}

function descricaoVeterinario(veterinario: ConsultaAgenda['veterinario']): string {
  const crmv = veterinario.crmv?.trim();
  return `${veterinario.nome} — ${crmv && crmv !== '' ? crmv : 'CRMV não informado'}`;
}

/**
 * Converte `yyyy-mm-dd` de um input `date` para ISO com fuso local explícito:
 * sem `Z`/offset, `new Date(...)` interpreta o valor no fuso da clínica.
 * O backend exige ISO com hora e fuso (`ehDataIso`), não apenas a data.
 */
function dataLocalParaIso(data: string, fimDoDia: boolean): string | null {
  const horario = fimDoDia ? '23:59:59' : '00:00:00';
  try {
    return new Date(`${data}T${horario}`).toISOString();
  } catch {
    return null;
  }
}

function preencherSelect(
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

export function preencherSelectPets(pets: Pet[]): void {
  preencherSelect(
    '#aPet',
    pets.map((pet) => ({ id: pet.id, texto: `${pet.nome} — tutor(a): ${pet.cliente?.nome ?? '—'}` })),
    'Cadastre um pet primeiro'
  );
}

export function preencherSelectVeterinarios(veterinarios: VeterinarioResumo[]): void {
  const usuario = obterUsuario();
  const itens = veterinarios.map((veterinario) => ({
    id: veterinario.id,
    texto: descricaoVeterinario(veterinario),
  }));

  if (usuario?.role === 'VETERINARIO' && !itens.some((item) => item.id === usuario.id)) {
    itens.push({ id: usuario.id, texto: `${usuario.nome} — CRMV não informado` });
  }

  const select = preencherSelect(
    '#aVeterinario',
    itens,
    'Nenhum veterinário ativo cadastrado'
  );

  if (usuario?.role === 'VETERINARIO') {
    select.value = String(usuario.id);
    select.disabled = true;
  } else {
    select.disabled = false;
  }
}

async function carregarSelectsAgenda(): Promise<void> {
  const [pets, veterinarios] = await Promise.all([
    window.api.listarPets(),
    window.api.veterinariosListar(),
  ]);
  preencherSelectPets(pets);
  preencherSelectVeterinarios(veterinarios);
  selectsCarregados = true;
}

function linhaMensagem(colunas: number, texto: string, classe = 'text-center text-muted fst-italic py-4'): HTMLTableRowElement {
  const linha = document.createElement('tr');
  const celula = criarCelula(texto, classe);
  celula.colSpan = colunas;
  linha.append(celula);
  return linha;
}

export function renderizarConsultas(consultas: ConsultaAgenda[]): void {
  const corpo = obrigatorio<HTMLTableSectionElement>('#tbAgenda');
  corpo.replaceChildren();

  if (consultas.length === 0) {
    corpo.append(linhaMensagem(7, 'Nenhuma consulta encontrada para o período.'));
    return;
  }

  for (const consulta of consultas) {
    const linha = document.createElement('tr');
    linha.append(
      criarCelula(formatarDataHora(consulta.dataHora)),
      criarCelula(consulta.pet.nome),
      criarCelula(consulta.pet.clienteNome),
      criarCelula(descricaoVeterinario(consulta.veterinario)),
      criarCelula(consulta.motivo, 'text-break'),
    );

    const status = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `badge ${CLASSES_STATUS[consulta.status] ?? 'text-bg-secondary'}`;
    badge.textContent = rotuloStatus(consulta.status);
    status.append(badge);
    linha.append(status);

    const acoes = document.createElement('td');
    const botoes = criarBotoesAcao(consulta);
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

function criarBotaoAcao(
  acao: 'cancelar' | 'concluir',
  consulta: ConsultaAgenda
): HTMLButtonElement {
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.dataset.acao = acao;
  botao.dataset.id = String(consulta.id);
  botao.dataset.pet = consulta.pet.nome;
  botao.dataset.dataHora = consulta.dataHora;
  botao.className = `btn ${acao === 'cancelar' ? 'btn-outline-danger' : 'btn-outline-success'}`;
  botao.textContent = acao === 'cancelar' ? 'Cancelar' : 'Concluir';
  const verbo = acao === 'cancelar' ? 'Cancelar' : 'Concluir';
  botao.setAttribute(
    'aria-label',
    `${verbo} consulta de ${consulta.pet.nome} em ${formatarDataHora(consulta.dataHora)}`
  );
  return botao;
}

/**
 * Esconder botões é apenas usabilidade: a autoridade é o backend.
 * VETERINÁRIO só vê ações nas próprias consultas; ATENDENTE nunca vê "Concluir".
 */
function criarBotoesAcao(consulta: ConsultaAgenda): HTMLButtonElement[] {
  const usuario = obterUsuario();
  if (usuario === null) return [];

  const papel: Role = usuario.role;
  const responsavel = usuario.id === consulta.veterinarioId;
  const cancelavel = STATUS_CANCELAVEIS.some((status) => status === consulta.status);
  const concluivel = STATUS_CONCLUIVEIS.some((status) => status === consulta.status);
  const botoes: HTMLButtonElement[] = [];

  const podeCancelar =
    papel === 'ADMIN' || papel === 'ATENDENTE' || (papel === 'VETERINARIO' && responsavel);
  const podeConcluir = papel === 'ADMIN' || (papel === 'VETERINARIO' && responsavel);

  if (cancelavel && podeCancelar) botoes.push(criarBotaoAcao('cancelar', consulta));
  if (concluivel && podeConcluir) botoes.push(criarBotaoAcao('concluir', consulta));
  return botoes;
}

export async function carregarAgenda(filtro: FiltroAgenda | undefined = filtroAtual): Promise<void> {
  const corpo = obrigatorio<HTMLTableSectionElement>('#tbAgenda');
  const sequencia = sequenciaCarregamento + 1;
  sequenciaCarregamento = sequencia;
  corpo.setAttribute('aria-busy', 'true');
  corpo.replaceChildren(linhaMensagem(7, 'Carregando consultas…'));

  try {
    if (!selectsCarregados) await carregarSelectsAgenda();
    const consultas = await window.api.consultasListar(filtro);
    if (sequencia === sequenciaCarregamento) renderizarConsultas(consultas);
  } catch (erro) {
    const mensagem = mensagemErro(erro);
    if (sequencia === sequenciaCarregamento) {
      corpo.replaceChildren(
        linhaMensagem(7, 'Não foi possível carregar as consultas.', 'text-center text-danger py-4')
      );
      mostrarToast(mensagem, 'erro');
    }
  } finally {
    if (sequencia === sequenciaCarregamento) corpo.removeAttribute('aria-busy');
  }
}

/** Limpa a agenda ao sair e invalida carregamentos pendentes. */
export function limparAgenda(): void {
  sequenciaCarregamento += 1;
  filtroAtual = undefined;
  selectsCarregados = false;
  for (const seletor of ['#aPet', '#aVeterinario']) {
    const select = obrigatorio<HTMLSelectElement>(seletor);
    select.replaceChildren();
    select.disabled = false;
  }
  for (const seletor of ['#aDe', '#aAte', '#aDataHora', '#aMotivo']) {
    obrigatorio<HTMLInputElement | HTMLTextAreaElement>(seletor).value = '';
  }
  const formularioFiltros = obrigatorio<HTMLFormElement>('#formFiltrosAgenda');
  const formularioConsulta = obrigatorio<HTMLFormElement>('#formAgenda');
  limparValidacao(formularioFiltros);
  limparValidacao(formularioConsulta);
  renderizarConsultas([]);
}

function configurarFormulario(): void {
  const formulario = obrigatorio<HTMLFormElement>('#formAgenda');
  const botaoSalvar = obrigatorio<HTMLButtonElement>('#btnSalvarAgenda');
  const pet = obrigatorio<HTMLSelectElement>('#aPet');
  const veterinario = obrigatorio<HTMLSelectElement>('#aVeterinario');
  const dataHora = obrigatorio<HTMLInputElement>('#aDataHora');
  const motivo = obrigatorio<HTMLTextAreaElement>('#aMotivo');

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    limparValidacao(formulario);

    const usuario = obterUsuario();
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

    setCarregando(botaoSalvar, true, 'Agendando…');
    try {
      // O valor de `datetime-local` é interpretado no fuso local; ISO resultante é UTC.
      const dataHoraIso = instante.toISOString();
      await window.api.consultasCriar({
        petId: Number(pet.value),
        veterinarioId: idVeterinario,
        dataHora: dataHoraIso,
        motivo: textoMotivo,
      });
      formulario.reset();
      limparValidacao(formulario);
      if (ehVeterinario && usuario !== null) veterinario.value = String(usuario.id);
      mostrarToast('Consulta agendada com sucesso.', 'sucesso');
      pet.focus();
      await carregarAgenda();
    } catch (erro) {
      const mensagem = mensagemErro(erro);
      marcarInvalido(dataHora, mensagem);
      mostrarToast(mensagem, 'erro');
      dataHora.focus();
    } finally {
      setCarregando(botaoSalvar, false);
    }
  });
}

function configurarFiltros(): void {
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
      const inicio = dataLocalParaIso(valorDe, false);
      if (inicio === null) {
        marcarInvalido(de, 'Data inicial inválida. Confira o valor digitado.');
        datasConvertidas = false;
      } else {
        filtro.de = inicio;
      }
    }
    if (ateValido && valorAte !== '') {
      const fim = dataLocalParaIso(valorAte, true);
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

    filtroAtual = Object.keys(filtro).length === 0 ? undefined : filtro;
    void carregarAgenda(filtroAtual);
  });

  botaoLimpar.addEventListener('click', () => {
    formulario.reset();
    limparValidacao(formulario);
    filtroAtual = undefined;
    void carregarAgenda();
    de.focus();
  });
}

function pedirMotivoCancelamento(): Promise<string | null> {
  const modalElemento = obrigatorio<HTMLDivElement>('#modalCancelarConsulta');
  const formulario = obrigatorio<HTMLFormElement>('#formCancelarConsulta');
  const motivo = obrigatorio<HTMLTextAreaElement>('#txtMotivoCancelamento');
  const confirmar = obrigatorio<HTMLButtonElement>('#btnConfirmarCancelamento');
  const voltar = obrigatorio<HTMLButtonElement>('#btnFecharCancelamento');

  motivo.value = '';
  limparValidacao(formulario);
  const modal = new window.bootstrap.Modal(modalElemento, { backdrop: 'static', keyboard: false });

  return new Promise<string | null>((resolve) => {
    let resolvido = false;
    const finalizar = (resposta: string | null): void => {
      if (resolvido) return;
      resolvido = true;
      confirmar.removeEventListener('click', aceitar);
      voltar.removeEventListener('click', recusar);
      modalElemento.removeEventListener('hidden.bs.modal', aoOcultar);
      modal.hide();
      resolve(resposta);
    };
    const aceitar = (): void => {
      limparValidacao(formulario);
      const texto = motivo.value.trim();
      if (!exigir(motivo, texto.length >= 3 && texto.length <= 500, 'Informe o motivo do cancelamento (de 3 a 500 caracteres).')) {
        motivo.focus();
        return;
      }
      finalizar(texto);
    };
    const recusar = (): void => finalizar(null);
    const aoOcultar = (): void => finalizar(null);

    confirmar.addEventListener('click', aceitar);
    voltar.addEventListener('click', recusar);
    modalElemento.addEventListener('hidden.bs.modal', aoOcultar);
    modalElemento.addEventListener('shown.bs.modal', () => motivo.focus(), { once: true });
    modal.show();
  });
}

function confirmarConclusao(botao: HTMLButtonElement): Promise<boolean> {
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

async function cancelarConsulta(id: number, botao: HTMLButtonElement): Promise<void> {
  const motivo = await pedirMotivoCancelamento();
  if (motivo === null) return;

  setCarregando(botao, true, 'Cancelando…');
  try {
    await window.api.consultasCancelar(id, motivo);
    mostrarToast('Consulta cancelada. O motivo foi registrado na auditoria.', 'sucesso');
    await carregarAgenda();
  } catch (erro) {
    mostrarToast(mensagemErro(erro), 'erro');
  } finally {
    setCarregando(botao, false);
  }
}

async function concluirConsulta(id: number, botao: HTMLButtonElement): Promise<void> {
  if (!(await confirmarConclusao(botao))) return;

  setCarregando(botao, true, 'Concluindo…');
  try {
    await window.api.consultasConcluir(id);
    mostrarToast('Consulta concluída com sucesso.', 'sucesso');
    await carregarAgenda();
  } catch (erro) {
    mostrarToast(mensagemErro(erro), 'erro');
  } finally {
    setCarregando(botao, false);
  }
}

function configurarAcoes(): void {
  const corpo = obrigatorio<HTMLTableSectionElement>('#tbAgenda');
  corpo.addEventListener('click', (evento) => {
    const alvo = evento.target;
    if (!(alvo instanceof Element)) return;
    const botao = alvo.closest<HTMLButtonElement>('button[data-acao][data-id]');
    if (botao === null || botao.disabled) return;

    const id = Number(botao.dataset.id);
    if (!Number.isInteger(id) || id <= 0) return;
    if (botao.dataset.acao === 'cancelar') void cancelarConsulta(id, botao);
    if (botao.dataset.acao === 'concluir') void concluirConsulta(id, botao);
  });
}

export async function iniciarAgenda(): Promise<void> {
  configurarFormulario();
  configurarFiltros();
  configurarAcoes();

  // Na abertura do app ainda não há sessão; `carregarAgenda()` após o login
  // carrega os selects e a tabela com a sessão já autenticada.
  if (obterUsuario() !== null) await carregarAgenda();
}
