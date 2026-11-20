/** Prontuário clínico: histórico por pet, formulário e conclusão explícita da consulta. */

import {
  PRONTUARIO_TEMPERATURA_MAXIMA_C,
  PRONTUARIO_TEMPERATURA_MINIMA_C,
  PRONTUARIO_TEXTO_MAXIMO,
  PRONTUARIO_TEXTO_MINIMO,
  STATUS_CONCLUIVEIS,
} from '../shared/constants';
import { carregarAgenda } from './agenda';
import { obterUsuario } from './auth';
import type { ConsultaProntuario, DadosProntuario, Pet, Role } from './types';
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

const COLUNAS_HISTORICO = 7;

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

/** Mapa em memória: evita expor texto clínico em atributos `data-*`. */
let consultasVisiveis = new Map<number, ConsultaProntuario>();
let petsCarregados = false;
let petAtualId: number | null = null;
let sequenciaCarregamento = 0;

/** O fuso da clínica é o fuso local da máquina: não fixar `timeZone` é intencional. */
function formatarDataHora(dataIso: string): string {
  const data = new Date(dataIso);
  return Number.isNaN(data.getTime()) ? '—' : data.toLocaleString('pt-BR');
}

function rotuloStatus(status: string): string {
  return ROTULOS_STATUS[status] ?? status;
}

function textoOuTraco(valor: string | null | undefined): string {
  const texto = valor?.trim();
  return texto ? texto : '—';
}

function numeroOuTraco(valor: number | null | undefined, unidade: string): string {
  return valor === null || valor === undefined ? '—' : `${String(valor)}${unidade}`;
}

function descricaoVeterinario(veterinario: ConsultaProntuario['veterinario']): string {
  const crmv = veterinario.crmv?.trim();
  return `${veterinario.nome} — ${crmv ? crmv : 'CRMV não informado'}`;
}

function temAcessoClinico(): boolean {
  const papel = obterUsuario()?.role;
  return papel === 'ADMIN' || papel === 'VETERINARIO';
}

/** Usabilidade apenas: o backend continua sendo a autoridade final. */
function podeGerenciar(consulta: ConsultaProntuario): boolean {
  const usuario = obterUsuario();
  if (usuario === null) return false;
  if (usuario.role === 'ADMIN') return true;
  return usuario.role === 'VETERINARIO' && usuario.id === consulta.veterinarioId;
}

function aplicarPermissoesProntuario(): void {
  const aviso = obrigatorio<HTMLElement>('#prAvisoAtendente');
  const area = obrigatorio<HTMLElement>('#prAreaClinica');
  const acesso = temAcessoClinico();

  aviso.hidden = acesso;
  area.hidden = !acesso;
  if (!acesso) {
    consultasVisiveis.clear();
    petAtualId = null;
  }
}

function linhaMensagem(texto: string, classe = 'text-center text-muted fst-italic py-4'): HTMLTableRowElement {
  const linha = document.createElement('tr');
  const celula = criarCelula(texto, classe);
  celula.colSpan = COLUNAS_HISTORICO;
  linha.append(celula);
  return linha;
}

/** Preenche o seletor de pets do prontuário preservando a seleção atual. */
export function preencherSelectPetsProntuario(pets: Pet[]): void {
  const select = obrigatorio<HTMLSelectElement>('#prPet');
  const anterior = select.value;
  select.replaceChildren();

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = pets.length > 0 ? 'Selecione um pet…' : 'Cadastre um pet primeiro';
  select.append(placeholder);

  for (const pet of pets) {
    const opcao = document.createElement('option');
    opcao.value = String(pet.id);
    opcao.textContent = `${pet.nome} — tutor(a): ${textoOuTraco(pet.cliente?.nome)}`;
    select.append(opcao);
  }

  select.value = pets.some((pet) => String(pet.id) === anterior) ? anterior : '';
  petsCarregados = true;
}

function criarBotaoAcao(acao: 'editar' | 'concluir', consulta: ConsultaProntuario): HTMLButtonElement {
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = `btn btn-sm ${acao === 'editar' ? 'btn-outline-primary' : 'btn-outline-success'}`;
  botao.dataset.prAcao = acao;
  botao.dataset.id = String(consulta.id);
  botao.textContent = acao === 'editar' ? 'Registrar/Editar prontuário' : 'Concluir consulta';
  botao.setAttribute(
    'aria-label',
    `${botao.textContent} — consulta de ${consulta.pet.nome} em ${formatarDataHora(consulta.dataHora)}`
  );
  return botao;
}

function criarBotoesAcao(consulta: ConsultaProntuario): HTMLButtonElement[] {
  const usuario = obterUsuario();
  if (usuario === null) return [];

  const papel: Role = usuario.role;
  if (papel === 'ATENDENTE' || !podeGerenciar(consulta)) return [];

  const botoes: HTMLButtonElement[] = [];
  // O backend permite editar prontuário de consulta concluída, mas não de cancelada.
  if (consulta.status !== 'CANCELADA') botoes.push(criarBotaoAcao('editar', consulta));
  if (STATUS_CONCLUIVEIS.some((status) => status === consulta.status)) {
    botoes.push(criarBotaoAcao('concluir', consulta));
  }
  return botoes;
}

function renderizarHistorico(consultas: ConsultaProntuario[]): void {
  consultasVisiveis = new Map(consultas.map((consulta) => [consulta.id, consulta]));

  const corpo = obrigatorio<HTMLTableSectionElement>('#tbProntuario');
  const resumo = obrigatorio<HTMLElement>('#prResumo');
  corpo.replaceChildren();
  resumo.hidden = consultas.length === 0;
  resumo.textContent =
    consultas.length === 0 ? '' : `${consultas.length} ${consultas.length === 1 ? 'consulta' : 'consultas'}`;

  if (consultas.length === 0) {
    const mensagem = petAtualId === null
      ? 'Selecione um pet para ver o histórico.'
      : 'Nenhuma consulta registrada para este pet.';
    corpo.append(linhaMensagem(mensagem));
    return;
  }

  for (const consulta of consultas) {
    const linha = document.createElement('tr');
    linha.append(
      criarCelula(formatarDataHora(consulta.dataHora), 'text-nowrap small'),
      criarCelula(consulta.motivo, 'text-break small'),
      criarCelula(descricaoVeterinario(consulta.veterinario), 'small'),
      criarCelula(textoOuTraco(consulta.diagnostico), 'text-break small'),
      criarCelula(
        `${numeroOuTraco(consulta.pesoAferido, ' kg')} / ${numeroOuTraco(consulta.temperaturaC, ' °C')}`,
        'text-nowrap small'
      )
    );

    const celulaStatus = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `badge ${CLASSES_STATUS[consulta.status] ?? 'text-bg-secondary'}`;
    badge.textContent = rotuloStatus(consulta.status);
    celulaStatus.append(badge);
    linha.append(celulaStatus);

    const celulaAcoes = document.createElement('td');
    const botoes = criarBotoesAcao(consulta);
    if (botoes.length === 0) {
      celulaAcoes.textContent = '—';
    } else {
      const grupo = document.createElement('div');
      grupo.className = 'd-flex flex-wrap gap-1';
      grupo.setAttribute('role', 'group');
      grupo.setAttribute('aria-label', `Ações do prontuário de ${consulta.pet.nome}`);
      grupo.append(...botoes);
      celulaAcoes.append(grupo);
    }
    linha.append(celulaAcoes);
    corpo.append(linha);
  }
}

/**
 * Carrega o histórico do pet informado (ou do pet selecionado no formulário).
 * Também é o refresh usado após salvar/concluir e no `carregarTudo()` do main.
 */
export async function carregarProntuarioPet(petId?: number): Promise<void> {
  aplicarPermissoesProntuario();
  if (!temAcessoClinico()) return;

  const select = obrigatorio<HTMLSelectElement>('#prPet');
  const id = petId ?? (select.value === '' ? null : Number(select.value));
  if (id === null || !Number.isInteger(id) || id <= 0) {
    petAtualId = null;
    renderizarHistorico([]);
    return;
  }
  petAtualId = id;

  const sequencia = sequenciaCarregamento + 1;
  sequenciaCarregamento = sequencia;
  const corpo = obrigatorio<HTMLTableSectionElement>('#tbProntuario');
  corpo.setAttribute('aria-busy', 'true');
  corpo.replaceChildren(linhaMensagem('Carregando o histórico do pet…'));

  try {
    if (!petsCarregados) {
      preencherSelectPetsProntuario(await window.api.listarPets());
      select.value = String(id);
    }
    const consultas = await window.api.prontuarioListarPet(id);
    if (sequencia === sequenciaCarregamento) renderizarHistorico(consultas);
  } catch (erro) {
    if (sequencia === sequenciaCarregamento) {
      corpo.replaceChildren(
        linhaMensagem('Não foi possível carregar o prontuário.', 'text-center text-danger py-4')
      );
      mostrarToast(mensagemErro(erro), 'erro');
    }
  } finally {
    if (sequencia === sequenciaCarregamento) corpo.removeAttribute('aria-busy');
  }
}

function limparFormulario(): void {
  const formulario = obrigatorio<HTMLFormElement>('#formProntuario');
  formulario.reset();
  limparValidacao(formulario);
  obrigatorio<HTMLElement>('#prFormTitulo').textContent = 'Registrar prontuário';
  setCarregando(obrigatorio<HTMLButtonElement>('#btnSalvarProntuario'), false);
}

function preencherFormulario(consulta: ConsultaProntuario): void {
  obrigatorio<HTMLInputElement>('#prConsultaId').value = String(consulta.id);
  obrigatorio<HTMLTextAreaElement>('#prExameClinico').value = consulta.exameClinico ?? '';
  obrigatorio<HTMLTextAreaElement>('#prDiagnostico').value = consulta.diagnostico ?? '';
  obrigatorio<HTMLTextAreaElement>('#prConduta').value = consulta.conduta ?? '';
  obrigatorio<HTMLInputElement>('#prPeso').value =
    consulta.pesoAferido === null ? '' : String(consulta.pesoAferido);
  obrigatorio<HTMLInputElement>('#prTemperatura').value =
    consulta.temperaturaC === null ? '' : String(consulta.temperaturaC);
  obrigatorio<HTMLElement>('#prFormTitulo').textContent =
    `Editando prontuário — ${consulta.pet.nome}, ${formatarDataHora(consulta.dataHora)}`;
  limparValidacao(obrigatorio<HTMLFormElement>('#formProntuario'));
}

function destacarLinha(botao: HTMLButtonElement): void {
  const corpo = obrigatorio<HTMLTableSectionElement>('#tbProntuario');
  corpo.querySelectorAll('tr.table-active').forEach((linha) => linha.classList.remove('table-active'));
  botao.closest('tr')?.classList.add('table-active');
}

function validarTexto(campo: HTMLTextAreaElement, descricao: string): boolean {
  const tamanho = campo.value.trim().length;
  return exigir(
    campo,
    tamanho >= PRONTUARIO_TEXTO_MINIMO && tamanho <= PRONTUARIO_TEXTO_MAXIMO,
    `Informe ${descricao} (de ${PRONTUARIO_TEXTO_MINIMO} a ${PRONTUARIO_TEXTO_MAXIMO} caracteres).`
  );
}

/**
 * Retorna `null` para campo em branco, `undefined` quando inválido
 * (o chamador aborta o envio nesse caso).
 */
function lerNumeroOpcional(
  campo: HTMLInputElement,
  valido: (valor: number) => boolean,
  mensagem: string
): number | null | undefined {
  const texto = campo.value.trim();
  if (texto === '') {
    exigir(campo, true, '');
    return null;
  }
  const valor = Number(texto.replace(',', '.'));
  if (!exigir(campo, Number.isFinite(valor) && valido(valor), mensagem)) return undefined;
  return valor;
}

async function recarregarDepoisDeAlterar(petId: number): Promise<void> {
  // Uma operação iniciada antes do logout não deve gerar novas chamadas IPC.
  if (obterUsuario() === null) return;
  await Promise.all([carregarAgenda(), carregarProntuarioPet(petId)]);
}

async function salvarProntuario(evento: Event): Promise<void> {
  evento.preventDefault();
  const formulario = obrigatorio<HTMLFormElement>('#formProntuario');
  const botao = obrigatorio<HTMLButtonElement>('#btnSalvarProntuario');
  limparValidacao(formulario);

  const id = Number(obrigatorio<HTMLInputElement>('#prConsultaId').value);
  const consulta = Number.isInteger(id) && id > 0 ? consultasVisiveis.get(id) : undefined;
  if (consulta === undefined || !podeGerenciar(consulta)) {
    mostrarToast('Selecione uma consulta do seu histórico antes de salvar o prontuário.', 'erro');
    return;
  }
  if (consulta.status === 'CANCELADA') {
    mostrarToast('Não é possível salvar o prontuário de uma consulta cancelada.', 'erro');
    return;
  }

  const exame = obrigatorio<HTMLTextAreaElement>('#prExameClinico');
  const diagnostico = obrigatorio<HTMLTextAreaElement>('#prDiagnostico');
  const conduta = obrigatorio<HTMLTextAreaElement>('#prConduta');
  const pesoCampo = obrigatorio<HTMLInputElement>('#prPeso');
  const temperaturaCampo = obrigatorio<HTMLInputElement>('#prTemperatura');

  const textosValidos = [
    validarTexto(exame, 'o exame clínico'),
    validarTexto(diagnostico, 'o diagnóstico'),
    validarTexto(conduta, 'a conduta'),
  ];
  const peso = lerNumeroOpcional(
    pesoCampo,
    (valor) => valor > 0,
    'Informe um peso maior que zero (em kg).'
  );
  const temperatura = lerNumeroOpcional(
    temperaturaCampo,
    (valor) =>
      valor >= PRONTUARIO_TEMPERATURA_MINIMA_C && valor <= PRONTUARIO_TEMPERATURA_MAXIMA_C,
    `Informe a temperatura entre ${PRONTUARIO_TEMPERATURA_MINIMA_C} °C e ${PRONTUARIO_TEMPERATURA_MAXIMA_C} °C.`
  );

  if (!textosValidos.every(Boolean) || peso === undefined || temperatura === undefined) {
    focarPrimeiroInvalido(formulario);
    return;
  }

  const dados: DadosProntuario = {
    consultaId: consulta.id,
    exameClinico: exame.value.trim(),
    diagnostico: diagnostico.value.trim(),
    conduta: conduta.value.trim(),
    pesoAferido: peso,
    temperaturaC: temperatura,
  };

  setCarregando(botao, true, 'Salvando…');
  try {
    await window.api.prontuarioSalvar(dados);
    mostrarToast('Prontuário salvo. Conclua a consulta separadamente quando o atendimento terminar.', 'sucesso');
    await recarregarDepoisDeAlterar(consulta.petId);
  } catch (erro) {
    mostrarToast(mensagemErro(erro), 'erro');
  } finally {
    setCarregando(botao, false);
  }
}

function confirmarConclusao(consulta: ConsultaProntuario): Promise<boolean> {
  const modalElemento = obrigatorio<HTMLDivElement>('#modalConcluirProntuario');
  const descricao = obrigatorio<HTMLElement>('#modalConcluirProntuarioDescricao');
  const confirmar = obrigatorio<HTMLButtonElement>('#btnConfirmarConclusaoProntuario');
  const voltar = obrigatorio<HTMLButtonElement>('#btnFecharConclusaoProntuario');

  descricao.textContent =
    `Deseja concluir a consulta de ${consulta.pet.nome} em ${formatarDataHora(consulta.dataHora)}? ` +
    'Esta ação não pode ser desfeita.';
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

async function concluirConsulta(consulta: ConsultaProntuario, botao: HTMLButtonElement): Promise<void> {
  if (!(await confirmarConclusao(consulta))) return;

  setCarregando(botao, true, 'Concluindo…');
  try {
    await window.api.consultasConcluir(consulta.id);
    mostrarToast('Consulta concluída com sucesso. O prontuário permanece disponível para edição.', 'sucesso');
    await recarregarDepoisDeAlterar(consulta.petId);
  } catch (erro) {
    mostrarToast(mensagemErro(erro), 'erro');
  } finally {
    setCarregando(botao, false);
  }
}

function configurarEventos(): void {
  obrigatorio<HTMLSelectElement>('#prPet').addEventListener('change', () => {
    petAtualId = null;
    limparFormulario();
    void carregarProntuarioPet();
  });

  obrigatorio<HTMLFormElement>('#formProntuario').addEventListener('submit', (evento) => {
    void salvarProntuario(evento);
  });

  obrigatorio<HTMLTableSectionElement>('#tbProntuario').addEventListener('click', (evento) => {
    const alvo = evento.target;
    if (!(alvo instanceof Element)) return;
    const botao = alvo.closest<HTMLButtonElement>('button[data-pr-acao][data-id]');
    if (botao === null || botao.disabled) return;

    const id = Number(botao.dataset.id);
    const consulta = Number.isInteger(id) && id > 0 ? consultasVisiveis.get(id) : undefined;
    if (consulta === undefined || !podeGerenciar(consulta)) return;

    if (botao.dataset.prAcao === 'editar') {
      preencherFormulario(consulta);
      destacarLinha(botao);
      obrigatorio<HTMLTextAreaElement>('#prExameClinico').focus();
    } else if (botao.dataset.prAcao === 'concluir') {
      void concluirConsulta(consulta, botao);
    }
  });
}

/** Liga eventos e carrega o seletor de pets quando já existe sessão. */
export async function iniciarProntuario(): Promise<void> {
  configurarEventos();
  aplicarPermissoesProntuario();
  renderizarHistorico([]);

  // Antes do login não há sessão: `carregarTudo()` faz a carga inicial autorizada.
  if (obterUsuario() === null) return;
  if (!petsCarregados) preencherSelectPetsProntuario(await window.api.listarPets());
  await carregarProntuarioPet();
}

/** Limpa estado, seleção e mensagens ao sair. */
export function limparProntuario(): void {
  sequenciaCarregamento += 1;
  petsCarregados = false;
  petAtualId = null;

  const select = obrigatorio<HTMLSelectElement>('#prPet');
  select.replaceChildren();
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Selecione um pet…';
  select.append(placeholder);

  obrigatorio<HTMLTableSectionElement>('#tbProntuario').removeAttribute('aria-busy');
  limparFormulario();
  renderizarHistorico([]);
  obrigatorio<HTMLElement>('#prAvisoAtendente').hidden = true;
  obrigatorio<HTMLElement>('#prAreaClinica').hidden = true;
}
