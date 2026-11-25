import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { ehDadosProntuario, ehIdPositivo, exigir } from '../../shared/validators';
import type { ConsultaService } from '../services/ConsultaService';
import { PolicyService } from '../services/PolicyService';
import type { SessaoService } from '../services/SessaoService';
import type { HandlerIpc } from './tipos';

type CanaisProntuario =
  | typeof IPC_CHANNELS.PRONTUARIO_SALVAR
  | typeof IPC_CHANNELS.PRONTUARIO_LISTAR_PET
  | typeof IPC_CHANNELS.PRONTUARIO_EXPORTAR_TXT;

export function criarHandlersProntuario(
  consultaService: ConsultaService,
  sessaoService: SessaoService,
  policy: PolicyService = new PolicyService(sessaoService)
): Record<CanaisProntuario, HandlerIpc> {
  return {
    [IPC_CHANNELS.PRONTUARIO_SALVAR]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      const dados = exigir(
        args[0],
        ehDadosProntuario,
        'Dados do prontuário inválidos. Confira os campos e tente novamente.'
      );
      return consultaService.salvarProntuario(dados, usuario);
    },

    [IPC_CHANNELS.PRONTUARIO_LISTAR_PET]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      const petId = exigir(args[0], ehIdPositivo, 'Informe um pet válido.');
      return consultaService.listarProntuarioPet(petId, usuario);
    },

    [IPC_CHANNELS.PRONTUARIO_EXPORTAR_TXT]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      const consultaId = exigir(args[0], ehIdPositivo, 'Informe uma consulta válida.');
      return consultaService.exportarProntuarioTxt(consultaId, usuario);
    },
  };
}
