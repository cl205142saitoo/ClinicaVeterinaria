/** Prontuário clínico: histórico por pet, formulário e conclusão explícita da consulta. */

import {
  PRONTUARIO_TEMPERATURA_MAXIMA_C,
  PRONTUARIO_TEMPERATURA_MINIMA_C,
  PRONTUARIO_TEXTO_MAXIMO,
  PRONTUARIO_TEXTO_MINIMO,
  STATUS_CONCLUIVEIS,
} from '../../shared/constants';
import type { ConsultaProntuario, DadosProntuario, Pet, Role } from '../types';
import {
  criarBadge,
  criarBotaoAcao,
  criarCelula,
  exigir,
  focarPrimeiroInvalido,
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

const COLUNAS_HISTORICO = 8;

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

export class ProntuarioController {
  private consultasVisiveis = new Map<number, ConsultaProntuario>();
  private petsCarregados = false;
  private petAtualId: number | null = null;
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

  /** Preenche o seletor de pets do prontuário preservando a seleção atual. */
  preencherSelectPets(pets: Pet[]): void {
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
    this.petsCarregados = true;
  }

  /** Carrega o histórico do pet informado (ou do selecionado). */
  async carregar(petId?: number): Promise<void> {
    this.aplicarPermissoes();
    if (!this.contexto.auth.temAcessoClinico()) return;

    const select = obrigatorio<HTMLSelectElement>('#prPet');
    const id = petId ?? (select.value === '' ? null : Number(select.value));
    if (id === null || !Number.isInteger(id) || id <= 0) {
      this.petAtualId = null;
      this.renderizarHistorico([]);
      return;
    }
    this.petAtualId = id;

    const sequencia = this.sequenciaCarregamento + 1;
    this.sequenciaCarregamento = sequencia;
    const corpo = obrigatorio<HTMLTableSectionElement>('#tbProntuario');
    corpo.setAttribute('aria-busy', 'true');
    corpo.replaceChildren(linhaMensagem('Carregando o histórico do pet…', COLUNAS_HISTORICO));

    try {
      if (!this.petsCarregados) {
        this.preencherSelectPets(await window.api.listarPets());
        select.value = String(id);
      }
      const consultas = await window.api.prontuarioListarPet(id);
      if (sequencia === this.sequenciaCarregamento) this.renderizarHistorico(consultas);
    } catch (erro) {
      if (sequencia === this.sequenciaCarregamento) {
        corpo.replaceChildren(
          linhaMensagem('Não foi possível carregar o prontuário.', COLUNAS_HISTORICO, 'text-center text-danger py-4')
        );
        mostrarToast(mensagemErro(erro), 'erro');
      }
    } finally {
      if (sequencia === this.sequenciaCarregamento) corpo.removeAttribute('aria-busy');
    }
  }

  /** Carrega dados iniciais quando já existe sessão autenticada. */
  async carregarSessao(): Promise<void> {
    if (!this.contexto.auth.temAcessoClinico()) return;
    if (!this.petsCarregados) this.preencherSelectPets(await window.api.listarPets());
    await this.carregar();
  }

  /** Limpa estado, seleção e mensagens ao sair. */
  limpar(): void {
    this.sequenciaCarregamento += 1;
    this.petsCarregados = false;
    this.petAtualId = null;

    const select = obrigatorio<HTMLSelectElement>('#prPet');
    select.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Selecione um pet…';
    select.append(placeholder);

    obrigatorio<HTMLTableSectionElement>('#tbProntuario').removeAttribute('aria-busy');
    this.limparFormulario();
    this.renderizarHistorico([]);
    obrigatorio<HTMLElement>('#prAvisoAtendente').hidden = true;
    obrigatorio<HTMLElement>('#prAreaClinica').hidden = true;
  }

  private podeGerenciar(consulta: ConsultaProntuario): boolean {
    const usuario = this.contexto.auth.obterUsuario();
    if (usuario === null) return false;
    if (usuario.role === 'ADMIN') return true;
    return usuario.role === 'VETERINARIO' && usuario.id === consulta.veterinarioId;
  }

  private aplicarPermissoes(): void {
    const aviso = obrigatorio<HTMLElement>('#prAvisoAtendente');
    const area = obrigatorio<HTMLElement>('#prAreaClinica');
    const acesso = this.contexto.auth.temAcessoClinico();

    aviso.hidden = acesso;
    area.hidden = !acesso;
    if (!acesso) {
      this.consultasVisiveis.clear();
      this.petAtualId = null;
    }
  }

  private linhaMensagem(texto: string, classe?: string): HTMLTableRowElement {
    return linhaMensagem(texto, COLUNAS_HISTORICO, classe);
  }

  private criarBotoesAcao(consulta: ConsultaProntuario): HTMLButtonElement[] {
    const usuario = this.contexto.auth.obterUsuario();
    if (usuario === null) return [];

    const papel: Role = usuario.role;
    if (papel === 'ATENDENTE' || !this.podeGerenciar(consulta)) return [];

    const botoes: HTMLButtonElement[] = [];
    if (consulta.status !== 'CANCELADA') {
      botoes.push(
        criarBotaoAcao('editar', consulta.id, 'Registrar/Editar prontuário', `Editar prontuário de ${consulta.pet.nome}`)
      );
    }
    if (STATUS_CONCLUIVEIS.some((status) => status === consulta.status)) {
      botoes.push(
        criarBotaoAcao(
          'concluir',
          consulta.id,
          'Concluir consulta',
          `Concluir consulta de ${consulta.pet.nome}`,
          'btn-outline-success'
        )
      );
    }
    return botoes;
  }

  private renderizarHistorico(consultas: ConsultaProntuario[]): void {
    this.consultasVisiveis = new Map(consultas.map((consulta) => [consulta.id, consulta]));

    const corpo = obrigatorio<HTMLTableSectionElement>('#tbProntuario');
    const resumo = obrigatorio<HTMLElement>('#prResumo');
    corpo.replaceChildren();
    resumo.hidden = consultas.length === 0;
    resumo.textContent =
      consultas.length === 0 ? '' : `${consultas.length} ${consultas.length === 1 ? 'consulta' : 'consultas'}`;

    if (consultas.length === 0) {
      const mensagem =
        this.petAtualId === null
          ? 'Selecione um pet para ver o histórico.'
          : 'Nenhuma consulta registrada para este pet.';
      corpo.append(this.linhaMensagem(mensagem));
      return;
    }

    for (const consulta of consultas) {
      const linha = document.createElement('tr');
      const crmv = consulta.veterinario.crmv?.trim();
      linha.append(
        criarCelula(formatarDataHora(consulta.dataHora), 'text-nowrap small'),
        criarCelula(consulta.motivo, 'text-break small'),
        criarCelula(`${consulta.veterinario.nome} — ${crmv ? crmv : 'CRMV não informado'}`, 'small'),
        criarCelula(textoOuTraco(consulta.diagnostico), 'text-break small'),
        criarCelula(textoOuTraco(consulta.prescricao), 'text-break small'),
        criarCelula(
          `${this.numeroOuTraco(consulta.pesoAferido, ' kg')} / ${this.numeroOuTraco(consulta.temperaturaC, ' °C')}`,
          'text-nowrap small'
        )
      );

      const celulaStatus = document.createElement('td');
      celulaStatus.append(
        criarBadge(
          ROTULOS_STATUS[consulta.status] ?? consulta.status,
          CLASSES_STATUS[consulta.status] ?? 'text-bg-secondary'
        )
      );
      linha.append(celulaStatus);

      const celulaAcoes = document.createElement('td');
      const botoes = this.criarBotoesAcao(consulta);
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

  private numeroOuTraco(valor: number | null | undefined, unidade: string): string {
    return valor === null || valor === undefined ? '—' : `${String(valor)}${unidade}`;
  }

  private limparFormulario(): void {
    const formulario = obrigatorio<HTMLFormElement>('#formProntuario');
    formulario.reset();
    limparValidacao(formulario);
    obrigatorio<HTMLElement>('#prFormTitulo').textContent = 'Registrar prontuário';
    setCarregando(obrigatorio<HTMLButtonElement>('#btnSalvarProntuario'), false);
  }

  private preencherFormulario(consulta: ConsultaProntuario): void {
    obrigatorio<HTMLInputElement>('#prConsultaId').value = String(consulta.id);
    obrigatorio<HTMLTextAreaElement>('#prExameClinico').value = consulta.exameClinico ?? '';
    obrigatorio<HTMLTextAreaElement>('#prDiagnostico').value = consulta.diagnostico ?? '';
    obrigatorio<HTMLTextAreaElement>('#prConduta').value = consulta.conduta ?? '';
    obrigatorio<HTMLTextAreaElement>('#prPrescricao').value = consulta.prescricao ?? '';
    obrigatorio<HTMLInputElement>('#prPeso').value =
      consulta.pesoAferido === null ? '' : String(consulta.pesoAferido);
    obrigatorio<HTMLInputElement>('#prTemperatura').value =
      consulta.temperaturaC === null ? '' : String(consulta.temperaturaC);
    obrigatorio<HTMLElement>('#prFormTitulo').textContent =
      `Editando prontuário — ${consulta.pet.nome}, ${formatarDataHora(consulta.dataHora)}`;
    limparValidacao(obrigatorio<HTMLFormElement>('#formProntuario'));
  }

  private destacarLinha(botao: HTMLButtonElement): void {
    const corpo = obrigatorio<HTMLTableSectionElement>('#tbProntuario');
    corpo.querySelectorAll('tr.table-active').forEach((linha) => linha.classList.remove('table-active'));
    botao.closest('tr')?.classList.add('table-active');
  }

  private validarTexto(campo: HTMLTextAreaElement, descricao: string): boolean {
    const tamanho = campo.value.trim().length;
    return exigir(
      campo,
      tamanho >= PRONTUARIO_TEXTO_MINIMO && tamanho <= PRONTUARIO_TEXTO_MAXIMO,
      `Informe ${descricao} (de ${PRONTUARIO_TEXTO_MINIMO} a ${PRONTUARIO_TEXTO_MAXIMO} caracteres).`
    );
  }

  private lerNumeroOpcional(
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

  private async recarregarDepoisDeAlterar(petId: number): Promise<void> {
    if (this.contexto.auth.obterUsuario() === null) return;
    await Promise.all([this.contexto.recarregarAgenda(), this.carregar(petId)]);
  }

  private async salvar(evento: Event): Promise<void> {
    evento.preventDefault();
    const formulario = obrigatorio<HTMLFormElement>('#formProntuario');
    const botao = obrigatorio<HTMLButtonElement>('#btnSalvarProntuario');
    limparValidacao(formulario);

    const id = Number(obrigatorio<HTMLInputElement>('#prConsultaId').value);
    const consulta = Number.isInteger(id) && id > 0 ? this.consultasVisiveis.get(id) : undefined;
    if (consulta === undefined || !this.podeGerenciar(consulta)) {
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
    const prescricao = obrigatorio<HTMLTextAreaElement>('#prPrescricao');
    const pesoCampo = obrigatorio<HTMLInputElement>('#prPeso');
    const temperaturaCampo = obrigatorio<HTMLInputElement>('#prTemperatura');

    const textosValidos = [
      this.validarTexto(exame, 'o exame clínico'),
      this.validarTexto(diagnostico, 'o diagnóstico'),
      this.validarTexto(conduta, 'a conduta'),
      this.validarTexto(prescricao, 'a prescrição'),
    ];
    const peso = this.lerNumeroOpcional(pesoCampo, (valor) => valor > 0, 'Informe um peso maior que zero (em kg).');
    const temperatura = this.lerNumeroOpcional(
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
      prescricao: prescricao.value.trim(),
      pesoAferido: peso,
      temperaturaC: temperatura,
    };

    setCarregando(botao, true, 'Salvando…');
    try {
      await window.api.prontuarioSalvar(dados);
      mostrarToast('Prontuário salvo. Conclua a consulta separadamente quando o atendimento terminar.', 'sucesso');
      await this.recarregarDepoisDeAlterar(consulta.petId);
    } catch (erro) {
      mostrarToast(mensagemErro(erro), 'erro');
    } finally {
      setCarregando(botao, false);
    }
  }

  private confirmarConclusao(consulta: ConsultaProntuario): Promise<boolean> {
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

  private async concluir(consulta: ConsultaProntuario, botao: HTMLButtonElement): Promise<void> {
    if (!(await this.confirmarConclusao(consulta))) return;

    setCarregando(botao, true, 'Concluindo…');
    try {
      await window.api.consultasConcluir(consulta.id);
      mostrarToast('Consulta concluída com sucesso. O prontuário permanece disponível para edição.', 'sucesso');
      await this.recarregarDepoisDeAlterar(consulta.petId);
    } catch (erro) {
      mostrarToast(mensagemErro(erro), 'erro');
    } finally {
      setCarregando(botao, false);
    }
  }

  private configurarEventos(): void {
    obrigatorio<HTMLButtonElement>('#abaProntuario-tab').addEventListener('shown.bs.tab', () => {
      if (this.consultasVisiveis.size === 0) void this.carregar();
    });
    obrigatorio<HTMLSelectElement>('#prPet').addEventListener('change', () => {
      this.petAtualId = null;
      this.limparFormulario();
      void this.carregar();
    });

    obrigatorio<HTMLFormElement>('#formProntuario').addEventListener('submit', (evento) => {
      void this.salvar(evento);
    });

    obrigatorio<HTMLTableSectionElement>('#tbProntuario').addEventListener('click', (evento) => {
      const alvo = evento.target;
      if (!(alvo instanceof Element)) return;
      const botao = alvo.closest<HTMLButtonElement>('button[data-acao][data-id]');
      if (botao === null || botao.disabled) return;

      const id = Number(botao.dataset.id);
      const consulta = Number.isInteger(id) && id > 0 ? this.consultasVisiveis.get(id) : undefined;
      if (consulta === undefined || !this.podeGerenciar(consulta)) return;

      if (botao.dataset.acao === 'editar') {
        this.preencherFormulario(consulta);
        this.destacarLinha(botao);
        obrigatorio<HTMLTextAreaElement>('#prExameClinico').focus();
      } else if (botao.dataset.acao === 'concluir') {
        void this.concluir(consulta, botao);
      }
    });
  }
}
