/** Anexos clínicos: histórico por pet, registro de arquivos e inativação auditada. */

import {
  ANEXO_CATEGORIAS,
  ANEXO_DESCRICAO_MAXIMO,
  ANEXO_DESCRICAO_MINIMO,
  ANEXO_MOTIVO_MAXIMO,
  LIMITE_LISTAGEM_ANEXOS,
} from '../shared/constants';
import { dataCivilClinica } from '../shared/datas';
import { isAdmin, obterUsuario } from './auth';
import type {
  AnexoClinico,
  ArquivoAnexoSelecionado,
  BootstrapModal,
  CategoriaAnexo,
  DadosRegistroAnexo,
  Pet,
  VeterinarioResumo,
} from './types';
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

const COLUNAS_HISTORICO = 9;
const FORMATO_DATA_CIVIL = /^\d{4}-\d{2}-\d{2}$/;

const ROTULOS_CATEGORIA: Readonly<Record<CategoriaAnexo, string>> = {
  EXAME_LABORATORIAL: 'Exame laboratorial',
  IMAGEM: 'Imagem',
  DOCUMENTO: 'Documento',
  PRESCRICAO: 'Prescrição',
  OUTRO: 'Outro',
};

const ROTULOS_STATUS: Readonly<Record<string, string>> = {
  AGENDADA: 'Agendada',
  CONFIRMADA: 'Confirmada',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
};

/** Mapa em memória: evita expor texto clínico em atributos `data-*`. */
let petsVisiveis = new Map<number, Pet>();
let arquivoPendente: ArquivoAnexoSelecionado | null = null;
let sequenciaCarregamento = 0;
let petAtualId: number | null = null;
let veterinariosCarregados = false;
let anexoParaInativar: number | null = null;
let modalInativacao: BootstrapModal | null = null;
let eventosLigados = false;

/** Usabilidade apenas: o backend continua sendo a autoridade final. */
function temAcessoClinico(): boolean {
  const papel = obterUsuario()?.role;
  return papel === 'ADMIN' || papel === 'VETERINARIO';
}

function aplicarPermissoesAnexos(): void {
  const aviso = obrigatorio<HTMLElement>('#axAvisoAtendente');
  const area = obrigatorio<HTMLElement>('#axAreaClinica');
  const usuario = obterUsuario();
  const acesso = usuario !== null && temAcessoClinico();

  aviso.hidden = acesso;
  area.hidden = !acesso;
  // VET usa sempre o próprio id; somente ADMIN escolhe o responsável técnico.
  obrigatorio<HTMLElement>('#axGrupoResponsavel').hidden = usuario?.role !== 'ADMIN';
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

function hojeCivil(): string {
  return dataCivilClinica(new Date());
}

/** Confere o formato e o dia real (descarta, por exemplo, 2026-02-30). */
function dataCivilValida(valor: string): boolean {
  if (!FORMATO_DATA_CIVIL.test(valor)) return false;
  const [ano, mes, dia] = valor.split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
}

function formatarTamanho(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const casas = { minimumFractionDigits: 1, maximumFractionDigits: 1 } as const;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString('pt-BR', casas)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', casas)} MB`;
}

function rotuloMime(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType === 'image/jpeg') return 'JPEG';
  if (mimeType === 'image/png') return 'PNG';
  return 'Arquivo';
}

function rotuloStatus(status: string): string {
  return ROTULOS_STATUS[status] ?? status;
}

function descricaoResponsavel(responsavel: AnexoClinico['responsavel']): string {
  const crmv = responsavel.crmv?.trim();
  return `${textoOuTraco(responsavel.nome)} — ${crmv ? crmv : 'CRMV não informado'}`;
}

function linhaMensagem(texto: string, classe = 'text-center text-muted fst-italic py-4'): HTMLTableRowElement {
  const linha = document.createElement('tr');
  const celula = criarCelula(texto, classe);
  celula.colSpan = COLUNAS_HISTORICO;
  linha.append(celula);
  return linha;
}

function celulaSituacao(inativo: boolean): HTMLTableCellElement {
  const celula = document.createElement('td');
  const badge = document.createElement('span');
  badge.className = `badge ${inativo ? 'text-bg-secondary' : 'text-bg-success'}`;
  badge.textContent = inativo ? 'Inativo' : 'Ativo';
  celula.append(badge);
  return celula;
}

function criarBotaoAcao(acao: 'abrir' | 'inativar', id: number, texto: string, rotulo: string): HTMLButtonElement {
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = `btn btn-sm ${acao === 'abrir' ? 'btn-outline-primary' : 'btn-outline-danger'} me-1`;
  botao.dataset.acao = acao;
  botao.dataset.id = String(id);
  botao.setAttribute('aria-label', rotulo);
  botao.textContent = texto;
  return botao;
}

function celulaAcoes(anexo: AnexoClinico): HTMLTableCellElement {
  const celula = document.createElement('td');
  celula.className = 'text-nowrap';
  const descricao = textoOuTraco(anexo.descricao);
  celula.append(criarBotaoAcao('abrir', anexo.id, 'Abrir', `Abrir o anexo: ${descricao}`));
  if (!anexo.inativo) {
    celula.append(criarBotaoAcao('inativar', anexo.id, 'Inativar', `Inativar o anexo: ${descricao}`));
  }
  return celula;
}

function renderizarHistorico(anexos: AnexoClinico[]): void {
  const corpo = obrigatorio<HTMLTableSectionElement>('#tbAnexos');
  const resumo = obrigatorio<HTMLElement>('#axResumo');
  corpo.replaceChildren();
  resumo.hidden = anexos.length === 0;

  if (anexos.length === 0) {
    resumo.textContent = '';
    const mensagem =
      petAtualId === null
        ? 'Selecione um pet para ver os anexos clínicos.'
        : 'Nenhum anexo clínico registrado para este pet.';
    corpo.append(linhaMensagem(mensagem));
    return;
  }

  const quantidade = `${anexos.length} ${anexos.length === 1 ? 'anexo' : 'anexos'}`;
  resumo.textContent =
    anexos.length >= LIMITE_LISTAGEM_ANEXOS
      ? `${quantidade} · limite de exibição de ${LIMITE_LISTAGEM_ANEXOS}`
      : quantidade;

  for (const anexo of anexos) {
    const linha = document.createElement('tr');
    linha.append(
      criarCelula(formatarDataCivil(anexo.dataDocumento), 'text-nowrap small'),
      criarCelula(textoOuTraco(anexo.descricao), 'text-break small'),
      criarCelula(ROTULOS_CATEGORIA[anexo.categoria] ?? 'Outro', 'small'),
      criarCelula(`${textoOuTraco(anexo.nomeOriginal)} (${rotuloMime(anexo.mimeType)})`, 'text-break small'),
      criarCelula(formatarTamanho(anexo.tamanhoBytes), 'text-nowrap small'),
      criarCelula(descricaoResponsavel(anexo.responsavel), 'small'),
      criarCelula(formatarDataHora(anexo.registradoEm), 'text-nowrap small'),
      celulaSituacao(anexo.inativo),
      celulaAcoes(anexo)
    );
    corpo.append(linha);
  }
}

/** Preenche o seletor de pets preservando a seleção atual. */
export function preencherSelectPetsAnexos(pets: Pet[]): void {
  const select = obrigatorio<HTMLSelectElement>('#axPet');
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
}

function preencherSelectResponsaveis(veterinarios: VeterinarioResumo[]): void {
  const select = obrigatorio<HTMLSelectElement>('#axResponsavel');
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
  if (!isAdmin() || veterinariosCarregados) return;
  try {
    preencherSelectResponsaveis(await window.api.veterinariosListar());
    veterinariosCarregados = true;
  } catch (erro) {
    mostrarToast(mensagemErro(erro), 'erro');
  }
}

function resetarConsulta(): void {
  const select = obrigatorio<HTMLSelectElement>('#axConsulta');
  select.replaceChildren();
  const nenhuma = document.createElement('option');
  nenhuma.value = '';
  nenhuma.textContent = 'Nenhuma';
  select.append(nenhuma);
}

async function carregarConsultasPet(petId: number, sequencia: number): Promise<void> {
  const select = obrigatorio<HTMLSelectElement>('#axConsulta');
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

/** Nunca exibe token, caminho do disco nem checksum completo. */
function atualizarInfoArquivo(): void {
  const info = obrigatorio<HTMLElement>('#axArquivoInfo');
  info.classList.remove('text-danger');
  if (arquivoPendente === null) {
    info.textContent = 'Nenhum arquivo selecionado.';
    return;
  }
  info.textContent = `${arquivoPendente.nomeOriginal} · ${rotuloMime(arquivoPendente.mimeType)} · ${formatarTamanho(
    arquivoPendente.tamanhoBytes
  )} — pronto para registrar.`;
}

function cancelarArquivoPendente(): void {
  const pendente = arquivoPendente;
  arquivoPendente = null;
  if (pendente !== null) void window.api.anexosCancelar(pendente.token).catch(() => {});
}

/** O botão de arquivo não é um CampoValidavel; espelha `exigir` para ele. */
function marcarArquivoInvalido(valido: boolean, mensagem: string): boolean {
  const botao = obrigatorio<HTMLButtonElement>('#btnEscolherArquivo');
  const feedback = obrigatorio<HTMLElement>('#axArquivoFeedback');
  if (valido) {
    botao.classList.remove('is-invalid');
    botao.removeAttribute('aria-invalid');
    feedback.textContent = '';
  } else {
    botao.classList.add('is-invalid');
    botao.setAttribute('aria-invalid', 'true');
    feedback.textContent = mensagem;
  }
  return valido;
}

/** Limpa os campos do formulário, preservando pet e responsável já selecionados. */
function limparCamposFormulario(): void {
  const formulario = obrigatorio<HTMLFormElement>('#formAnexo');
  const petSelect = obrigatorio<HTMLSelectElement>('#axPet');
  const responsavel = obrigatorio<HTMLSelectElement>('#axResponsavel').value;
  const pet = petSelect.value;

  formulario.reset();
  petSelect.value = pet;
  obrigatorio<HTMLSelectElement>('#axResponsavel').value = responsavel;
  limparValidacao(formulario);
  exigir(petSelect, true, '');
  marcarArquivoInvalido(true, '');
  atualizarInfoArquivo();
}

function limparFormulario(): void {
  cancelarArquivoPendente();
  resetarConsulta();
  limparCamposFormulario();
  setCarregando(obrigatorio<HTMLButtonElement>('#btnSalvarAnexo'), false);
}

/**
 * Carrega o histórico do pet informado (ou do selecionado) e as consultas
 * disponíveis para vínculo. Também é o refresh usado após salvar e inativar.
 */
export async function carregarAnexosPet(petId?: number): Promise<void> {
  aplicarPermissoesAnexos();
  if (!temAcessoClinico()) return;

  await garantirVeterinarios();

  const select = obrigatorio<HTMLSelectElement>('#axPet');
  if (petId !== undefined && select.value !== String(petId)) select.value = String(petId);
  const id = petId ?? (select.value === '' ? null : Number(select.value));
  const corpo = obrigatorio<HTMLTableSectionElement>('#tbAnexos');

  if (id === null || !Number.isInteger(id) || id <= 0) {
    if (petAtualId !== null) limparFormulario();
    petAtualId = null;
    resetarConsulta();
    renderizarHistorico([]);
    return;
  }

  if (petAtualId !== id) {
    petAtualId = id;
    limparFormulario();
  }

  const sequencia = sequenciaCarregamento + 1;
  sequenciaCarregamento = sequencia;
  corpo.setAttribute('aria-busy', 'true');
  corpo.replaceChildren(linhaMensagem('Carregando os anexos do pet…'));

  try {
    const anexos = await window.api.anexosListarPet(id);
    if (sequencia === sequenciaCarregamento) renderizarHistorico(anexos);
  } catch (erro) {
    if (sequencia === sequenciaCarregamento) {
      corpo.replaceChildren(linhaMensagem('Não foi possível carregar os anexos do pet.', 'text-center text-danger py-4'));
      mostrarToast(mensagemErro(erro), 'erro');
    }
  } finally {
    if (sequencia === sequenciaCarregamento) corpo.setAttribute('aria-busy', 'false');
  }

  if (sequencia === sequenciaCarregamento) await carregarConsultasPet(id, sequencia);
}

async function escolherArquivo(): Promise<void> {
  if (!temAcessoClinico()) return;
  try {
    const arquivo = await window.api.anexosEscolherArquivo();
    if (arquivo === null) return;

    const anterior = arquivoPendente;
    if (anterior !== null) void window.api.anexosCancelar(anterior.token).catch(() => {});
    arquivoPendente = arquivo;
    marcarArquivoInvalido(true, '');
    atualizarInfoArquivo();
  } catch (erro) {
    mostrarToast(mensagemErro(erro), 'erro');
  }
}

async function salvarAnexo(evento: Event): Promise<void> {
  evento.preventDefault();
  const formulario = obrigatorio<HTMLFormElement>('#formAnexo');
  const botao = obrigatorio<HTMLButtonElement>('#btnSalvarAnexo');
  limparValidacao(formulario);

  const usuario = obterUsuario();
  if (usuario === null || !temAcessoClinico()) {
    mostrarToast('Sua sessão não permite registrar anexos clínicos.', 'erro');
    return;
  }

  const petSelect = obrigatorio<HTMLSelectElement>('#axPet');
  const petValor = petSelect.value;
  const petId = petValor === '' ? null : Number(petValor);
  const petValido = exigir(
    petSelect,
    petId !== null && Number.isInteger(petId) && petId > 0,
    'Selecione um pet antes de registrar o anexo.'
  );

  const descricao = obrigatorio<HTMLTextAreaElement>('#axDescricao');
  const tamanhoDescricao = descricao.value.trim().length;
  const descricaoValida = exigir(
    descricao,
    tamanhoDescricao >= ANEXO_DESCRICAO_MINIMO && tamanhoDescricao <= ANEXO_DESCRICAO_MAXIMO,
    `A descrição deve ter entre ${ANEXO_DESCRICAO_MINIMO} e ${ANEXO_DESCRICAO_MAXIMO} caracteres.`
  );

  const categoriaSelect = obrigatorio<HTMLSelectElement>('#axCategoria');
  const categoria = ANEXO_CATEGORIAS.find((opcao) => opcao === categoriaSelect.value);
  const categoriaValida = exigir(categoriaSelect, categoria !== undefined, 'Selecione uma categoria válida.');

  const dataCampo = obrigatorio<HTMLInputElement>('#axDataDocumento');
  const dataDocumento = dataCampo.value.trim();
  const dataValida = exigir(
    dataCampo,
    dataCivilValida(dataDocumento) && dataDocumento <= hojeCivil(),
    'Informe uma data válida (AAAA-MM-DD), sem data futura.'
  );

  let responsavelId: number | null = null;
  let responsavelValido = true;
  if (usuario.role === 'ADMIN') {
    const campo = obrigatorio<HTMLSelectElement>('#axResponsavel');
    const valor = campo.value;
    const id = Number(valor);
    responsavelValido = exigir(
      campo,
      valor !== '' && Number.isInteger(id) && id > 0,
      'Selecione o veterinário responsável.'
    );
    if (responsavelValido) responsavelId = id;
  } else {
    // VET: o backend força o próprio id; o renderer apenas espelha a regra.
    responsavelId = usuario.id;
  }

  const arquivoValido = marcarArquivoInvalido(arquivoPendente !== null, 'Escolha um arquivo antes de registrar.');

  if (
    !petValido ||
    !descricaoValida ||
    !categoriaValida ||
    !dataValida ||
    !responsavelValido ||
    !arquivoValido ||
    petId === null ||
    responsavelId === null ||
    categoria === undefined ||
    arquivoPendente === null
  ) {
    if (!petValido) petSelect.focus();
    else {
      focarPrimeiroInvalido(formulario);
      if (!arquivoValido && formulario.querySelector('.is-invalid') === null) {
        obrigatorio<HTMLButtonElement>('#btnEscolherArquivo').focus();
      }
    }
    return;
  }

  const consultaValor = obrigatorio<HTMLSelectElement>('#axConsulta').value;
  const dados: DadosRegistroAnexo = {
    token: arquivoPendente.token,
    petId,
    consultaId: consultaValor === '' ? null : Number(consultaValor),
    responsavelId,
    descricao: descricao.value.trim(),
    categoria,
    dataDocumento,
  };

  setCarregando(botao, true, 'Registrando…');
  try {
    await window.api.anexosRegistrar(dados);
    // O token já foi consumido pelo backend: não chamar `anexosCancelar`.
    arquivoPendente = null;
    limparCamposFormulario();
    mostrarToast('Anexo clínico registrado com sucesso.', 'sucesso');
    await carregarAnexosPet(petId);
  } catch (erro) {
    mostrarToast(mensagemErro(erro), 'erro');
  } finally {
    setCarregando(botao, false);
  }
}

async function abrirAnexo(id: number): Promise<void> {
  if (!temAcessoClinico()) return;
  try {
    await window.api.anexosAbrir(id);
  } catch (erro) {
    mostrarToast(mensagemErro(erro), 'erro');
  }
}

function abrirModalInativacao(id: number): void {
  if (!temAcessoClinico()) return;
  const elemento = obrigatorio<HTMLDivElement>('#modalInativarAnexo');
  const formulario = obrigatorio<HTMLFormElement>('#formInativarAnexo');
  const motivo = obrigatorio<HTMLTextAreaElement>('#axMotivoInativacao');

  anexoParaInativar = id;
  formulario.reset();
  limparValidacao(formulario);
  modalInativacao = new window.bootstrap.Modal(elemento, { backdrop: 'static', keyboard: false });
  elemento.addEventListener('shown.bs.modal', () => motivo.focus(), { once: true });
  modalInativacao.show();
}

async function confirmarInativacao(): Promise<void> {
  const id = anexoParaInativar;
  if (id === null || !temAcessoClinico()) return;

  const formulario = obrigatorio<HTMLFormElement>('#formInativarAnexo');
  const motivo = obrigatorio<HTMLTextAreaElement>('#axMotivoInativacao');
  const texto = motivo.value.trim();
  const valido = exigir(
    motivo,
    texto.length > 0 && texto.length <= ANEXO_MOTIVO_MAXIMO,
    `Informe o motivo da inativação (máximo de ${ANEXO_MOTIVO_MAXIMO} caracteres).`
  );
  if (!valido) {
    focarPrimeiroInvalido(formulario);
    return;
  }

  const botao = obrigatorio<HTMLButtonElement>('#btnConfirmarInativacao');
  setCarregando(botao, true, 'Inativando…');
  try {
    await window.api.anexosInativar(id, texto);
    modalInativacao?.hide();
    anexoParaInativar = null;
    mostrarToast('Anexo clínico inativado com sucesso.', 'sucesso');
    await carregarAnexosPet();
  } catch (erro) {
    mostrarToast(mensagemErro(erro), 'erro');
  } finally {
    setCarregando(botao, false);
  }
}

function configurarEventos(): void {
  if (eventosLigados) return;
  eventosLigados = true;

  obrigatorio<HTMLSelectElement>('#axPet').addEventListener('change', () => {
    limparFormulario();
    void carregarAnexosPet();
  });

  obrigatorio<HTMLButtonElement>('#btnEscolherArquivo').addEventListener('click', () => {
    void escolherArquivo();
  });

  obrigatorio<HTMLFormElement>('#formAnexo').addEventListener('submit', (evento) => {
    void salvarAnexo(evento);
  });

  const corpo = obrigatorio<HTMLTableSectionElement>('#tbAnexos');
  corpo.addEventListener('click', (evento) => {
    const alvo = evento.target;
    if (!(alvo instanceof Element)) return;
    const botao = alvo.closest<HTMLButtonElement>('button[data-acao][data-id]');
    if (!botao || !corpo.contains(botao)) return;

    const acao = botao.dataset.acao;
    const id = Number(botao.dataset.id);
    if (!Number.isInteger(id) || id <= 0) return;
    if (acao === 'abrir') void abrirAnexo(id);
    else if (acao === 'inativar') abrirModalInativacao(id);
  });

  const modalElemento = obrigatorio<HTMLDivElement>('#modalInativarAnexo');
  const formMotivo = obrigatorio<HTMLFormElement>('#formInativarAnexo');
  modalElemento.addEventListener('hidden.bs.modal', () => {
    anexoParaInativar = null;
    formMotivo.reset();
    limparValidacao(formMotivo);
  });
  obrigatorio<HTMLButtonElement>('#btnConfirmarInativacao').addEventListener('click', () => {
    void confirmarInativacao();
  });
}

/** Liga eventos, aplica permissões e renderiza vazio; carrega se já houver sessão. */
export async function iniciarAnexos(): Promise<void> {
  configurarEventos();
  aplicarPermissoesAnexos();
  renderizarHistorico([]);

  // Antes do login não há sessão: `carregarTudo()` faz a carga inicial autorizada.
  if (obterUsuario() === null || !temAcessoClinico()) return;
  preencherSelectPetsAnexos(await window.api.listarPets());
  await carregarAnexosPet();
}

/** Limpa estado, seleção e mensagens ao sair; ignora respostas antigas. */
export function limparAnexos(): void {
  sequenciaCarregamento += 1;
  cancelarArquivoPendente();
  petAtualId = null;
  petsVisiveis = new Map();
  veterinariosCarregados = false;
  anexoParaInativar = null;

  const petSelect = obrigatorio<HTMLSelectElement>('#axPet');
  petSelect.replaceChildren();
  const placeholderPet = document.createElement('option');
  placeholderPet.value = '';
  placeholderPet.textContent = 'Selecione um pet…';
  petSelect.append(placeholderPet);

  preencherSelectResponsaveis([]);
  resetarConsulta();
  obrigatorio<HTMLTableSectionElement>('#tbAnexos').setAttribute('aria-busy', 'false');
  limparCamposFormulario();
  renderizarHistorico([]);

  const formMotivo = obrigatorio<HTMLFormElement>('#formInativarAnexo');
  formMotivo.reset();
  limparValidacao(formMotivo);
  aplicarPermissoesAnexos();
}
