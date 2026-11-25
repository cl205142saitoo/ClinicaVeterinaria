/** Anexos clínicos: histórico por pet, registro, edição de metadados e inativação auditada. */

import {
  ANEXO_CATEGORIAS,
  ANEXO_DESCRICAO_MAXIMO,
  ANEXO_DESCRICAO_MINIMO,
  ANEXO_MOTIVO_MAXIMO,
  LIMITE_LISTAGEM_ANEXOS,
} from '../../shared/constants';
import { dataCivilClinica } from '../../shared/datas';
import type {
  AnexoClinico,
  ArquivoAnexoSelecionado,
  BootstrapModal,
  CategoriaAnexo,
  ConsultaProntuario,
  DadosAtualizacaoAnexo,
  DadosRegistroAnexo,
  Pet,
  VeterinarioResumo,
} from '../types';
import {
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
  setCarregando,
  textoOuTraco,
} from '../ui';
import type { ContextoApp } from './contexto';

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

export class AnexoController {
  private petsVisiveis = new Map<number, Pet>();
  private anexosVisiveis = new Map<number, AnexoClinico>();
  private consultasVisiveis = new Map<number, ConsultaProntuario>();
  private arquivoPendente: ArquivoAnexoSelecionado | null = null;
  private sequenciaCarregamento = 0;
  private petAtualId: number | null = null;
  private veterinariosCarregados = false;
  private anexoParaInativar: number | null = null;
  private anexoParaEditar: number | null = null;
  private modalInativacao: BootstrapModal | null = null;
  private modalEdicao: BootstrapModal | null = null;
  private eventosLigados = false;

  constructor(private readonly contexto: ContextoApp) {}

  iniciar(): void {
    if (!this.eventosLigados) {
      this.eventosLigados = true;
      this.configurarEventos();
    }
    this.aplicarPermissoes();
    this.renderizarHistorico([]);
  }

  /** Preenche o seletor de pets preservando a seleção atual. */
  preencherSelectPets(pets: Pet[]): void {
    const select = obrigatorio<HTMLSelectElement>('#axPet');
    const anterior = select.value;
    this.petsVisiveis = new Map(pets.map((pet) => [pet.id, pet]));
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

  /** Carrega o histórico do pet informado (ou do selecionado) e as consultas vinculáveis. */
  async carregar(petId?: number): Promise<void> {
    this.aplicarPermissoes();
    if (!this.contexto.auth.temAcessoClinico()) return;

    await this.garantirVeterinarios();

    const select = obrigatorio<HTMLSelectElement>('#axPet');
    if (petId !== undefined && select.value !== String(petId)) select.value = String(petId);
    const id = petId ?? (select.value === '' ? null : Number(select.value));
    const corpo = obrigatorio<HTMLTableSectionElement>('#tbAnexos');

    if (id === null || !Number.isInteger(id) || id <= 0) {
      if (this.petAtualId !== null) this.limparFormulario();
      this.petAtualId = null;
      this.resetarConsulta();
      this.renderizarHistorico([]);
      return;
    }

    if (this.petAtualId !== id) {
      this.petAtualId = id;
      this.limparFormulario();
    }

    const sequencia = this.sequenciaCarregamento + 1;
    this.sequenciaCarregamento = sequencia;
    corpo.setAttribute('aria-busy', 'true');
    corpo.replaceChildren(linhaMensagem('Carregando os anexos do pet…', COLUNAS_HISTORICO));

    try {
      const anexos = await window.api.anexosListarPet(id);
      if (sequencia === this.sequenciaCarregamento) this.renderizarHistorico(anexos);
    } catch (erro) {
      if (sequencia === this.sequenciaCarregamento) {
        corpo.replaceChildren(
          linhaMensagem('Não foi possível carregar os anexos do pet.', COLUNAS_HISTORICO, 'text-center text-danger py-4')
        );
        mostrarToast(mensagemErro(erro), 'erro');
      }
    } finally {
      if (sequencia === this.sequenciaCarregamento) corpo.setAttribute('aria-busy', 'false');
    }

    if (sequencia === this.sequenciaCarregamento) await this.carregarConsultasPet(id, sequencia);
  }

  /** Carrega dados iniciais quando já existe sessão clínica autenticada. */
  async carregarSessao(): Promise<void> {
    if (!this.contexto.auth.temAcessoClinico()) return;
    this.preencherSelectPets(await window.api.listarPets());
    await this.carregar();
  }

  /** Limpa estado, seleção e mensagens ao sair; ignora respostas antigas. */
  limpar(): void {
    this.sequenciaCarregamento += 1;
    this.cancelarArquivoPendente();
    this.petAtualId = null;
    this.petsVisiveis = new Map();
    this.anexosVisiveis = new Map();
    this.consultasVisiveis = new Map();
    this.veterinariosCarregados = false;
    this.anexoParaInativar = null;
    this.anexoParaEditar = null;
    this.modalInativacao?.hide();
    this.modalEdicao?.hide();

    const petSelect = obrigatorio<HTMLSelectElement>('#axPet');
    petSelect.replaceChildren();
    const placeholderPet = document.createElement('option');
    placeholderPet.value = '';
    placeholderPet.textContent = 'Selecione um pet…';
    petSelect.append(placeholderPet);

    this.preencherSelectResponsaveis([]);
    this.resetarConsulta();
    obrigatorio<HTMLTableSectionElement>('#tbAnexos').setAttribute('aria-busy', 'false');
    this.limparCamposFormulario();
    this.renderizarHistorico([]);

    const formMotivo = obrigatorio<HTMLFormElement>('#formInativarAnexo');
    formMotivo.reset();
    limparValidacao(formMotivo);
    this.aplicarPermissoes();
  }

  private aplicarPermissoes(): void {
    const aviso = obrigatorio<HTMLElement>('#axAvisoAtendente');
    const area = obrigatorio<HTMLElement>('#axAreaClinica');
    const usuario = this.contexto.auth.obterUsuario();
    const acesso = usuario !== null && this.contexto.auth.temAcessoClinico();

    aviso.hidden = acesso;
    area.hidden = !acesso;
    obrigatorio<HTMLElement>('#axGrupoResponsavel').hidden = usuario?.role !== 'ADMIN';
    if (!acesso) this.petAtualId = null;
  }

  private dataCivilValida(valor: string): boolean {
    if (!FORMATO_DATA_CIVIL.test(valor)) return false;
    const [ano, mes, dia] = valor.split('-').map(Number);
    const data = new Date(Date.UTC(ano, mes - 1, dia));
    return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
  }

  private hojeCivil(): string {
    return dataCivilClinica(new Date());
  }

  private formatarTamanho(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) return '—';
    if (bytes < 1024) return `${Math.round(bytes)} B`;
    const casas = { minimumFractionDigits: 1, maximumFractionDigits: 1 } as const;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString('pt-BR', casas)} KB`;
    return `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', casas)} MB`;
  }

  private rotuloMime(mimeType: string): string {
    if (mimeType === 'application/pdf') return 'PDF';
    if (mimeType === 'image/jpeg') return 'JPEG';
    if (mimeType === 'image/png') return 'PNG';
    return 'Arquivo';
  }

  private descricaoResponsavel(responsavel: AnexoClinico['responsavel']): string {
    const crmv = responsavel.crmv?.trim();
    return `${textoOuTraco(responsavel.nome)} — ${crmv ? crmv : 'CRMV não informado'}`;
  }

  private celulaSituacao(inativo: boolean): HTMLTableCellElement {
    const celula = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `badge ${inativo ? 'text-bg-secondary' : 'text-bg-success'}`;
    badge.textContent = inativo ? 'Inativo' : 'Ativo';
    celula.append(badge);
    return celula;
  }

  private celulaAcoes(anexo: AnexoClinico): HTMLTableCellElement {
    const celula = document.createElement('td');
    celula.className = 'text-nowrap';
    const descricao = textoOuTraco(anexo.descricao);
    celula.append(criarBotaoAcao('abrir', anexo.id, 'Abrir', `Abrir o anexo: ${descricao}`));
    if (!anexo.inativo) {
      celula.append(
        criarBotaoAcao(
          'editar-anexo',
          anexo.id,
          'Editar',
          `Editar metadados do anexo: ${descricao}`
        ),
        criarBotaoAcao(
          'inativar',
          anexo.id,
          'Inativar',
          `Inativar o anexo: ${descricao}`,
          'btn-outline-danger'
        )
      );
    }
    return celula;
  }

  private renderizarHistorico(anexos: AnexoClinico[]): void {
    const corpo = obrigatorio<HTMLTableSectionElement>('#tbAnexos');
    const resumo = obrigatorio<HTMLElement>('#axResumo');
    corpo.replaceChildren();
    this.anexosVisiveis = new Map(anexos.map((anexo) => [anexo.id, anexo]));
    resumo.hidden = anexos.length === 0;

    if (anexos.length === 0) {
      resumo.textContent = '';
      const mensagem =
        this.petAtualId === null
          ? 'Selecione um pet para ver os anexos clínicos.'
          : 'Nenhum anexo clínico registrado para este pet.';
      corpo.append(linhaMensagem(mensagem, COLUNAS_HISTORICO));
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
        criarCelula(`${textoOuTraco(anexo.nomeOriginal)} (${this.rotuloMime(anexo.mimeType)})`, 'text-break small'),
        criarCelula(this.formatarTamanho(anexo.tamanhoBytes), 'text-nowrap small'),
        criarCelula(this.descricaoResponsavel(anexo.responsavel), 'small'),
        criarCelula(formatarDataHora(anexo.registradoEm), 'text-nowrap small'),
        this.celulaSituacao(anexo.inativo),
        this.celulaAcoes(anexo)
      );
      corpo.append(linha);
    }
  }

  private preencherSelectResponsaveis(veterinarios: VeterinarioResumo[]): void {
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

  private async garantirVeterinarios(): Promise<void> {
    if (!this.contexto.auth.isAdmin() || this.veterinariosCarregados) return;
    try {
      this.preencherSelectResponsaveis(await window.api.veterinariosListar());
      this.veterinariosCarregados = true;
    } catch (erro) {
      mostrarToast(mensagemErro(erro), 'erro');
    }
  }

  private resetarConsulta(): void {
    const select = obrigatorio<HTMLSelectElement>('#axConsulta');
    this.consultasVisiveis = new Map();
    select.replaceChildren();
    const nenhuma = document.createElement('option');
    nenhuma.value = '';
    nenhuma.textContent = 'Nenhuma';
    select.append(nenhuma);
  }

  private async carregarConsultasPet(petId: number, sequencia: number): Promise<void> {
    const select = obrigatorio<HTMLSelectElement>('#axConsulta');
    const anterior = select.value;
    try {
      const consultas = await window.api.prontuarioListarPet(petId);
      if (sequencia !== this.sequenciaCarregamento) return;

      this.consultasVisiveis = new Map(consultas.map((consulta) => [consulta.id, consulta]));
      select.replaceChildren();
      const nenhuma = document.createElement('option');
      nenhuma.value = '';
      nenhuma.textContent = 'Nenhuma';
      select.append(nenhuma);

      for (const consulta of consultas) {
        const opcao = document.createElement('option');
        opcao.value = String(consulta.id);
        opcao.textContent = `${formatarDataHora(consulta.dataHora)} / ${textoOuTraco(consulta.motivo)} — ${
          ROTULOS_STATUS[consulta.status] ?? consulta.status
        }`;
        select.append(opcao);
      }
      select.value = consultas.some((consulta) => String(consulta.id) === anterior) ? anterior : '';
      this.aplicarResponsavelDaConsulta();
    } catch (erro) {
      if (sequencia !== this.sequenciaCarregamento) return;
      this.resetarConsulta();
      mostrarToast(mensagemErro(erro), 'erro');
    }
  }

  /** ADMIN: o responsável passa a ser o veterinário da consulta vinculada. */
  private aplicarResponsavelDaConsulta(): void {
    if (obrigatorio<HTMLElement>('#axGrupoResponsavel').hidden) return;
    const valor = obrigatorio<HTMLSelectElement>('#axConsulta').value;
    const id = valor === '' ? null : Number(valor);
    const consulta = id === null ? undefined : this.consultasVisiveis.get(id);
    obrigatorio<HTMLSelectElement>('#axResponsavel').value =
      consulta === undefined ? '' : String(consulta.veterinario.id);
  }

  /** Nunca exibe token, caminho do disco nem checksum completo. */
  private atualizarInfoArquivo(): void {
    const info = obrigatorio<HTMLElement>('#axArquivoInfo');
    info.classList.remove('text-danger');
    if (this.arquivoPendente === null) {
      info.textContent = 'Nenhum arquivo selecionado.';
      return;
    }
    info.textContent = `${this.arquivoPendente.nomeOriginal} · ${this.rotuloMime(this.arquivoPendente.mimeType)} · ${this.formatarTamanho(
      this.arquivoPendente.tamanhoBytes
    )} — pronto para registrar.`;
  }

  private cancelarArquivoPendente(): void {
    const pendente = this.arquivoPendente;
    this.arquivoPendente = null;
    if (pendente !== null) void window.api.anexosCancelar(pendente.token).catch(() => {});
  }

  /** O botão de arquivo não é um CampoValidavel; espelha `exigir` para ele. */
  private marcarArquivoInvalido(valido: boolean, mensagem: string): boolean {
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
  private limparCamposFormulario(): void {
    const formulario = obrigatorio<HTMLFormElement>('#formAnexo');
    const petSelect = obrigatorio<HTMLSelectElement>('#axPet');
    const responsavel = obrigatorio<HTMLSelectElement>('#axResponsavel').value;
    const pet = petSelect.value;

    formulario.reset();
    petSelect.value = pet;
    obrigatorio<HTMLSelectElement>('#axResponsavel').value = responsavel;
    limparValidacao(formulario);
    exigir(petSelect, true, '');
    this.marcarArquivoInvalido(true, '');
    this.atualizarInfoArquivo();
  }

  private limparFormulario(): void {
    this.cancelarArquivoPendente();
    this.resetarConsulta();
    this.limparCamposFormulario();
    setCarregando(obrigatorio<HTMLButtonElement>('#btnSalvarAnexo'), false);
  }

  private async escolherArquivo(): Promise<void> {
    if (!this.contexto.auth.temAcessoClinico()) return;
    try {
      const arquivo = await window.api.anexosEscolherArquivo();
      if (arquivo === null) return;

      const anterior = this.arquivoPendente;
      if (anterior !== null) void window.api.anexosCancelar(anterior.token).catch(() => {});
      this.arquivoPendente = arquivo;
      this.marcarArquivoInvalido(true, '');
      this.atualizarInfoArquivo();
    } catch (erro) {
      mostrarToast(mensagemErro(erro), 'erro');
    }
  }

  private async salvar(evento: Event, botao: HTMLButtonElement): Promise<void> {
    evento.preventDefault();
    const formulario = obrigatorio<HTMLFormElement>('#formAnexo');
    limparValidacao(formulario);

    const usuario = this.contexto.auth.obterUsuario();
    if (usuario === null || !this.contexto.auth.temAcessoClinico()) {
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
      this.dataCivilValida(dataDocumento) && dataDocumento <= this.hojeCivil(),
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
      responsavelId = usuario.id;
    }

    const arquivoValido = this.marcarArquivoInvalido(
      this.arquivoPendente !== null,
      'Escolha um arquivo antes de registrar.'
    );

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
      this.arquivoPendente === null
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
      token: this.arquivoPendente.token,
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
      this.arquivoPendente = null;
      this.limparCamposFormulario();
      mostrarToast('Anexo clínico registrado com sucesso.', 'sucesso');
      await this.carregar(petId);
    } catch (erro) {
      mostrarToast(mensagemErro(erro), 'erro');
    } finally {
      setCarregando(botao, false);
    }
  }

  private async abrirAnexo(id: number): Promise<void> {
    if (!this.contexto.auth.temAcessoClinico()) return;
    try {
      await window.api.anexosAbrir(id);
    } catch (erro) {
      mostrarToast(mensagemErro(erro), 'erro');
    }
  }

  private abrirModalInativacao(id: number): void {
    if (!this.contexto.auth.temAcessoClinico()) return;
    const elemento = obrigatorio<HTMLDivElement>('#modalInativarAnexo');
    const formulario = obrigatorio<HTMLFormElement>('#formInativarAnexo');
    const motivo = obrigatorio<HTMLTextAreaElement>('#axMotivoInativacao');

    this.anexoParaInativar = id;
    formulario.reset();
    limparValidacao(formulario);
    // Uma única instância por elemento: recriá-la deixa o backdrop preso.
    this.modalInativacao ??= new window.bootstrap.Modal(elemento, {
      backdrop: 'static',
      keyboard: false,
    });
    elemento.addEventListener('shown.bs.modal', () => motivo.focus(), { once: true });
    this.modalInativacao.show();
  }

  private async confirmarInativacao(): Promise<void> {
    const id = this.anexoParaInativar;
    if (id === null || !this.contexto.auth.temAcessoClinico()) return;

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
      this.modalInativacao?.hide();
      this.anexoParaInativar = null;
      mostrarToast('Anexo clínico inativado com sucesso.', 'sucesso');
      await this.carregar();
    } catch (erro) {
      mostrarToast(mensagemErro(erro), 'erro');
    } finally {
      setCarregando(botao, false);
    }
  }

  private abrirModalEdicao(anexo: AnexoClinico): void {
    if (!this.contexto.auth.temAcessoClinico() || anexo.inativo) return;
    this.anexoParaEditar = anexo.id;
    obrigatorio<HTMLInputElement>('#edAnexoId').value = String(anexo.id);
    obrigatorio<HTMLTextAreaElement>('#edAnexoDescricao').value = anexo.descricao;
    obrigatorio<HTMLSelectElement>('#edAnexoCategoria').value = anexo.categoria;
    obrigatorio<HTMLInputElement>('#edAnexoDataDocumento').value = anexo.dataDocumento;
    const formulario = obrigatorio<HTMLFormElement>('#formEditarAnexo');
    limparValidacao(formulario);

    const elemento = obrigatorio<HTMLDivElement>('#modalEditarAnexo');
    // Uma única instância por elemento: criar outra no hide deixaria o backdrop preso.
    this.modalEdicao ??= new window.bootstrap.Modal(elemento, {
      backdrop: 'static',
      keyboard: false,
    });
    elemento.addEventListener(
      'shown.bs.modal',
      () => obrigatorio<HTMLTextAreaElement>('#edAnexoDescricao').focus(),
      { once: true }
    );
    this.modalEdicao.show();
  }

  private async salvarEdicao(botao: HTMLButtonElement): Promise<void> {
    const id = this.anexoParaEditar;
    if (id === null || !this.contexto.auth.temAcessoClinico()) return;

    const formulario = obrigatorio<HTMLFormElement>('#formEditarAnexo');
    limparValidacao(formulario);
    const descricao = obrigatorio<HTMLTextAreaElement>('#edAnexoDescricao');
    const categoriaSelect = obrigatorio<HTMLSelectElement>('#edAnexoCategoria');
    const dataCampo = obrigatorio<HTMLInputElement>('#edAnexoDataDocumento');
    const categoria = ANEXO_CATEGORIAS.find((opcao) => opcao === categoriaSelect.value);
    const dataDocumento = dataCampo.value.trim();

    const resultados = [
      exigir(
        descricao,
        descricao.value.trim().length >= ANEXO_DESCRICAO_MINIMO &&
          descricao.value.trim().length <= ANEXO_DESCRICAO_MAXIMO,
        `A descrição deve ter entre ${ANEXO_DESCRICAO_MINIMO} e ${ANEXO_DESCRICAO_MAXIMO} caracteres.`
      ),
      exigir(categoriaSelect, categoria !== undefined, 'Selecione uma categoria válida.'),
      exigir(
        dataCampo,
        this.dataCivilValida(dataDocumento) && dataDocumento <= this.hojeCivil(),
        'Informe uma data válida (AAAA-MM-DD), sem data futura.'
      ),
    ];
    if (!resultados.every(Boolean) || categoria === undefined) {
      focarPrimeiroInvalido(formulario);
      return;
    }

    const dados: DadosAtualizacaoAnexo = {
      id,
      descricao: descricao.value.trim(),
      categoria,
      dataDocumento,
    };

    setCarregando(botao, true, 'Salvando…');
    try {
      await window.api.anexosAtualizar(dados);
      this.modalEdicao?.hide();
      this.anexoParaEditar = null;
      mostrarToast('Metadados do anexo atualizados com sucesso.', 'sucesso');
      await this.carregar();
    } catch (erro) {
      mostrarToast(mensagemErro(erro), 'erro');
    } finally {
      setCarregando(botao, false);
    }
  }

  private configurarEventos(): void {
    obrigatorio<HTMLSelectElement>('#axPet').addEventListener('change', () => {
      this.limparFormulario();
      void this.carregar();
    });

    obrigatorio<HTMLSelectElement>('#axConsulta').addEventListener('change', () => {
      this.aplicarResponsavelDaConsulta();
    });

    obrigatorio<HTMLButtonElement>('#btnEscolherArquivo').addEventListener('click', () => {
      void this.escolherArquivo();
    });

    obrigatorio<HTMLFormElement>('#formAnexo').addEventListener('submit', (evento) => {
      void this.salvar(evento, obrigatorio<HTMLButtonElement>('#btnSalvarAnexo'));
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
      const anexo = this.anexosVisiveis.get(id);
      if (anexo === undefined) return;

      if (acao === 'abrir') void this.abrirAnexo(id);
      else if (acao === 'inativar') this.abrirModalInativacao(id);
      else if (acao === 'editar-anexo') this.abrirModalEdicao(anexo);
    });

    const modalElemento = obrigatorio<HTMLDivElement>('#modalInativarAnexo');
    const formMotivo = obrigatorio<HTMLFormElement>('#formInativarAnexo');
    modalElemento.addEventListener('hidden.bs.modal', () => {
      this.anexoParaInativar = null;
      formMotivo.reset();
      limparValidacao(formMotivo);
    });
    obrigatorio<HTMLButtonElement>('#btnConfirmarInativacao').addEventListener('click', () => {
      void this.confirmarInativacao();
    });

    obrigatorio<HTMLButtonElement>('#btnSalvarEdicaoAnexo').addEventListener('click', () => {
      void this.salvarEdicao(obrigatorio<HTMLButtonElement>('#btnSalvarEdicaoAnexo'));
    });
    obrigatorio<HTMLDivElement>('#modalEditarAnexo').addEventListener('hidden.bs.modal', () => {
      this.anexoParaEditar = null;
      limparValidacao(obrigatorio<HTMLFormElement>('#formEditarAnexo'));
    });
  }
}
