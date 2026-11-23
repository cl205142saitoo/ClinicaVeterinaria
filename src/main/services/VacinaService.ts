import { dataCivilClinica } from '../../shared/datas';
import { ErroAplicacao } from '../../shared/errors';
import type {
  DadosAtualizacaoVacina,
  DadosInativacao,
  DadosRegistroVacina,
  RegistroVacina,
  Usuario,
} from '../../shared/types';
import { ehIdPositivo } from '../../shared/validators';
import type {
  DadosAtualizacaoVacinaBanco,
  DadosCriacaoVacina,
  RegistroVacinaPersistido,
  VacinaRepositorio,
} from '../repositories/VacinaRepository';

function paraRegistro(registro: RegistroVacinaPersistido): RegistroVacina {
  return {
    id: registro.id,
    petId: registro.petId,
    veterinarioId: registro.veterinarioId,
    consultaId: registro.consultaId,
    vacina: registro.vacina,
    fabricante: registro.fabricante,
    lote: registro.lote,
    validade: registro.validade.toISOString().slice(0, 10),
    aplicadaEm: registro.aplicadaEm.toISOString(),
    dose: registro.dose,
    proximaDose:
      registro.proximaDose === null ? null : registro.proximaDose.toISOString().slice(0, 10),
    reacao: registro.reacao,
    observacoes: registro.observacoes,
    registradoPorId: registro.registradoPorId,
    registradoEm: registro.registradoEm.toISOString(),
    estornado: registro.estornado,
    estornadoEm: registro.estornadoEm === null ? null : registro.estornadoEm.toISOString(),
    motivoEstorno: registro.motivoEstorno,
    veterinario: {
      id: registro.veterinario.id,
      nome: registro.veterinario.nome,
      crmv: registro.veterinario.crmv,
    },
  };
}

function exigirAcessoClinico(usuario: Usuario): void {
  if (usuario.role === 'ADMIN' || usuario.role === 'VETERINARIO') return;
  if (usuario.role === 'ATENDENTE') {
    throw new ErroAplicacao(
      'Somente o veterinário responsável ou um administrador pode acessar a carteira de vacinação.'
    );
  }
  throw new ErroAplicacao('Perfil de acesso inválido. Procure o administrador.');
}

/** Texto livre vazio não é informação clínica: persiste como `null`. */
function opcional(valor: string | null | undefined): string | null {
  if (valor === undefined || valor === null) return null;
  const limpo = valor.trim();
  return limpo === '' ? null : limpo;
}

interface DatasValidacao {
  registradoEm: Date;
  aplicadaEm: Date;
  dataAplicacao: string;
  proximaDose: string | null;
}

export class VacinaService {
  constructor(
    private readonly repo: VacinaRepositorio,
    private readonly agora: () => Date = () => new Date()
  ) {}

  async listarPet(petId: number, usuario: Usuario): Promise<RegistroVacina[]> {
    exigirAcessoClinico(usuario);
    const veterinarioId = usuario.role === 'VETERINARIO' ? usuario.id : undefined;
    const registros = await this.repo.listarPorPet(petId, veterinarioId);
    return registros.map(paraRegistro);
  }

  async registrar(dados: DadosRegistroVacina, usuario: Usuario): Promise<RegistroVacina> {
    exigirAcessoClinico(usuario);
    const aplicadorId = await this.resolverAplicador(dados.veterinarioId, usuario);

    const datas = this.validarDatas(dados);
    if (!(await this.repo.petExiste(dados.petId))) {
      throw new ErroAplicacao('Pet não encontrado. Confira o pet selecionado.');
    }

    const consultaId = dados.consultaId ?? null;
    if (consultaId !== null) {
      await this.verificarConsulta(consultaId, dados.petId, aplicadorId);
    }

    const registro = await this.repo.criar({
      petId: dados.petId,
      veterinarioId: aplicadorId,
      consultaId,
      vacina: dados.vacina.trim(),
      fabricante: dados.fabricante.trim(),
      lote: dados.lote.trim(),
      validade: dados.validade,
      aplicadaEm: datas.aplicadaEm.toISOString(),
      dose: dados.dose.trim(),
      proximaDose: datas.proximaDose,
      reacao: opcional(dados.reacao),
      observacoes: opcional(dados.observacoes),
      registradoPorId: usuario.id,
      registradoEm: datas.registradoEm,
    });
    return paraRegistro(registro);
  }

  /** Corrige campos clínicos; pet e veterinário da aplicação ficam imutáveis. */
  async atualizar(dados: DadosAtualizacaoVacina, usuario: Usuario): Promise<RegistroVacina> {
    exigirAcessoClinico(usuario);
    const registro = await this.repo.buscarPorId(dados.id);
    if (registro === null) {
      throw new ErroAplicacao('Registro de vacina não encontrado.');
    }
    this.verificarResponsavel(registro, usuario, 'editar');
    if (registro.estornado) {
      throw new ErroAplicacao('Não é possível editar um registro de vacina estornado.');
    }

    const datas = this.validarDatas(dados);
    const consultaId = dados.consultaId ?? null;
    if (consultaId !== null) {
      await this.verificarConsulta(consultaId, registro.petId, registro.veterinarioId);
    }

    const atualizado = await this.repo.atualizar({
      id: dados.id,
      consultaId,
      vacina: dados.vacina.trim(),
      fabricante: dados.fabricante.trim(),
      lote: dados.lote.trim(),
      validade: dados.validade,
      aplicadaEm: datas.aplicadaEm.toISOString(),
      dose: dados.dose.trim(),
      proximaDose: datas.proximaDose,
      reacao: opcional(dados.reacao),
      observacoes: opcional(dados.observacoes),
    } satisfies DadosAtualizacaoVacinaBanco);
    return paraRegistro(atualizado);
  }

  /** Estorno é exclusão lógica: a prova sanitária original é preservada. */
  async estornar(dados: DadosInativacao, usuario: Usuario): Promise<RegistroVacina> {
    exigirAcessoClinico(usuario);
    const registro = await this.repo.buscarPorId(dados.id);
    if (registro === null) {
      throw new ErroAplicacao('Registro de vacina não encontrado.');
    }
    this.verificarResponsavel(registro, usuario, 'estornar');
    if (registro.estornado) {
      throw new ErroAplicacao('Este registro de vacina já foi estornado.');
    }
    const atualizado = await this.repo.estornar(
      dados.id,
      usuario.id,
      this.agora(),
      dados.motivo
    );
    if (atualizado === null) {
      throw new ErroAplicacao('Não foi possível estornar o registro de vacina. Tente novamente.');
    }
    return paraRegistro(atualizado);
  }

  private validarDatas(dados: DadosRegistroVacina): DatasValidacao {
    const registradoEm = this.agora();
    const aplicadaEm = new Date(dados.aplicadaEm);
    if (aplicadaEm.getTime() > registradoEm.getTime()) {
      throw new ErroAplicacao('A data de aplicação da vacina não pode estar no futuro.');
    }

    // Data civil da clínica: após as 21h o ISO UTC já aponta para o dia seguinte.
    const dataAplicacao = dataCivilClinica(aplicadaEm);
    if (dados.validade < dataAplicacao) {
      throw new ErroAplicacao('A validade da vacina não pode ser anterior à data de aplicação.');
    }
    const proximaDose = opcional(dados.proximaDose);
    if (proximaDose !== null && proximaDose < dataAplicacao) {
      throw new ErroAplicacao('A próxima dose não pode ser anterior à data de aplicação.');
    }
    return { registradoEm, aplicadaEm, dataAplicacao, proximaDose };
  }

  private async resolverAplicador(
    veterinarioIdInformado: number | null | undefined,
    usuario: Usuario
  ): Promise<number> {
    if (usuario.role === 'VETERINARIO') return usuario.id;

    if (!ehIdPositivo(veterinarioIdInformado)) {
      throw new ErroAplicacao('Informe o veterinário responsável pela aplicação da vacina.');
    }
    const veterinario = await this.repo.buscarVeterinarioAtivo(veterinarioIdInformado);
    if (!veterinario) {
      throw new ErroAplicacao('Veterinário não encontrado, inativo ou sem perfil de veterinário.');
    }
    return veterinario.id;
  }

  private verificarResponsavel(registro: RegistroVacinaPersistido, usuario: Usuario, acao: string): void {
    if (usuario.role === 'VETERINARIO' && registro.veterinarioId !== usuario.id) {
      throw new ErroAplicacao(`Você só pode ${acao} registros pelos quais é responsável.`);
    }
  }

  private async verificarConsulta(
    consultaId: number,
    petId: number,
    aplicadorId: number
  ): Promise<void> {
    const consulta = await this.repo.buscarConsulta(consultaId);
    if (!consulta) {
      throw new ErroAplicacao('Consulta vinculada não encontrada.');
    }
    if (consulta.petId !== petId) {
      throw new ErroAplicacao('A consulta vinculada pertence a outro pet.');
    }
    if (consulta.status === 'CANCELADA') {
      throw new ErroAplicacao('Não é possível vincular a vacina a uma consulta cancelada.');
    }
    if (consulta.veterinarioId !== aplicadorId) {
      throw new ErroAplicacao('A consulta vinculada pertence a outro veterinário.');
    }
  }
}
