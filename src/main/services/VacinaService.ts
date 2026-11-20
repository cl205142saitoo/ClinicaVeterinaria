import { dataCivilClinica } from '../../shared/datas';
import { ErroAplicacao } from '../../shared/errors';
import type { DadosRegistroVacina, RegistroVacina, Usuario } from '../../shared/types';
import { ehIdPositivo } from '../../shared/validators';
import type {
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
      aplicadaEm: dados.aplicadaEm,
      dose: dados.dose.trim(),
      proximaDose,
      reacao: opcional(dados.reacao),
      observacoes: opcional(dados.observacoes),
      registradoPorId: usuario.id,
      registradoEm,
    });
    return paraRegistro(registro);
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
