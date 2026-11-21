import type { IpcChannel } from '../../shared/ipc-channels';
import { ErroAplicacao } from '../../shared/errors';

const MENSAGEM_GENERICA = 'Não foi possível concluir a operação. Tente novamente.';

/** Erros inesperados ficam no log do main; o renderer recebe apenas texto seguro. */
export function paraErroSeguro(erro: unknown, canal: IpcChannel): ErroAplicacao {
  if (erro instanceof ErroAplicacao) {
    return erro;
  }
  console.error(`[IPC] Falha não tratada no canal ${canal}:`, erro);
  return new ErroAplicacao(MENSAGEM_GENERICA);
}
