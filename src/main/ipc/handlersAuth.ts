import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { ehEmail, ehSenhaPreenchida, exigir } from '../../shared/validators';
import type { AuthService } from '../services/AuthService';
import type { PolicyService } from '../services/PolicyService';
import type { SessaoService } from '../services/SessaoService';
import type { HandlerIpc } from './tipos';

type CanaisAuth =
  | typeof IPC_CHANNELS.AUTH_LOGIN
  | typeof IPC_CHANNELS.AUTH_LOGOUT;

export function criarHandlersAuth(
  authService: AuthService,
  sessaoService: SessaoService,
  _policy?: PolicyService
): Record<CanaisAuth, HandlerIpc> {
  return {
    [IPC_CHANNELS.AUTH_LOGIN]: async (args) => {
      const email = exigir(args[0], ehEmail, 'Informe um e-mail válido.');
      const senha = exigir(args[1], ehSenhaPreenchida, 'Informe sua senha.');
      const usuario = await authService.login(email, senha);
      sessaoService.iniciar(usuario);
      return usuario;
    },

    [IPC_CHANNELS.AUTH_LOGOUT]: async () => {
      sessaoService.encerrar();
    },
  };
}
