/** Marcador que sobrevive à serialização do IPC e do contextBridge. */
export const MARCADOR_ERRO_APLICACAO = '[ErroAplicacao] ';

/** Erro de domínio com mensagem segura para exibição ao usuário. */
export class ErroAplicacao extends Error {
  constructor(mensagem: string) {
    const texto = mensagem.startsWith(MARCADOR_ERRO_APLICACAO)
      ? mensagem
      : `${MARCADOR_ERRO_APLICACAO}${mensagem}`;
    super(texto);
    this.name = 'ErroAplicacao';
    // Detalhes de implementação do processo principal não devem cruzar a ponte IPC.
    this.stack = undefined;
  }
}

/** Recupera a mensagem de domínio; erros sem o marcador não são confiáveis. */
export function extrairMensagemAplicacao(erro: unknown): string | null {
  let mensagem: unknown;
  if (erro instanceof Error) {
    mensagem = erro.message;
  } else if (typeof erro === 'object' && erro !== null && 'message' in erro) {
    mensagem = (erro as { message?: unknown }).message;
  }
  if (typeof mensagem !== 'string' || !mensagem.startsWith(MARCADOR_ERRO_APLICACAO)) return null;
  return mensagem.slice(MARCADOR_ERRO_APLICACAO.length);
}
