import type { DadosAtualizacaoUsuario, Role } from '../../shared/types';
import { Database } from '../database/PrismaClient';

const selecaoSegura = {
  id: true,
  nome: true,
  email: true,
  crmv: true,
  rg: true,
  role: true,
  ativo: true,
  criadoEm: true,
} as const;

export class UsuarioRepository {
  private prisma = Database.getInstance();

  async buscarPorEmail(email: string) {
    return this.prisma.usuario.findUnique({ where: { email } });
  }

  buscarPorId(id: number) {
    return this.prisma.usuario.findUnique({ where: { id }, select: { ...selecaoSegura, inativadoEm: true, motivoInativacao: true } });
  }

  listarTodos() {
    return this.prisma.usuario.findMany({
      select: { ...selecaoSegura, inativadoEm: true, motivoInativacao: true },
      orderBy: [{ ativo: 'desc' }, { nome: 'asc' }],
    });
  }

  /** Devolve a entidade completa apenas para AuthService, que filtra o hash no DTO. */
  async criar(dados: {
    nome: string;
    email: string;
    senhaHash: string;
    role: Role;
    crmv?: string | null;
    rg?: string | null;
    ativo?: boolean;
  }) {
    return this.prisma.usuario.create({ data: dados });
  }

  async atualizar(dados: DadosAtualizacaoUsuario) {
    return this.prisma.usuario.update({
      where: { id: dados.id },
      data: {
        nome: dados.nome.trim(),
        email: dados.email.trim().toLowerCase(),
        crmv: dados.crmv,
        rg: dados.rg,
        role: dados.role,
        ativo: dados.ativo,
        // Reativação pelo formulário limpa os dados da inativação anterior;
        // a desativação auditada continua exclusiva de `inativar()`.
        ...(dados.ativo
          ? { inativadoEm: null, inativadoPorId: null, motivoInativacao: null }
          : {}),
      },
      select: selecaoSegura,
    });
  }

  async inativar(id: number, motivo: string, responsavelId: number, agora: Date) {
    return this.prisma.usuario.update({
      where: { id },
      data: {
        ativo: false,
        motivoInativacao: motivo.trim(),
        inativadoEm: agora,
        inativadoPorId: responsavelId,
      },
      select: selecaoSegura,
    });
  }

  /** Reativação limpa os campos de inativação; não reusa `alternarStatus`. */
  async reativar(id: number) {
    const resultado = await this.prisma.usuario.updateMany({
      where: { id, ativo: false },
      data: {
        ativo: true,
        inativadoPorId: null,
        inativadoEm: null,
        motivoInativacao: null,
      },
    });
    if (resultado.count !== 1) return null;
    return this.buscarPorId(id);
  }

  contarAdminsAtivos() {
    return this.prisma.usuario.count({ where: { role: 'ADMIN', ativo: true } });
  }

  async alternarStatus(id: number, ativo: boolean) {
    return this.prisma.usuario.update({ where: { id }, data: { ativo }, select: selecaoSegura });
  }
}
