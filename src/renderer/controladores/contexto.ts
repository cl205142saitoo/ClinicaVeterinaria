/** Contrato mínimo compartilhado pelos controladores do renderer. */

import type { AuthController } from './AuthController';

export interface ContextoApp {
  /** Sessão atual; a autoridade final continua sendo o backend. */
  readonly auth: AuthController;
  /** Recarrega todas as telas após uma mutação. */
  recarregarTudo(): Promise<void>;
  /** Recarrega apenas a agenda (usado por prontuário e ao reagendar). */
  recarregarAgenda(): Promise<void>;
  /** Recarrega clientes, pets e os seletores dependentes. */
  recarregarClientesEPets(): Promise<void>;
  /** Limpa tabelas e formulários quando a sessão termina. */
  limparEstado(): void;
}
