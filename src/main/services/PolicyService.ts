import { ErroAplicacao } from '../../shared/errors';
import type { Usuario } from '../../shared/types';
import { UsuarioRepository } from '../repositories/UsuarioRepository';
import type { SessaoService } from './SessaoService';

/**
 * Ponto único da política de acesso do domínio.
 *
 * Handlers e services chamam este objeto em vez de repetir `if (role === ...)`
 * espalhados. `exigirAutenticado()` é síncrono (compatível com os handlers
 * atuais); `exigirAutenticadoVerificado()` consulta adicionalmente o banco para
 * não confiar numa sessão cuja conta foi desativada depois do login.
 */
export class PolicyService {
  constructor(
    private readonly sessao: SessaoService,
    private readonly usuarios: UsuarioRepository = new UsuarioRepository()
  ) {}

  exigirAutenticado(): Usuario {
    return this.sessao.exigirAutenticado();
  }

  async exigirAutenticadoVerificado(): Promise<Usuario> {
    const usuario = this.sessao.exigirAutenticado();
    const atual = await this.usuarios.buscarPorId(usuario.id);
    if (!atual || !atual.ativo) {
      this.sessao.encerrar();
      throw new ErroAplicacao('Esta conta foi desativada. Entre com outra conta.');
    }
    return usuario;
  }

  exigirPerfilConhecido(usuario: Usuario): void {
    if (usuario.role !== 'ADMIN' && usuario.role !== 'VETERINARIO' && usuario.role !== 'ATENDENTE') {
      throw new ErroAplicacao('Perfil de acesso inválido. Procure o administrador.');
    }
  }

  exigirAdmin(usuario: Usuario): void {
    this.exigirPerfilConhecido(usuario);
    if (usuario.role !== 'ADMIN') {
      throw new ErroAplicacao('Esta ação exige perfil de administrador.');
    }
  }

  /** Prontuário, vacinação e anexos: ATENDENTE fica de fora inclusive de metadados. */
  exigirAcessoClinico(usuario: Usuario, acao: string): void {
    this.exigirPerfilConhecido(usuario);
    if (usuario.role === 'ATENDENTE') {
      throw new ErroAplicacao(`Somente veterinário responsável ou administrador pode ${acao}.`);
    }
  }

  exigirAcessoAnexos(usuario: Usuario): void {
    this.exigirAcessoClinico(usuario, 'trabalhar com anexos clínicos');
  }

  /** ADMIN vê tudo; VET só o que assinou; ATENDENTE já foi barrado antes. */
  exigirResponsavel(usuario: Usuario, responsavelId: number, acao: string): void {
    this.exigirPerfilConhecido(usuario);
    if (usuario.role === 'VETERINARIO' && responsavelId !== usuario.id) {
      throw new ErroAplicacao(`Você só pode ${acao} registros pelos quais é responsável.`);
    }
  }

  veterinarioVisivel(usuario: Usuario): number | undefined {
    this.exigirPerfilConhecido(usuario);
    return usuario.role === 'VETERINARIO' ? usuario.id : undefined;
  }
}
