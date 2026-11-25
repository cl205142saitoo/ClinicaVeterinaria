import type { IpcChannel } from '../../shared/ipc-channels';
import { ErroAplicacao, extrairMensagemAplicacao } from '../../shared/errors';

const MENSAGEM_GENERICA = 'Não foi possível concluir a operação. Tente novamente.';

/**
 * Erros de domínio preservam a mensagem original mesmo se perderem o
 * protótipo ao cruzar uma transação ou a serialização do IPC. O marcador,
 * não o `instanceof`, é a autoridade. Demais falhas ficam no log do main
 * e chegam ao renderer apenas como texto genérico.
 */
export function paraErroSeguro(erro: unknown, canal: IpcChannel): ErroAplicacao {
  const mensagem = extrairMensagemAplicacao(erro);
  if (mensagem !== null) {
    return erro instanceof ErroAplicacao ? erro : new ErroAplicacao(mensagem);
  }
  console.error(`[IPC] Falha não tratada no canal ${canal}:`, erro);
  return new ErroAplicacao(MENSAGEM_GENERICA);
}
