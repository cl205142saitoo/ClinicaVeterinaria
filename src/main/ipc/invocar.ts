import { ipcRenderer } from 'electron';
import type { IpcChannel } from '../../shared/ipc-channels';

/**
 * A API do Electron tipa `invoke` como `Promise<any>`; o cast fica isolado aqui
 * para que o restante do preload preserve o contrato `Api`.
 */
export function invocar<T>(canal: IpcChannel, ...args: readonly unknown[]): Promise<T> {
  return ipcRenderer.invoke(canal, ...args) as Promise<T>;
}
