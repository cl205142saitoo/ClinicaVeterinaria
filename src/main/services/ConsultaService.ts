import { DURACAO_PADRAO_CONSULTA_MINUTOS } from '../../shared/constants';
import { ErroAplicacao } from '../../shared/errors';
import type {
  ConsultaAgenda,
  ConsultaProntuario,
  DadosConsulta,
  DadosProntuario,
  FiltroAgenda,
  Usuario,
  VeterinarioResumo,
} from '../../shared/types';
import {
  ehDuracaoMinutos,
  ehStatusCancelavel,
  ehStatusConcluivel,
} from '../../shared/validators';
import type {
  ConsultaRepositorio,
  RegistroAgenda,
  RegistroConflito,
  RegistroConsulta,
} from '../repositories/ConsultaRepository';

const MILISSEGUNDOS_POR_MINUTO = 60_000;

/** Nunca inclui diagnóstico, exame, conduta, peso ou temperatura. */
function paraAgenda(registro: RegistroAgenda): ConsultaAgenda {
  return {
    id: registro.id,
    dataHora: registro.dataHora.toISOString(),
    duracaoMinutos: registro.duracaoMinutos,
    motivo: registro.motivo,
    status: registro.status,
    petId: registro.petId,
    veterinarioId: registro.veterinarioId,
    pet: {
      id: registro.pet.id,
      nome: registro.pet.nome,
      clienteNome: registro.pet.cliente.nome,
    },
    veterinario: {
      id: registro.veterinario.id,
      nome: registro.veterinario.nome,
      crmv: registro.veterinario.crmv,
    },
  };
}

function paraProntuario(registro: RegistroConsulta): ConsultaProntuario {
  return {
    ...paraAgenda(registro),
    diagnostico: registro.diagnostico,
    exameClinico: registro.exameClinico,
    conduta: registro.conduta,
    pesoAferido: registro.pesoAferido,
    temperaturaC: registro.temperaturaC,
  };
}

function exigirPerfilConhecido(usuario: Usuario): void {
  if (usuario.role !== 'ADMIN' && usuario.role !== 'VETERINARIO' && usuario.role !== 'ATENDENTE') {
    throw new ErroAplicacao('Perfil de acesso inválido. Procure o administrador.');
  }
}

function veterinarioVisivel(usuario: Usuario): number | undefined {
  switch (usuario.role) {
    case 'ADMIN':
    case 'ATENDENTE':
      return undefined;
    case 'VETERINARIO':
      return usuario.id;
    default:
      throw new ErroAplicacao('Perfil de acesso inválido. Procure o administrador.');
  }
}

function exigirResponsavel(registro: RegistroAgenda, usuario: Usuario, acao: string): void {
  if (usuario.role === 'VETERINARIO' && registro.veterinarioId !== usuario.id) {
    throw new ErroAplicacao(`Você só pode ${acao} consultas pelas quais é responsável.`);
  }
}

export class ConsultaService {
  constructor(
    private readonly repo: ConsultaRepositorio,
    private readonly agora: () => Date = () => new Date()
  ) {}

  async listar(filtro: FiltroAgenda, usuario: Usuario): Promise<ConsultaAgenda[]> {
    exigirPerfilConhecido(usuario);
    const registros = await this.repo.listar({
      de: filtro.de === undefined ? undefined : new Date(filtro.de),
      ate: filtro.ate === undefined ? undefined : new Date(filtro.ate),
      veterinarioId: veterinarioVisivel(usuario),
    });
    return registros.map(paraAgenda);
  }

  async criar(dados: DadosConsulta, usuario: Usuario): Promise<ConsultaAgenda> {
    exigirPerfilConhecido(usuario);
    const veterinarioId = this.veterinarioDaCriacao(dados.veterinarioId, usuario);

    // O ISO enviado pelo renderer já é um instante em UTC: basta comparar
    // timestamps, sem inferir o fuso local da clínica.
    const inicio = new Date(dados.dataHora);
    if (inicio.getTime() <= this.agora().getTime()) {
      throw new ErroAplicacao('A data e o horário da consulta devem estar no futuro.');
    }

    const duracao = DURACAO_PADRAO_CONSULTA_MINUTOS;
    const fim = new Date(inicio.getTime() + duracao * MILISSEGUNDOS_POR_MINUTO);

    // Travamento de pet/veterinário + checagem + insert na mesma transação:
    // duas criações concorrentes não podem ver a agenda livre ao mesmo tempo.
    const registro = await this.repo.transacao(async (tx) => {
      await tx.bloquearPetEVeterinario(dados.petId, veterinarioId);

      const [petExiste, veterinario] = await Promise.all([
        tx.petExiste(dados.petId),
        tx.buscarVeterinarioAtivo(veterinarioId),
      ]);
      if (!petExiste) {
        throw new ErroAplicacao('Pet não encontrado. Confira o pet selecionado.');
      }
      if (!veterinario) {
        throw new ErroAplicacao('Veterinário não encontrado, inativo ou sem perfil de veterinário.');
      }

      await this.verificarDisponibilidade(veterinarioId, dados.petId, inicio, fim, tx);
      return tx.criar({
        petId: dados.petId,
        veterinarioId,
        dataHora: inicio,
        motivo: dados.motivo.trim(),
        criadoPorId: usuario.id,
      });
    });
    return paraAgenda(registro);
  }

  /**
   * Janela `[inicio, fim)` com duração persistida (padrão de 60 min).
   * Duas janelas se intersectam quando `inicio < fimExistente` e
   * `fim > inicioExistente`; uma consulta que termina exatamente quando a
   * outra começa não é conflito.
   *
   * Limitação da Etapa 5: cirurgias e exames ainda não bloqueiam a agenda —
   * apenas consultas AGENDADA|CONFIRMADA entram nesta verificação.
   */
  async verificarDisponibilidade(
    veterinarioId: number,
    petId: number,
    inicio: Date,
    fim: Date,
    repo: ConsultaRepositorio = this.repo,
    ignorarConsultaId?: number
  ): Promise<void> {
    const [porVeterinario, porPet] = await Promise.all([
      repo.buscarConflitos({ veterinarioId }, inicio, fim, ignorarConsultaId),
      repo.buscarConflitos({ petId }, inicio, fim, ignorarConsultaId),
    ]);

    if (porVeterinario.some((conflito) => this.haIntersecao(conflito, inicio, fim))) {
      throw new ErroAplicacao(
        'Horário indisponível: este veterinário já possui consulta nesse período.'
      );
    }
    if (porPet.some((conflito) => this.haIntersecao(conflito, inicio, fim))) {
      throw new ErroAplicacao('Horário indisponível: este pet já possui consulta nesse período.');
    }
  }

  async cancelar(id: number, motivo: string, usuario: Usuario): Promise<ConsultaAgenda> {
    exigirPerfilConhecido(usuario);
    const registro = await this.repo.buscarPorId(id);
    if (!registro) {
      throw new ErroAplicacao('Consulta não encontrada.');
    }
    exigirResponsavel(registro, usuario, 'cancelar');

    if (!ehStatusCancelavel(registro.status)) {
      throw new ErroAplicacao(this.mensagemStatusInvalido(registro.status, 'cancelar'));
    }
    if (registro.diagnostico !== null && registro.diagnostico.trim() !== '') {
      throw new ErroAplicacao('Não é possível cancelar uma consulta com diagnóstico registrado.');
    }

    const motivoLimpo = motivo.trim();
    if (motivoLimpo.toLocaleLowerCase('pt-BR') === registro.motivo.trim().toLocaleLowerCase('pt-BR')) {
      throw new ErroAplicacao('Informe um motivo de cancelamento diferente da queixa original.');
    }

    const alterado = await this.repo.cancelar(id, {
      canceladoPorId: usuario.id,
      canceladoEm: this.agora(),
      motivoCancelamento: motivoLimpo,
    });
    if (!alterado) {
      throw new ErroAplicacao('Não foi possível cancelar a consulta. Tente novamente.');
    }
    const atualizado = await this.repo.buscarAgendaPorId(id);
    if (!atualizado) {
      throw new ErroAplicacao('Consulta não encontrada após o cancelamento.');
    }
    return paraAgenda(atualizado);
  }

  async concluir(id: number, usuario: Usuario): Promise<ConsultaAgenda> {
    exigirPerfilConhecido(usuario);
    if (usuario.role === 'ATENDENTE') {
      throw new ErroAplicacao(
        'Somente o veterinário responsável ou um administrador pode concluir consultas.'
      );
    }

    const registro = await this.repo.buscarPorId(id);
    if (!registro) {
      throw new ErroAplicacao('Consulta não encontrada.');
    }
    exigirResponsavel(registro, usuario, 'concluir');

    if (!ehStatusConcluivel(registro.status)) {
      throw new ErroAplicacao(this.mensagemStatusInvalido(registro.status, 'concluir'));
    }

    const alterado = await this.repo.concluir(id, {
      concluidaPorId: usuario.id,
      concluidaEm: this.agora(),
    });
    if (!alterado) {
      throw new ErroAplicacao('Não foi possível concluir a consulta. Tente novamente.');
    }
    const atualizado = await this.repo.buscarAgendaPorId(id);
    if (!atualizado) {
      throw new ErroAplicacao('Consulta não encontrada após a conclusão.');
    }
    return paraAgenda(atualizado);
  }

  async salvarProntuario(dados: DadosProntuario, usuario: Usuario): Promise<ConsultaProntuario> {
    exigirPerfilConhecido(usuario);
    this.exigirAcessoClinico(usuario, 'salvar');

    const registro = await this.repo.buscarPorId(dados.consultaId);
    if (!registro) {
      throw new ErroAplicacao('Consulta não encontrada.');
    }
    exigirResponsavel(registro, usuario, 'salvar o prontuário de');
    if (registro.status === 'CANCELADA') {
      throw new ErroAplicacao('Não é possível salvar o prontuário de uma consulta cancelada.');
    }

    const alterado = await this.repo.salvarProntuario(dados.consultaId, {
      exameClinico: dados.exameClinico.trim(),
      diagnostico: dados.diagnostico.trim(),
      conduta: dados.conduta.trim(),
      pesoAferido: dados.pesoAferido ?? null,
      temperaturaC: dados.temperaturaC ?? null,
    });
    if (!alterado) {
      throw new ErroAplicacao('Não foi possível salvar o prontuário. Tente novamente.');
    }

    const atualizado = await this.repo.buscarPorId(dados.consultaId);
    if (!atualizado) {
      throw new ErroAplicacao('Consulta não encontrada após salvar o prontuário.');
    }
    return paraProntuario(atualizado);
  }

  async listarProntuarioPet(petId: number, usuario: Usuario): Promise<ConsultaProntuario[]> {
    exigirPerfilConhecido(usuario);
    this.exigirAcessoClinico(usuario, 'consultar');
    const registros = await this.repo.listarPorPet(petId, veterinarioVisivel(usuario));
    return registros.map(paraProntuario);
  }

  async listarVeterinarios(): Promise<VeterinarioResumo[]> {
    const veterinarios = await this.repo.listarVeterinarios();
    return veterinarios.map(({ id, nome, crmv }) => ({ id, nome, crmv }));
  }

  private exigirAcessoClinico(usuario: Usuario, acao: 'salvar' | 'consultar'): void {
    if (usuario.role !== 'ATENDENTE') return;
    throw new ErroAplicacao(
      acao === 'salvar'
        ? 'Somente o veterinário responsável ou um administrador pode salvar o prontuário.'
        : 'Atendentes não têm acesso ao conteúdo clínico do prontuário.'
    );
  }

  private veterinarioDaCriacao(veterinarioIdInformado: number, usuario: Usuario): number {
    if (usuario.role === 'VETERINARIO' && veterinarioIdInformado !== usuario.id) {
      throw new ErroAplicacao('Veterinários só podem agendar consultas para si mesmos.');
    }
    return veterinarioIdInformado;
  }

  private haIntersecao(conflito: RegistroConflito, inicio: Date, fim: Date): boolean {
    if (!ehStatusCancelavel(conflito.status)) return false;
    if (!ehDuracaoMinutos(conflito.duracaoMinutos)) {
      throw new ErroAplicacao('Duração de consulta inválida no cadastro. Procure o administrador.');
    }
    const inicioExistente = conflito.dataHora.getTime();
    const fimExistente = inicioExistente + conflito.duracaoMinutos * MILISSEGUNDOS_POR_MINUTO;
    return inicio.getTime() < fimExistente && fim.getTime() > inicioExistente;
  }

  private mensagemStatusInvalido(status: string, acao: 'cancelar' | 'concluir'): string {
    if (status === 'CANCELADA') {
      return acao === 'cancelar'
        ? 'Esta consulta já foi cancelada.'
        : 'Não é possível concluir uma consulta cancelada.';
    }
    if (status === 'CONCLUIDA') {
      return acao === 'concluir'
        ? 'Esta consulta já foi concluída.'
        : 'Não é possível cancelar uma consulta concluída.';
    }
    return `Não é possível ${acao} uma consulta com status ${status}.`;
  }
}
