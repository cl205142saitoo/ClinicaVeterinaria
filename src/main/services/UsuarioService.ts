import bcrypt from 'bcryptjs';
import { CUSTO_HASH_SENHA } from '../../shared/constants';
import { ErroAplicacao } from '../../shared/errors';
import type {
  DadosAtualizacaoUsuario,
  DadosInativacao,
  DadosNovoUsuario,
  Role,
  Usuario,
} from '../../shared/types';
import { ehRole, exigir } from '../../shared/validators';
import { UsuarioRepository } from '../repositories/UsuarioRepository';
import { PolicyService } from './PolicyService';
import { SessaoService } from './SessaoService';

interface RegistroSeguro {
  id: number;
  nome: string;
  email: string;
  crmv: string | null;
  rg: string | null;
  role: string;
  ativo: boolean;
  criadoEm: Date;
  inativadoEm?: Date | null;
  motivoInativacao?: string | null;
}

/** Nenhuma projeção de usuário traz `senhaHash` para o renderer. */
function paraDto(registro: RegistroSeguro): Usuario {
  const role: Role = exigir(registro.role, ehRole, 'Perfil de acesso inválido. Procure o administrador.');
  return {
    id: registro.id,
    nome: registro.nome,
    email: registro.email,
    crmv: registro.crmv,
    rg: registro.rg,
    role,
    ativo: registro.ativo,
    criadoEm: registro.criadoEm,
    inativadoEm: registro.inativadoEm == null ? null : registro.inativadoEm.toISOString(),
    motivoInativacao: registro.motivoInativacao ?? null,
  };
}

export class UsuarioService {
  constructor(
    private readonly repo: UsuarioRepository = new UsuarioRepository(),
    private readonly policy: PolicyService = new PolicyService(new SessaoService())
  ) {}

  listar(): Promise<Usuario[]> {
    return this.repo.listarTodos().then((registros) => registros.map(paraDto));
  }

  /** ADMIN cria VETERINARIO/ATENDENTE com senha; o role vem validado pelo IPC. */
  async criar(dados: DadosNovoUsuario, responsavel: Usuario): Promise<Usuario> {
    this.policy.exigirAdmin(responsavel);
    const email = dados.email.trim().toLowerCase();
    if (await this.repo.buscarPorEmail(email)) {
      throw new ErroAplicacao('Já existe um usuário cadastrado com este e-mail.');
    }
    const senhaHash = await bcrypt.hash(dados.senha, CUSTO_HASH_SENHA);
    const registro = await this.repo.criar({
      nome: dados.nome.trim(),
      email,
      senhaHash,
      role: dados.role,
      crmv: dados.role === 'VETERINARIO' ? dados.crmv?.trim() || null : null,
      rg: dados.rg?.trim() || null,
      ativo: dados.ativo ?? true,
    });
    return paraDto(registro);
  }

  async atualizar(dados: DadosAtualizacaoUsuario, responsavel: Usuario): Promise<Usuario> {
    this.policy.exigirAdmin(responsavel);
    const registroAlvo = await this.repo.buscarPorId(dados.id);
    if (registroAlvo === null) {
      throw new ErroAplicacao('Usuário não encontrado.');
    }
    const alvo = paraDto(registroAlvo);
    await this.protegerUltimoAdmin(alvo, dados.role, dados.ativo);

    const email = dados.email.trim().toLowerCase();
    const conflito = await this.repo.buscarPorEmail(email);
    if (conflito !== null && conflito.id !== dados.id) {
      throw new ErroAplicacao('Já existe outro usuário com este e-mail.');
    }

    const { novaSenha, ...dadosBase } = dados;
    const senhaHash =
      novaSenha === undefined || novaSenha === ''
        ? undefined
        : await bcrypt.hash(novaSenha, CUSTO_HASH_SENHA);

    await this.repo.atualizar({
      ...dadosBase,
      email,
      crmv: dados.role === 'VETERINARIO' ? dados.crmv?.trim() || null : null,
      ...(senhaHash !== undefined ? { senhaHash } : {}),
    });
    const atualizado = await this.repo.buscarPorId(dados.id);
    if (atualizado === null) {
      throw new ErroAplicacao('Usuário não encontrado após a atualização.');
    }
    return paraDto(atualizado);
  }

  async inativar(dados: DadosInativacao, responsavel: Usuario): Promise<Usuario> {
    this.policy.exigirAdmin(responsavel);
    const registroAlvo = await this.repo.buscarPorId(dados.id);
    if (registroAlvo === null) {
      throw new ErroAplicacao('Usuário não encontrado.');
    }
    const alvo = paraDto(registroAlvo);
    if (!alvo.ativo) {
      throw new ErroAplicacao('Este usuário já está inativado.');
    }
    await this.protegerUltimoAdmin(alvo, alvo.role, false);

    await this.repo.inativar(dados.id, dados.motivo, responsavel.id, new Date());
    const atualizado = await this.repo.buscarPorId(dados.id);
    if (atualizado === null) {
      throw new ErroAplicacao('Usuário não encontrado após a inativação.');
    }
    return paraDto(atualizado);
  }

  async reativar(id: number, responsavel: Usuario): Promise<Usuario> {
    this.policy.exigirAdmin(responsavel);
    const registroAlvo = await this.repo.buscarPorId(id);
    if (registroAlvo === null) {
      throw new ErroAplicacao('Usuário não encontrado.');
    }
    const alvo = paraDto(registroAlvo);
    if (alvo.ativo) {
      throw new ErroAplicacao('Este usuário já está ativo.');
    }
    const atualizado = await this.repo.reativar(id);
    if (atualizado === null) {
      throw new ErroAplicacao('Não foi possível reativar o usuário. Tente novamente.');
    }
    return paraDto(atualizado);
  }

  /** Rebaixar ou desativar o único ADMIN ativo deixaria a clínica sem gestão. */
  private async protegerUltimoAdmin(
    alvo: Usuario,
    roleDestino: Role,
    ativoDestino: boolean
  ): Promise<void> {
    const eraAdminAtivo = alvo.role === 'ADMIN' && alvo.ativo;
    const perdeAdmin = roleDestino !== 'ADMIN' || !ativoDestino;
    if (!eraAdminAtivo || !perdeAdmin) return;
    if ((await this.repo.contarAdminsAtivos()) <= 1) {
      throw new ErroAplicacao('Não é possível rebaixar ou inativar o último administrador ativo.');
    }
  }
}
