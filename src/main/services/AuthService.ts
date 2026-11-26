import type { Usuario as UsuarioBanco } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { ErroAplicacao } from '../../shared/errors';
import type { Usuario } from '../../shared/types';
import { ehRole } from '../../shared/validators';
import { UsuarioRepository } from '../repositories/UsuarioRepository';

export class AuthService {
  private repo = new UsuarioRepository();

  async login(email: string, senha: string): Promise<Usuario> {
    const usuario = await this.repo.buscarPorEmail(email.trim());
    // A mesma mensagem para conta inexistente, desativada ou senha errada evita
    // revelar quais e-mails estão cadastrados (enumeração de contas).
    const mensagemInvalida = 'E-mail ou senha inválidos.';
    if (!usuario || !usuario.ativo) {
      throw new ErroAplicacao(mensagemInvalida);
    }

    const senhaCorreta = await bcrypt.compare(senha, usuario.senhaHash);
    if (!senhaCorreta) {
      throw new ErroAplicacao(mensagemInvalida);
    }

    return this.paraUsuario(usuario);
  }

  /** Constrói o DTO explicitamente para impedir que `senhaHash` escape. */
  private paraUsuario(usuario: UsuarioBanco): Usuario {
    if (!ehRole(usuario.role)) {
      throw new ErroAplicacao('Perfil de acesso inválido. Procure o administrador.');
    }
    return {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      crmv: usuario.crmv,
      rg: usuario.rg,
      role: usuario.role,
      ativo: usuario.ativo,
      criadoEm: usuario.criadoEm,
    };
  }
}
