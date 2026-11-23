/** Carteira de vacinação: histórico por pet e registro feito por veterinário/admin. */

import {
  VACINA_DOSE_MAXIMO,
  VACINA_FABRICANTE_MAXIMO,
  VACINA_LOTE_MAXIMO,
  VACINA_NOME_MAXIMO,
  VACINA_OBSERVACOES_MAXIMO,
  VACINA_REACAO_MAXIMO,
} from '../shared/constants';
import { dataCivilClinica } from '../shared/datas';
import { obterUsuario } from './auth';
import type { DadosRegistroVacina, Pet, RegistroVacina, VeterinarioResumo } from './types';
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

const COLUNAS_HISTORICO = 10;
const FORMATO_DATA_CIVIL = /^\d{4}-\d{2}-\d{2}$/;

const ROTULOS_STATUS: Readonly<Record<string, string>> = {
  AGENDADA: 'Agendada',
  CONFIRMADA: 'Confirmada',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
};

/** Mapa em memória: evita expor texto clínico em atributos `data-*`. */
let petsVisiveis = new Map<number, Pet>();
let petsCarregados = false;
let veterinariosCarregados = false;
let petAtualId: number | null = null;
let sequenciaCarregamento = 0;

function temAcessoClinico(): boolean {
  const papel = obterUsuario()?.role;
  return papel === 'ADMIN' || papel === 'VETERINARIO';
}

/** Usabilidade apenas: o backend continua sendo a autoridade final. */
function aplicarPermissoesVacinas(): void {
  const aviso = obrigatorio<HTMLElement>('#vcAvisoAtendente');
  const area = obrigatorio<HTMLElement>('#vcAreaClinica');
  const usuario = obterUsuario();
  const acesso = usuario !== null && temAcessoClinico();

  aviso.hidden = acesso;
  area.hidden = !acesso;
  // VET usa sempre o próprio id; somente ADMIN escolhe o aplicador.
  obrigatorio<HTMLElement>('#vcGrupoVeterinario').hidden = usuario?.role !== 'ADMIN';
  if (!acesso) petAtualId = null;
}

function textoOuTraco(valor: string | null | undefined): string {
  const texto = valor?.trim();
  return texto ? texto : '—';
}

/** Data civil (YYYY-MM-DD) interpretada em UTC para não deslocar o dia. */
function formatarDataCivil(valor: string | null | undefined): string {
  if (!valor || !FORMATO_DATA_CIVIL.test(valor)) return '—';
  const data = new Date(`${valor}T00:00:00.000Z`);
  return Number.isNaN(data.getTime()) ? '—' : data.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

/** Instante: fuso local da máquina, sem fixar `timeZone`. */
function formatarDataHora(dataIso: string): string {
  const data = new Date(dataIso);
  return Number.isNaN(data.getTime()) ? '—' : data.toLocaleString('pt-BR');
}

function rotuloStatus(status: string): string {
  return ROTULOS_STATUS[status] ?? status;
}

function descricaoVeterinario(veterinario: RegistroVacina['veterinario']): string {
  const crmv = veterinario.crmv?.trim();
  return `${textoOuTraco(veterinario.nome)} — ${crmv ? crmv : 'CRMV não informado'}`;
}

function linhaMensagem(texto: string, classe = 'text-center text-muted fst-italic py-4'): HTMLTableRowElement {
  const linha = document.createElement('tr');
  const celula = criarCelula(texto, classe);
  celula.colSpan = COLUNAS_HISTORICO;
  linha.append(celula);
  return linha;
}

function atualizarTituloFormulario(): void {
  const pet = petAtualId === null ? undefined : petsVisiveis.get(petAtualId);
  obrigatorio<HTMLElement>('#vcFormTitulo').textContent = pet
    ? `Registrar vacinação — ${pet.nome}`
    : 'Registrar vacinação';
}

function renderizarHistorico(registros: RegistroVacina[]): void {
  const corpo = obrigatorio<HTMLTableSectionElement>('#tbVacinas');
  const resumo = obrigatorio<HTMLElement>('#vcResumo');
  corpo.replaceChildren();
  resumo.hidden = registros.length === 0;
  resumo.textContent =
    registros.length === 0 ? '' : `${registros.length} ${registros.length === 1 ? 'registro' : 'registros'}`;

  if (registros.length === 0) {
    const mensagem =
      petAtualId === null
        ? 'Selecione um pet para ver a carteira de vacinação.'
        : 'Nenhuma vacinação registrada para este pet.';
    corpo.append(linhaMensagem(mensagem));
    return;
  }

  for (const registro of registros) {
    const linha = document.createElement('tr');
    linha.append(
      criarCelula(formatarDataHora(registro.aplicadaEm), 'text-nowrap small'),
      criarCelula(`${textoOuTraco(registro.vacina)} / ${textoOuTraco(registro.fabricante)}`, 'text-break small'),
      criarCelula(textoOuTraco(registro.lote), 'text-break small'),
      criarCelula(formatarDataCivil(registro.validade), 'text-nowrap small'),
      criarCelula(textoOuTraco(registro.dose), 'small'),
      criarCelula(formatarDataCivil(registro.proximaDose), 'text-nowrap small'),
      criarCelula(textoOuTraco(registro.reacao), 'text-break small'),
      criarCelula(descricaoVeterinario(registro.veterinario), 'small'),
      criarCelula(textoOuTraco(registro.observacoes), 'text-break small'),
      criarCelula(formatarDataHora(registro.registradoEm), 'text-nowrap small')
    );
    corpo.append(linha);
  }
}

/** Preenche o seletor de pets da carteira preservando a seleção atual. */
export function preencherSelectPetsVacinas(pets: Pet[]): void {
  const select = obrigatorio<HTMLSelectElement>('#vcPet');
  const anterior = select.value;
  petsVisiveis = new Map(pets.map((pet) => [pet.id, pet]));
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
  atualizarTituloFormulario();
}

function preencherSelectVeterinarios(veterinarios: VeterinarioResumo[]): void {
  const select = obrigatorio<HTMLSelectElement>('#vcVeterinario');
  const anterior = select.value;
  select.replaceChildren();

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Selecione o veterinário…';
  select.append(placeholder);

  for (const veterinario of veterinarios) {
    const opcao = document.createElement('option');
    opcao.value = String(veterinario.id);
    const crmv = veterinario.crmv?.trim();
    opcao.textContent = `${veterinario.nome} — ${crmv ? crmv : 'CRMV não informado'}`;
    select.append(opcao);
  }

  select.value = veterinarios.some((veterinario) => String(veterinario.id) === anterior) ? anterior : '';
}

async function garantirVeterinarios(): Promise<void> {
  if (veterinariosCarregados || obterUsuario()?.role !== 'ADMIN') return;
  try {
    preencherSelectVeterinarios(await window.api.veterinariosListar());
    veterinariosCarregados = true;
  } catch (erro) {
    mostrarToast(mensagemErro(erro), 'erro');
  }
}

function resetarConsulta(): void {
  const select = obrigatorio<HTMLSelectElement>('#vcConsulta');
  select.replaceChildren();
  const nenhuma = document.createElement('option');
  nenhuma.value = '';
  nenhuma.textContent = 'Nenhuma';
  select.append(nenhuma);
}

async function carregarConsultasPet(petId: number, sequencia: number): Promise<void> {
  const select = obrigatorio<HTMLSelectElement>('#vcConsulta');
  const anterior = select.value;
  try {
    const consultas = await window.api.prontuarioListarPet(petId);
    if (sequencia !== sequenciaCarregamento) return;

    select.replaceChildren();
    const nenhuma = document.createElement('option');
    nenhuma.value = '';
    nenhuma.textContent = 'Nenhuma';
    select.append(nenhuma);

    for (const consulta of consultas) {
      const opcao = document.createElement('option');
      opcao.value = String(consulta.id);
      opcao.textContent = `${formatarDataHora(consulta.dataHora)} / ${textoOuTraco(consulta.motivo)} — ${rotuloStatus(
        consulta.status
      )}`;
      select.append(opcao);
    }
    select.value = consultas.some((consulta) => String(consulta.id) === anterior) ? anterior : '';
  } catch (erro) {
    if (sequencia !== sequenciaCarregamento) return;
    resetarConsulta();
    mostrarToast(mensagemErro(erro), 'erro');
  }
}

/** Limpa os campos do formulário, preservando o veterinário já selecionado. */
function limparCamposFormulario(): void {
  const formulario = obrigatorio<HTMLFormElement>('#formVacina');
  const veterinario = obrigatorio<HTMLSelectElement>('#vcVeterinario');
  const veterinarioAnterior = veterinario.value;
  formulario.reset();
  veterinario.value = veterinarioAnterior;
  limparValidacao(formulario);
}

function limparFormulario(): void {
  limparCamposFormulario();
  obrigatorio<HTMLElement>('#vcFormTitulo').textContent = 'Registrar vacinação';
  setCarregando(obrigatorio<HTMLButtonElement>('#btnSalvarVacina'), false);
}

/**
 * Carrega o histórico do pet informado (ou do pet selecionado) e as consultas
 * disponíveis para vínculo. Também é o refresh usado após salvar e no `carregarTudo()`.
 */
export async function carregarVacinasPet(petId?: number): Promise<void> {
  aplicarPermissoesVacinas();
  if (!temAcessoClinico()) return;

  await garantirVeterinarios();

  const select = obrigatorio<HTMLSelectElement>('#vcPet');
  if (petId !== undefined && select.value !== String(petId)) select.value = String(petId);
  const id = petId ?? (select.value === '' ? null : Number(select.value));
  const corpo = obrigatorio<HTMLTableSectionElement>('#tbVacinas');

  if (id === null || !Number.isInteger(id) || id <= 0) {
    petAtualId = null;
    atualizarTituloFormulario();
    resetarConsulta();
    renderizarHistorico([]);
    return;
  }

  if (petAtualId !== id) {
    petAtualId = id;
    limparFormulario();
    atualizarTituloFormulario();
  }

  const sequencia = sequenciaCarregamento + 1;
  sequenciaCarregamento = sequencia;
  corpo.setAttribute('aria-busy', 'true');
  corpo.replaceChildren(linhaMensagem('Carregando a carteira de vacinação do pet…'));

  try {
    const registros = await window.api.vacinasListarPet(id);
    if (sequencia === sequenciaCarregamento) renderizarHistorico(registros);
  } catch (erro) {
    if (sequencia === sequenciaCarregamento) {
      corpo.replaceChildren(
        linhaMensagem('Não foi possível carregar a carteira de vacinação.', 'text-center text-danger py-4')
      );
      mostrarToast(mensagemErro(erro), 'erro');
    }
  } finally {
    if (sequencia === sequenciaCarregamento) corpo.setAttribute('aria-busy', 'false');
  }

  if (sequencia === sequenciaCarregamento) await carregarConsultasPet(id, sequencia);
}

function validarTextoObrigatorio(campo: HTMLInputElement, maximo: number, descricao: string): boolean {
  const tamanho = campo.value.trim().length;
  return exigir(campo, tamanho > 0 && tamanho <= maximo, `Informe ${descricao} (máximo de ${maximo} caracteres).`);
}

function validarTextoOpcional(campo: HTMLTextAreaElement, maximo: number, descricao: string): boolean {
  return exigir(campo, campo.value.trim().length <= maximo, `${descricao} deve ter no máximo ${maximo} caracteres.`);
}

async function salvarVacina(evento: Event): Promise<void> {
  evento.preventDefault();
  const formulario = obrigatorio<HTMLFormElement>('#formVacina');
  const botao = obrigatorio<HTMLButtonElement>('#btnSalvarVacina');
  limparValidacao(formulario);

  const usuario = obterUsuario();
  if (usuario === null || !temAcessoClinico()) {
    mostrarToast('Sua sessão não permite registrar vacinação.', 'erro');
    return;
  }

  const petSelect = obrigatorio<HTMLSelectElement>('#vcPet');
  const petValor = petSelect.value;
  const petId = petValor === '' ? null : Number(petValor);
  const petValido = exigir(
    petSelect,
    petId !== null && Number.isInteger(petId) && petId > 0,
    'Selecione um pet antes de registrar a vacinação.'
  );

  const vacina = obrigatorio<HTMLInputElement>('#vcVacina');
  const fabricante = obrigatorio<HTMLInputElement>('#vcFabricante');
  const lote = obrigatorio<HTMLInputElement>('#vcLote');
  const dose = obrigatorio<HTMLInputElement>('#vcDose');
  const validadeCampo = obrigatorio<HTMLInputElement>('#vcValidade');
  const aplicadaEmCampo = obrigatorio<HTMLInputElement>('#vcAplicadaEm');
  const proximaDoseCampo = obrigatorio<HTMLInputElement>('#vcProximaDose');
  const reacaoCampo = obrigatorio<HTMLTextAreaElement>('#vcReacao');
  const observacoesCampo = obrigatorio<HTMLTextAreaElement>('#vcObservacoes');

  const textosValidos = [
    validarTextoObrigatorio(vacina, VACINA_NOME_MAXIMO, 'a vacina'),
    validarTextoObrigatorio(fabricante, VACINA_FABRICANTE_MAXIMO, 'o fabricante'),
    validarTextoObrigatorio(lote, VACINA_LOTE_MAXIMO, 'o código do lote'),
    validarTextoObrigatorio(dose, VACINA_DOSE_MAXIMO, 'a sequência da dose'),
    validarTextoOpcional(reacaoCampo, VACINA_REACAO_MAXIMO, 'A descrição da reação adversa'),
    validarTextoOpcional(observacoesCampo, VACINA_OBSERVACOES_MAXIMO, 'As observações'),
  ];

  const aplicadaEmTexto = aplicadaEmCampo.value.trim();
  let aplicadaEmIso: string | null = null;
  if (aplicadaEmTexto === '') {
    exigir(aplicadaEmCampo, false, 'Informe a data e hora da aplicação.');
  } else {
    const data = new Date(aplicadaEmTexto);
    if (Number.isNaN(data.getTime())) {
      exigir(aplicadaEmCampo, false, 'Informe uma data e hora válidas.');
    } else if (data.getTime() > Date.now()) {
      exigir(aplicadaEmCampo, false, 'A data e hora da aplicação não podem estar no futuro.');
    } else {
      exigir(aplicadaEmCampo, true, '');
      aplicadaEmIso = data.toISOString();
    }
  }

  const dataAplicacaoCivil = aplicadaEmIso === null ? '' : dataCivilClinica(new Date(aplicadaEmIso));
  const validade = validadeCampo.value.trim();
  const validadeValida = exigir(
    validadeCampo,
    FORMATO_DATA_CIVIL.test(validade) &&
      (dataAplicacaoCivil === '' || validade >= dataAplicacaoCivil),
    'Informe a validade do lote (AAAA-MM-DD), igual ou posterior à aplicação.'
  );

  const proximaDose = proximaDoseCampo.value.trim();
  const proximaDoseValida = exigir(
    proximaDoseCampo,
    proximaDose === '' ||
      (FORMATO_DATA_CIVIL.test(proximaDose) &&
        (dataAplicacaoCivil === '' || proximaDose >= dataAplicacaoCivil)),
    'A próxima dose deve ser igual ou posterior à aplicação (AAAA-MM-DD).'
  );

  let veterinarioId: number | null = null;
  let veterinarioValido = true;
  if (usuario.role === 'ADMIN') {
    const campo = obrigatorio<HTMLSelectElement>('#vcVeterinario');
    const valor = campo.value;
    const id = Number(valor);
    veterinarioValido = exigir(
      campo,
      valor !== '' && Number.isInteger(id) && id > 0,
      'Selecione o veterinário que aplicou a vacina.'
    );
    if (veterinarioValido) veterinarioId = id;
  } else {
    // VET: o backend ignora/força ao próprio id; o renderer apenas espelha a regra.
    veterinarioId = usuario.id;
  }

  if (
    !petValido ||
    !textosValidos.every(Boolean) ||
    aplicadaEmIso === null ||
    !validadeValida ||
    !proximaDoseValida ||
    !veterinarioValido ||
    petId === null ||
    veterinarioId === null
  ) {
    if (!petValido) petSelect.focus();
    else focarPrimeiroInvalido(formulario);
    return;
  }

  const consultaValor = obrigatorio<HTMLSelectElement>('#vcConsulta').value;
  const dados: DadosRegistroVacina = {
    petId,
    consultaId: consultaValor === '' ? null : Number(consultaValor),
    veterinarioId,
    vacina: vacina.value.trim(),
    fabricante: fabricante.value.trim(),
    lote: lote.value.trim(),
    validade,
    aplicadaEm: aplicadaEmIso,
    dose: dose.value.trim(),
    proximaDose: proximaDose || null,
    reacao: reacaoCampo.value.trim() || null,
    observacoes: observacoesCampo.value.trim() || null,
  };

  setCarregando(botao, true, 'Registrando…');
  try {
    await window.api.vacinasRegistrar(dados);
    mostrarToast('Vacinação registrada com sucesso.', 'sucesso');
    limparCamposFormulario();
    await carregarVacinasPet(petId);
  } catch (erro) {
    mostrarToast(mensagemErro(erro), 'erro');
  } finally {
    setCarregando(botao, false);
  }
}

function configurarEventos(): void {
  obrigatorio<HTMLSelectElement>('#vcPet').addEventListener('change', () => {
    limparFormulario();
    void carregarVacinasPet();
  });

  obrigatorio<HTMLFormElement>('#formVacina').addEventListener('submit', (evento) => {
    void salvarVacina(evento);
  });
}

/** Liga eventos, aplica permissões e renderiza vazio; carrega se já houver sessão. */
export async function iniciarVacinas(): Promise<void> {
  configurarEventos();
  aplicarPermissoesVacinas();
  renderizarHistorico([]);

  // Antes do login não há sessão: `carregarTudo()` faz a carga inicial autorizada.
  if (!temAcessoClinico()) return;
  if (!petsCarregados) preencherSelectPetsVacinas(await window.api.listarPets());
  await garantirVeterinarios();
  await carregarVacinasPet();
}

/** Limpa estado, seleção e mensagens ao sair; ignora respostas antigas. */
export function limparVacinas(): void {
  sequenciaCarregamento += 1;
  petsCarregados = false;
  veterinariosCarregados = false;
  petAtualId = null;
  petsVisiveis = new Map();

  const petSelect = obrigatorio<HTMLSelectElement>('#vcPet');
  petSelect.replaceChildren();
  const placeholderPet = document.createElement('option');
  placeholderPet.value = '';
  placeholderPet.textContent = 'Selecione um pet…';
  petSelect.append(placeholderPet);

  resetarConsulta();

  const veterinario = obrigatorio<HTMLSelectElement>('#vcVeterinario');
  veterinario.replaceChildren();
  const placeholderVeterinario = document.createElement('option');
  placeholderVeterinario.value = '';
  placeholderVeterinario.textContent = 'Selecione o veterinário…';
  veterinario.append(placeholderVeterinario);

  obrigatorio<HTMLTableSectionElement>('#tbVacinas').setAttribute('aria-busy', 'false');
  limparFormulario();
  renderizarHistorico([]);
  obrigatorio<HTMLElement>('#vcAvisoAtendente').hidden = true;
  obrigatorio<HTMLElement>('#vcAreaClinica').hidden = true;
}
