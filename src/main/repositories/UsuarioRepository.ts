import type { Role } from '../../shared/types';
import { Database } from '../database/PrismaClient';

export class UsuarioRepository {
  private prisma = Database.getInstance();

  async buscarPorEmail(email: string) {
    return this.prisma.usuario.findUnique({ where: { email } });
  }

  async listarTodos() {
    return this.prisma.usuario.findMany({
      select: { id: true, nome: true, email: true, role: true, ativo: true, criadoEm: true },
    });
  }

  async criar(dados: { nome: string; email: string; senhaHash: string; role: Role }) {
    return this.prisma.usuario.create({ data: dados });
  }

  async alternarStatus(id: number, ativo: boolean) {
    return this.prisma.usuario.update({ where: { id }, data: { ativo } });
  }
}
