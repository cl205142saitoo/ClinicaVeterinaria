import { ErroAplicacao } from '../../shared/errors';
import type { Usuario } from '../../shared/types';

/** Sessão em memória do processo principal: some quando o app encerra. */
export class SessaoService {
  private usuario: Usuario | null = null;

  iniciar(usuario: Usuario): void {
    this.usuario = usuario;
  }

  encerrar(): void {
    this.usuario = null;
  }

  obter(): Usuario | null {
    return this.usuario;
  }

  exigirAutenticado(): Usuario {
    if (!this.usuario) {
      throw new ErroAplicacao('É necessário entrar com uma conta para realizar esta ação.');
    }
    return this.usuario;
  }

  exigirAdmin(): Usuario {
    const usuario = this.usuario;
    if (!usuario || usuario.role !== 'ADMIN') {
      throw new ErroAplicacao('Esta ação exige perfil de administrador. Entre com uma conta ADMIN.');
    }
    return usuario;
  }
}
