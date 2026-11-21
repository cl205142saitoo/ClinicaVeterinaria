/** Assinatura comum dos handlers: argumentos não confiáveis, resposta serializável. */
export type HandlerIpc = (args: readonly unknown[]) => Promise<unknown>;
