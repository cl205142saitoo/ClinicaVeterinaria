import type { Usuario as UsuarioBanco } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { CUSTO_HASH_SENHA } from '../../shared/constants';
import { ErroAplicacao } from '../../shared/errors';
import type { DadosRegistro, Usuario } from '../../shared/types';
import { ehRole } from '../../shared/validators';
import { UsuarioRepository } from '../repositories/UsuarioRepository';

export class AuthService {
  private repo = new UsuarioRepository();

  async registrar(dados: DadosRegistro): Promise<Usuario> {
    if (!dados.nome.trim() || !dados.email.trim() || !dados.senha) {
      throw new ErroAplicacao('Preencha todos os campos obrigatórios.');
    }

    const existente = await this.repo.buscarPorEmail(dados.email);
    if (existente) {
      throw new ErroAplicacao('Já existe um usuário cadastrado com este e-mail.');
    }

    const senhaHash = await bcrypt.hash(dados.senha, CUSTO_HASH_SENHA);
    const novo = await this.repo.criar({
      nome: dados.nome.trim(),
      email: dados.email.trim(),
      senhaHash,
      // Cadastro público nunca recebe perfil elevado: o backend decide o role.
      role: 'ATENDENTE',
    });
    return this.paraUsuario(novo);
  }

  async login(email: string, senha: string): Promise<Usuario> {
    const usuario = await this.repo.buscarPorEmail(email.trim());
    if (!usuario || !usuario.ativo) {
      throw new ErroAplicacao('Usuário não encontrado ou desativado.');
    }

    const senhaCorreta = await bcrypt.compare(senha, usuario.senhaHash);
    if (!senhaCorreta) {
      throw new ErroAplicacao('Senha incorreta.');
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
      role: usuario.role,
      ativo: usuario.ativo,
      criadoEm: usuario.criadoEm,
    };
  }
}
