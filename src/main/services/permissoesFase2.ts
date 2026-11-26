/** Política de acesso dos módulos de preços, orçamentos e financeiro. */

import { ErroAplicacao } from '../../shared/errors';
import type { Role, Usuario } from '../../shared/types';

const PERFIS_CONHECIDOS: readonly Role[] = ['ADMIN', 'VETERINARIO', 'ATENDENTE'];

export function exigirPerfilConhecido(usuario: Usuario, modulo: string): void {
  if (!PERFIS_CONHECIDOS.includes(usuario.role)) {
    throw new ErroAplicacao(`Perfil de acesso inválido para ${modulo}. Procure o administrador.`);
  }
}

/** Somente ADMIN acessa os módulos comerciais (menu oculto aos demais perfis). */
export function exigirLeituraFase2(usuario: Usuario, modulo: string): void {
  exigirPerfilConhecido(usuario, modulo);
  if (usuario.role !== 'ADMIN') {
    throw new ErroAplicacao(`Seu perfil não tem acesso a ${modulo}. Procure um administrador.`);
  }
}

/** Somente ADMIN altera tabelas de preço (e o preço dos produtos do estoque). */
export function exigirEdicaoPrecos(usuario: Usuario): void {
  exigirPerfilConhecido(usuario, 'preços');
  if (usuario.role !== 'ADMIN') {
    throw new ErroAplicacao(
      'Somente administradores podem criar, editar ou inativar tabelas de preço.'
    );
  }
}

/** ADMIN e VETERINARIO operam orçamentos e financeiro; ATENDENTE só lê. */
export function exigirEdicaoComercial(usuario: Usuario, modulo: string): void {
  exigirPerfilConhecido(usuario, modulo);
  if (usuario.role === 'ATENDENTE') {
    throw new ErroAplicacao(
      `Seu perfil tem acesso somente de leitura a ${modulo}. Procure um administrador ou veterinário.`
    );
  }
}
