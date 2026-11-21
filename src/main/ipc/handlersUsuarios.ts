import { IPC_CHANNELS } from '../../shared/ipc-channels';
import {
  ehDadosAtualizacaoUsuario,
  ehDadosInativacao,
  exigir,
} from '../../shared/validators';
import { PolicyService } from '../services/PolicyService';
import type { SessaoService } from '../services/SessaoService';
import type { UsuarioService } from '../services/UsuarioService';
import type { HandlerIpc } from './tipos';

type CanaisUsuarios =
  | typeof IPC_CHANNELS.USUARIOS_LISTAR
  | typeof IPC_CHANNELS.USUARIOS_ATUALIZAR
  | typeof IPC_CHANNELS.USUARIOS_INATIVAR;

export function criarHandlersUsuarios(
  usuarioService: UsuarioService,
  sessaoService: SessaoService,
  policy: PolicyService = new PolicyService(sessaoService)
): Record<CanaisUsuarios, HandlerIpc> {
  return {
    [IPC_CHANNELS.USUARIOS_LISTAR]: async () => {
      const usuario = await policy.exigirAutenticadoVerificado();
      policy.exigirAdmin(usuario);
      return usuarioService.listar();
    },

    [IPC_CHANNELS.USUARIOS_ATUALIZAR]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      policy.exigirAdmin(usuario);
      const dados = exigir(
        args[0],
        ehDadosAtualizacaoUsuario,
        'Dados do usuário inválidos. Confira nome, e-mail e perfil.'
      );
      return usuarioService.atualizar(dados, usuario);
    },

    [IPC_CHANNELS.USUARIOS_INATIVAR]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      policy.exigirAdmin(usuario);
      const dados = exigir(
        args[0],
        ehDadosInativacao,
        'Informe o usuário e o motivo da inativação (de 3 a 500 caracteres).'
      );
      return usuarioService.inativar(dados, usuario);
    },
  };
}
