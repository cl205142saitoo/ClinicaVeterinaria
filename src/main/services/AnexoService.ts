import { ANEXO_MOTIVO_MAXIMO } from '../../shared/constants';
import { dataCivilClinica } from '../../shared/datas';
import { ErroAplicacao } from '../../shared/errors';
import type {
  AnexoClinico,
  DadosAtualizacaoAnexo,
  DadosRegistroAnexo,
  Usuario,
} from '../../shared/types';
import { ehIdPositivo } from '../../shared/validators';
import type {
  AnexoPersistido,
  AnexoRepositorio,
} from '../repositories/AnexoRepository';

/** ATENDENTE não manipula dado clínico, nem sequer abre o diálogo de arquivo. */
export function exigirAcessoAnexos(usuario: Usuario): void {
  if (usuario.role === 'ADMIN' || usuario.role === 'VETERINARIO') return;
  if (usuario.role === 'ATENDENTE') {
    throw new ErroAplicacao(
      'Somente o veterinário responsável ou um administrador pode acessar os anexos clínicos.'
    );
  }
  throw new ErroAplicacao('Perfil de acesso inválido. Procure o administrador.');
}

function paraDto(registro: AnexoPersistido): AnexoClinico {
  return {
    id: registro.id,
    petId: registro.petId,
    consultaId: registro.consultaId,
    responsavelId: registro.responsavelId,
    descricao: registro.descricao,
    categoria: registro.categoria,
    dataDocumento: registro.dataDocumento.toISOString().slice(0, 10),
    nomeOriginal: registro.nomeOriginal,
    mimeType: registro.mimeType,
    tamanhoBytes: registro.tamanhoBytes,
    checksumSha256: registro.checksumSha256,
    registradoPorId: registro.registradoPorId,
    registradoEm: registro.registradoEm.toISOString(),
    atualizadoEm: registro.atualizadoEm.toISOString(),
    inativo: registro.inativo,
    inativadoPorId: registro.inativadoPorId,
    inativadoEm: registro.inativadoEm === null ? null : registro.inativadoEm.toISOString(),
    motivoInativacao: registro.motivoInativacao,
    responsavel: {
      id: registro.responsavel.id,
      nome: registro.responsavel.nome,
      crmv: registro.responsavel.crmv,
    },
  };
}

export class AnexoService {
  constructor(
    private readonly repo: AnexoRepositorio,
    private readonly agora: () => Date = () => new Date()
  ) {}

  async listarPet(petId: number, usuario: Usuario): Promise<AnexoClinico[]> {
    exigirAcessoAnexos(usuario);
    const responsavelId = usuario.role === 'VETERINARIO' ? usuario.id : undefined;
    const registros = await this.repo.listarPorPet(petId, responsavelId);
    return registros.map(paraDto);
  }

  async registrar(
    dados: DadosRegistroAnexo,
    usuario: Usuario,
    arquivo: {
      nomeArquivoGerado: string;
      mimeType: string;
      tamanhoBytes: number;
      checksumSha256: string;
      nomeOriginal: string;
    }
  ): Promise<AnexoClinico> {
    exigirAcessoAnexos(usuario);
    const responsavelId = await this.resolverResponsavel(dados.responsavelId, usuario);

    if (!(await this.repo.petExiste(dados.petId))) {
      throw new ErroAplicacao('Pet não encontrado. Confira o pet selecionado.');
    }

    // Data civil da clínica: após as 21h o ISO UTC já aponta para o dia seguinte.
    const hoje = dataCivilClinica(this.agora());
    if (dados.dataDocumento > hoje) {
      throw new ErroAplicacao('A data do documento não pode estar no futuro.');
    }

    const consultaId = dados.consultaId ?? null;
    if (consultaId !== null) {
      await this.verificarConsulta(consultaId, dados.petId, responsavelId);
    }

    const registro = await this.repo.criar({
      petId: dados.petId,
      consultaId,
      responsavelId,
      descricao: dados.descricao.trim(),
      categoria: dados.categoria,
      dataDocumento: dados.dataDocumento,
      nomeOriginal: arquivo.nomeOriginal,
      nomeArquivoGerado: arquivo.nomeArquivoGerado,
      mimeType: arquivo.mimeType,
      tamanhoBytes: arquivo.tamanhoBytes,
      checksumSha256: arquivo.checksumSha256,
      registradoPorId: usuario.id,
      registradoEm: this.agora(),
    });
    return paraDto(registro);
  }

  /** Uso exclusivo do handler de abertura: o nome do arquivo nunca cruza o IPC. */
  async buscarParaAbertura(
    id: number,
    usuario: Usuario
  ): Promise<{ id: number; nomeArquivoGerado: string; inativo: boolean }> {
    exigirAcessoAnexos(usuario);
    const registro = await this.repo.buscarPorId(id);
    if (registro === null) {
      throw new ErroAplicacao('Anexo não encontrado.');
    }
    this.verificarResponsavel(registro, usuario);
    if (registro.inativo) {
      throw new ErroAplicacao('Este anexo foi inativado e não pode ser aberto.');
    }
    return {
      id: registro.id,
      nomeArquivoGerado: registro.nomeArquivoGerado,
      inativo: registro.inativo,
    };
  }

  /** Metadados são editáveis; o arquivo e seu responsável nunca mudam. */
  async atualizarMetadados(
    dados: DadosAtualizacaoAnexo,
    usuario: Usuario
  ): Promise<AnexoClinico> {
    exigirAcessoAnexos(usuario);
    const registro = await this.repo.buscarPorId(dados.id);
    if (registro === null) {
      throw new ErroAplicacao('Anexo não encontrado.');
    }
    this.verificarResponsavel(registro, usuario);
    if (registro.inativo) {
      throw new ErroAplicacao('Este anexo foi inativado e não pode ser editado.');
    }

    const hoje = dataCivilClinica(this.agora());
    if (dados.dataDocumento > hoje) {
      throw new ErroAplicacao('A data do documento não pode estar no futuro.');
    }

    const atualizado = await this.repo.atualizarMetadados(dados.id, {
      descricao: dados.descricao,
      categoria: dados.categoria,
      dataDocumento: dados.dataDocumento,
    });
    return paraDto(atualizado);
  }

  async inativar(id: number, motivo: string, usuario: Usuario): Promise<AnexoClinico> {
    exigirAcessoAnexos(usuario);
    const motivoLimpo = motivo.trim();
    if (motivoLimpo.length === 0) {
      throw new ErroAplicacao('Informe o motivo da inativação.');
    }
    if (motivoLimpo.length > ANEXO_MOTIVO_MAXIMO) {
      throw new ErroAplicacao('O motivo da inativação é muito longo.');
    }

    const registro = await this.repo.buscarPorId(id);
    if (registro === null) {
      throw new ErroAplicacao('Anexo não encontrado.');
    }
    this.verificarResponsavel(registro, usuario);
    if (registro.inativo) {
      throw new ErroAplicacao('Este anexo já está inativado.');
    }

    const atualizado = await this.repo.inativar(id, usuario.id, this.agora(), motivoLimpo);
    return paraDto(atualizado);
  }

  private async resolverResponsavel(
    responsavelIdInformado: number | null | undefined,
    usuario: Usuario
  ): Promise<number> {
    if (usuario.role === 'VETERINARIO') return usuario.id;

    if (!ehIdPositivo(responsavelIdInformado)) {
      throw new ErroAplicacao('Informe o veterinário responsável pelo anexo.');
    }
    const veterinario = await this.repo.buscarVeterinarioAtivo(responsavelIdInformado);
    if (!veterinario) {
      throw new ErroAplicacao('Veterinário não encontrado, inativo ou sem perfil de veterinário.');
    }
    return veterinario.id;
  }

  private verificarResponsavel(registro: AnexoPersistido, usuario: Usuario): void {
    if (usuario.role === 'VETERINARIO' && registro.responsavelId !== usuario.id) {
      throw new ErroAplicacao('Você só pode acessar anexos sob sua responsabilidade.');
    }
  }

  private async verificarConsulta(
    consultaId: number,
    petId: number,
    responsavelId: number
  ): Promise<void> {
    const consulta = await this.repo.buscarConsulta(consultaId);
    if (!consulta) {
      throw new ErroAplicacao('Consulta vinculada não encontrada.');
    }
    if (consulta.petId !== petId) {
      throw new ErroAplicacao('A consulta vinculada pertence a outro pet.');
    }
    if (consulta.status === 'CANCELADA') {
      throw new ErroAplicacao('Não é possível vincular o anexo a uma consulta cancelada.');
    }
    if (consulta.veterinarioId !== responsavelId) {
      throw new ErroAplicacao('A consulta vinculada pertence a outro veterinário.');
    }
  }
}
