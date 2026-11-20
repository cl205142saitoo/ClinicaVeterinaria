import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { ehDadosRegistroVacina, ehIdPositivo, exigir } from '../../shared/validators';
import type { SessaoService } from '../services/SessaoService';
import type { VacinaService } from '../services/VacinaService';
import type { HandlerIpc } from './tipos';

type CanaisVacina =
  | typeof IPC_CHANNELS.VACINAS_LISTAR_PET
  | typeof IPC_CHANNELS.VACINAS_REGISTRAR;

export function criarHandlersVacina(
  vacinaService: VacinaService,
  sessaoService: SessaoService
): Record<CanaisVacina, HandlerIpc> {
  return {
    [IPC_CHANNELS.VACINAS_LISTAR_PET]: async (args) => {
      const usuario = sessaoService.exigirAutenticado();
      const petId = exigir(args[0], ehIdPositivo, 'Informe um pet válido.');
      return vacinaService.listarPet(petId, usuario);
    },

    [IPC_CHANNELS.VACINAS_REGISTRAR]: async (args) => {
      const usuario = sessaoService.exigirAutenticado();
      const dados = exigir(
        args[0],
        ehDadosRegistroVacina,
        'Dados da vacina inválidos. Confira os campos e tente novamente.'
      );
      return vacinaService.registrar(dados, usuario);
    },
  };
}
