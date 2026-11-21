/** Carteira de vacinação: histórico, registro, edição e estorno auditado. */

import {
  VACINA_DOSE_MAXIMO,
  VACINA_FABRICANTE_MAXIMO,
  VACINA_LOTE_MAXIMO,
  VACINA_NOME_MAXIMO,
  VACINA_OBSERVACOES_MAXIMO,
  VACINA_REACAO_MAXIMO,
} from '../../shared/constants';
import { dataCivilClinica } from '../../shared/datas';
import type { DadosAtualizacaoVacina, DadosRegistroVacina, Pet, RegistroVacina, VeterinarioResumo } from '../types';
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

const COLUNAS_HISTORICO = 11;
const FORMATO_DATA_CIVIL = /^\d{4}-\d{2}-\d{2}$/;

const ROTULOS_STATUS: Readonly<Record<string, string>> = {
  AGENDADA: 'Agendada',
  CONFIRMADA: 'Confirmada',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
};

export class VacinaController {
  private petsVisiveis = new Map<number, Pet>();
  private registrosVisiveis = new Map<number, RegistroVacina>();
  private petsCarregados = false;
  private veterinariosCarregados = false;
  private petAtualId: number | null = null;
  private idEdicao: number | null = null;
  private sequenciaCarregamento = 0;
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

  /** Preenche o seletor de pets da carteira preservando a seleção atual. */
  preencherSelectPets(pets: Pet[]): void {
    const select = obrigatorio<HTMLSelectElement>('#vcPet');
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
    this.petsCarregados = true;
    this.atualizarTituloFormulario();
  }

  /** Carrega histórico e consultas vinculáveis do pet informado (ou selecionado). */
  async carregar(petId?: number): Promise<void> {
    this.aplicarPermissoes();
    if (!this.contexto.auth.temAcessoClinico()) return;

    await this.garantirVeterinarios();

    const select = obrigatorio<HTMLSelectElement>('#vcPet');
    if (petId !== undefined && select.value !== String(petId)) select.value = String(petId);
    const id = petId ?? (select.value === '' ? null : Number(select.value));
    const corpo = obrigatorio<HTMLTableSectionElement>('#tbVacinas');

    if (id === null || !Number.isInteger(id) || id <= 0) {
      this.petAtualId = null;
      this.atualizarTituloFormulario();
      this.resetarConsulta();
      this.renderizarHistorico([]);
      return;
    }

    if (this.petAtualId !== id) {
      this.petAtualId = id;
      this.limparFormulario();
      this.atualizarTituloFormulario();
    }

    const sequencia = this.sequenciaCarregamento + 1;
    this.sequenciaCarregamento = sequencia;
    corpo.setAttribute('aria-busy', 'true');
    corpo.replaceChildren(linhaMensagem('Carregando a carteira de vacinação do pet…', COLUNAS_HISTORICO));

    try {
      const registros = await window.api.vacinasListarPet(id);
      if (sequencia === this.sequenciaCarregamento) this.renderizarHistorico(registros);
    } catch (erro) {
      if (sequencia === this.sequenciaCarregamento) {
        corpo.replaceChildren(
          linhaMensagem(
            'Não foi possível carregar a carteira de vacinação.',
            COLUNAS_HISTORICO,
            'text-center text-danger py-4'
          )
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
    if (!this.petsCarregados) this.preencherSelectPets(await window.api.listarPets());
    await this.garantirVeterinarios();
    await this.carregar();
  }

  /** Limpa estado, seleção e mensagens ao sair; ignora respostas antigas. */
  limpar(): void {
    this.sequenciaCarregamento += 1;
    this.petsCarregados = false;
    this.veterinariosCarregados = false;
    this.petAtualId = null;
    this.idEdicao = null;
    this.petsVisiveis = new Map();
    this.registrosVisiveis = new Map();

    const petSelect = obrigatorio<HTMLSelectElement>('#vcPet');
    petSelect.replaceChildren();
    const placeholderPet = document.createElement('option');
    placeholderPet.value = '';
    placeholderPet.textContent = 'Selecione um pet…';
    petSelect.append(placeholderPet);

    this.resetarConsulta();

    const veterinario = obrigatorio<HTMLSelectElement>('#vcVeterinario');
    veterinario.replaceChildren();
    const placeholderVeterinario = document.createElement('option');
    placeholderVeterinario.value = '';
    placeholderVeterinario.textContent = 'Selecione o veterinário…';
    veterinario.append(placeholderVeterinario);

    obrigatorio<HTMLTableSectionElement>('#tbVacinas').setAttribute('aria-busy', 'false');
    this.limparFormulario();
    this.renderizarHistorico([]);
    obrigatorio<HTMLElement>('#vcAvisoAtendente').hidden = true;
    obrigatorio<HTMLElement>('#vcAreaClinica').hidden = true;
  }

  private aplicarPermissoes(): void {
    const aviso = obrigatorio<HTMLElement>('#vcAvisoAtendente');
    const area = obrigatorio<HTMLElement>('#vcAreaClinica');
    const usuario = this.contexto.auth.obterUsuario();
    const acesso = usuario !== null && this.contexto.auth.temAcessoClinico();

    aviso.hidden = acesso;
    area.hidden = !acesso;
    obrigatorio<HTMLElement>('#vcGrupoVeterinario').hidden = usuario?.role !== 'ADMIN';
    if (!acesso) this.petAtualId = null;
  }

  private descricaoVeterinario(veterinario: RegistroVacina['veterinario']): string {
    const crmv = veterinario.crmv?.trim();
    return `${textoOuTraco(veterinario.nome)} — ${crmv ? crmv : 'CRMV não informado'}`;
  }

  private atualizarTituloFormulario(): void {
    const pet = this.petAtualId === null ? undefined : this.petsVisiveis.get(this.petAtualId);
    obrigatorio<HTMLElement>('#vcFormTitulo').textContent = this.idEdicao !== null
      ? 'Editando registro de vacinação'
      : pet
        ? `Registrar vacinação — ${pet.nome}`
        : 'Registrar vacinação';
    obrigatorio<HTMLButtonElement>('#btnCancelarEdicaoVacina').hidden = this.idEdicao === null;
  }

  private renderizarHistorico(registros: RegistroVacina[]): void {
    const corpo = obrigatorio<HTMLTableSectionElement>('#tbVacinas');
    const resumo = obrigatorio<HTMLElement>('#vcResumo');
    corpo.replaceChildren();
    this.registrosVisiveis = new Map(registros.map((registro) => [registro.id, registro]));
    resumo.hidden = registros.length === 0;
    resumo.textContent =
      registros.length === 0 ? '' : `${registros.length} ${registros.length === 1 ? 'registro' : 'registros'}`;

    if (registros.length === 0) {
      const mensagem =
        this.petAtualId === null
          ? 'Selecione um pet para ver a carteira de vacinação.'
          : 'Nenhuma vacinação registrada para este pet.';
      corpo.append(linhaMensagem(mensagem, COLUNAS_HISTORICO));
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
        criarCelula(this.descricaoVeterinario(registro.veterinario), 'small'),
        criarCelula(textoOuTraco(registro.observacoes), 'text-break small'),
        criarCelula(formatarDataHora(registro.registradoEm), 'text-nowrap small')
      );

      const celulaAcoes = document.createElement('td');
      if (registro.estornado) {
        celulaAcoes.append(criarBadge('Estornada', 'text-bg-secondary'));
      } else {
        const grupo = document.createElement('div');
        grupo.className = 'd-flex flex-wrap gap-1';
        grupo.setAttribute('role', 'group');
        grupo.setAttribute('aria-label', `Ações do registro de ${registro.vacina}`);
        grupo.append(
          criarBotaoAcao('editar-vacina', registro.id, 'Editar', `Editar registro de ${registro.vacina}`),
          criarBotaoAcao(
            'estornar-vacina',
            registro.id,
            'Estornar',
            `Estornar registro de ${registro.vacina}`,
            'btn-outline-warning danger'
          )
        );
        celulaAcoes.append(grupo);
      }
      linha.append(celulaAcoes);
      corpo.append(linha);
    }
  }

  private preencherSelectVeterinarios(veterinarios: VeterinarioResumo[]): void {
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

  private async garantirVeterinarios(): Promise<void> {
    if (this.veterinariosCarregados || !this.contexto.auth.isAdmin()) return;
    try {
      this.preencherSelectVeterinarios(await window.api.veterinariosListar());
      this.veterinariosCarregados = true;
    } catch (erro) {
      mostrarToast(mensagemErro(erro), 'erro');
    }
  }

  private resetarConsulta(): void {
    const select = obrigatorio<HTMLSelectElement>('#vcConsulta');
    select.replaceChildren();
    const nenhuma = document.createElement('option');
    nenhuma.value = '';
    nenhuma.textContent = 'Nenhuma';
    select.append(nenhuma);
  }

  private async carregarConsultasPet(petId: number, sequencia: number): Promise<void> {
    const select = obrigatorio<HTMLSelectElement>('#vcConsulta');
    const anterior = select.value;
    try {
      const consultas = await window.api.prontuarioListarPet(petId);
      if (sequencia !== this.sequenciaCarregamento) return;

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
    } catch (erro) {
      if (sequencia !== this.sequenciaCarregamento) return;
      this.resetarConsulta();
      mostrarToast(mensagemErro(erro), 'erro');
    }
  }

  private limparCamposFormulario(): void {
    const formulario = obrigatorio<HTMLFormElement>('#formVacina');
    const veterinario = obrigatorio<HTMLSelectElement>('#vcVeterinario');
    const veterinarioAnterior = veterinario.value;
    formulario.reset();
    veterinario.value = veterinarioAnterior;
    limparValidacao(formulario);
  }

  private limparFormulario(): void {
    this.idEdicao = null;
    this.limparCamposFormulario();
    obrigatorio<HTMLButtonElement>('#btnSalvarVacina').textContent = 'Registrar vacinação';
    setCarregando(obrigatorio<HTMLButtonElement>('#btnSalvarVacina'), false);
    this.atualizarTituloFormulario();
  }

  private preencherFormulario(registro: RegistroVacina): void {
    this.idEdicao = registro.id;
    this.definirValor('#vcVacina', registro.vacina);
    this.definirValor('#vcFabricante', registro.fabricante);
    this.definirValor('#vcLote', registro.lote);
    this.definirValor('#vcValidade', registro.validade);
    this.definirValor('#vcAplicadaEm', this.paraDatetimeLocal(registro.aplicadaEm));
    this.definirValor('#vcDose', registro.dose);
    this.definirValor('#vcProximaDose', registro.proximaDose ?? '');
    this.definirValor('#vcReacao', registro.reacao ?? '');
    this.definirValor('#vcObservacoes', registro.observacoes ?? '');

    const usuario = this.contexto.auth.obterUsuario();
    if (usuario?.role === 'ADMIN') {
      obrigatorio<HTMLSelectElement>('#vcVeterinario').value = String(registro.veterinarioId);
    }
    obrigatorio<HTMLSelectElement>('#vcConsulta').value =
      registro.consultaId === null ? '' : String(registro.consultaId);

    obrigatorio<HTMLButtonElement>('#btnSalvarVacina').textContent = 'Salvar alterações';
    limparValidacao(obrigatorio<HTMLFormElement>('#formVacina'));
    this.atualizarTituloFormulario();
    obrigatorio<HTMLInputElement>('#vcVacina').focus();
  }

  private definirValor(seletor: string, valor: string): void {
    const elemento = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(seletor);
    if (elemento) elemento.value = valor;
  }

  private paraDatetimeLocal(dataIso: string): string {
    const data = new Date(dataIso);
    if (Number.isNaN(data.getTime())) return '';
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    const hora = String(data.getHours()).padStart(2, '0');
    const minuto = String(data.getMinutes()).padStart(2, '0');
    return `${ano}-${mes}-${dia}T${hora}:${minuto}`;
  }

  private validarTextoObrigatorio(campo: HTMLInputElement, maximo: number, descricao: string): boolean {
    const tamanho = campo.value.trim().length;
    return exigir(campo, tamanho > 0 && tamanho <= maximo, `Informe ${descricao} (máximo de ${maximo} caracteres).`);
  }

  private validarTextoOpcional(campo: HTMLTextAreaElement, maximo: number, descricao: string): boolean {
    return exigir(campo, campo.value.trim().length <= maximo, `${descricao} deve ter no máximo ${maximo} caracteres.`);
  }

  private async salvar(evento: Event, botao: HTMLButtonElement): Promise<void> {
    evento.preventDefault();
    const formulario = obrigatorio<HTMLFormElement>('#formVacina');
    limparValidacao(formulario);

    const usuario = this.contexto.auth.obterUsuario();
    if (usuario === null || !this.contexto.auth.temAcessoClinico()) {
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
      this.validarTextoObrigatorio(vacina, VACINA_NOME_MAXIMO, 'a vacina'),
      this.validarTextoObrigatorio(fabricante, VACINA_FABRICANTE_MAXIMO, 'o fabricante'),
      this.validarTextoObrigatorio(lote, VACINA_LOTE_MAXIMO, 'o código do lote'),
      this.validarTextoObrigatorio(dose, VACINA_DOSE_MAXIMO, 'a sequência da dose'),
      this.validarTextoOpcional(reacaoCampo, VACINA_REACAO_MAXIMO, 'A descrição da reação adversa'),
      this.validarTextoOpcional(observacoesCampo, VACINA_OBSERVACOES_MAXIMO, 'As observações'),
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
    const idEdicao = this.idEdicao;

    setCarregando(botao, true, 'Salvando…');
    try {
      if (idEdicao === null) {
        await window.api.vacinasRegistrar(dados);
        mostrarToast('Vacinação registrada com sucesso.', 'sucesso');
      } else {
        const atualizacao: DadosAtualizacaoVacina = { ...dados, id: idEdicao };
        await window.api.vacinasAtualizar(atualizacao);
        mostrarToast('Registro de vacinação atualizado com sucesso.', 'sucesso');
      }
      this.limparFormulario();
      await this.carregar(petId);
    } catch (erro) {
      mostrarToast(mensagemErro(erro), 'erro');
    } finally {
      setCarregando(botao, false);
    }
  }

  private async estornar(registro: RegistroVacina, botao: HTMLButtonElement): Promise<void> {
    const motivo = await pedirMotivo({
      titulo: 'Estornar vacinação',
      descricao:
        `O registro de ${registro.vacina} será marcado como estornado. ` +
        'A prova sanitária original é preservada e o motivo fica registrado na auditoria.',
      rotuloConfirmar: 'Estornar registro',
    });
    if (motivo === null) return;

    setCarregando(botao, true, 'Estornando…');
    try {
      await window.api.vacinasEstornar({ id: registro.id, motivo });
      if (this.idEdicao === registro.id) this.limparFormulario();
      mostrarToast('Registro estornado. O motivo foi registrado na auditoria.', 'sucesso');
      await this.carregar();
    } catch (erro) {
      mostrarToast(mensagemErro(erro), 'erro');
    } finally {
      setCarregando(botao, false);
    }
  }

  private configurarEventos(): void {
    obrigatorio<HTMLSelectElement>('#vcPet').addEventListener('change', () => {
      this.limparFormulario();
      void this.carregar();
    });

    obrigatorio<HTMLFormElement>('#formVacina').addEventListener('submit', (evento) => {
      void this.salvar(evento, obrigatorio<HTMLButtonElement>('#btnSalvarVacina'));
    });

    obrigatorio<HTMLButtonElement>('#btnCancelarEdicaoVacina').addEventListener('click', () => {
      this.limparFormulario();
    });

    obrigatorio<HTMLTableSectionElement>('#tbVacinas').addEventListener('click', (evento) => {
      const alvo = evento.target;
      if (!(alvo instanceof Element)) return;
      const botao = alvo.closest<HTMLButtonElement>('button[data-acao][data-id]');
      if (!botao || botao.disabled) return;
      const id = Number(botao.dataset.id);
      if (!Number.isInteger(id) || id <= 0) return;
      const registro = this.registrosVisiveis.get(id);
      if (registro === undefined || registro.estornado) return;

      if (botao.dataset.acao === 'editar-vacina') this.preencherFormulario(registro);
      else if (botao.dataset.acao === 'estornar-vacina') void this.estornar(registro, botao);
    });
  }
}
