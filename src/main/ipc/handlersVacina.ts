import { IPC_CHANNELS } from '../../shared/ipc-channels';
import {
  ehDadosAtualizacaoVacina,
  ehDadosInativacao,
  ehDadosRegistroVacina,
  ehIdPositivo,
  exigir,
} from '../../shared/validators';
import { PolicyService } from '../services/PolicyService';
import type { SessaoService } from '../services/SessaoService';
import type { VacinaService } from '../services/VacinaService';
import type { HandlerIpc } from './tipos';

type CanaisVacina =
  | typeof IPC_CHANNELS.VACINAS_LISTAR_PET
  | typeof IPC_CHANNELS.VACINAS_REGISTRAR
  | typeof IPC_CHANNELS.VACINAS_ATUALIZAR
  | typeof IPC_CHANNELS.VACINAS_ESTORNAR;

export function criarHandlersVacina(
  vacinaService: VacinaService,
  sessaoService: SessaoService,
  policy: PolicyService = new PolicyService(sessaoService)
): Record<CanaisVacina, HandlerIpc> {
  return {
    [IPC_CHANNELS.VACINAS_LISTAR_PET]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      policy.exigirAcessoClinico(usuario, 'consultar a carteira de vacinação');
      const petId = exigir(args[0], ehIdPositivo, 'Informe um pet válido.');
      return vacinaService.listarPet(petId, usuario);
    },

    [IPC_CHANNELS.VACINAS_REGISTRAR]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      const dados = exigir(
        args[0],
        ehDadosRegistroVacina,
        'Dados da vacina inválidos. Confira os campos e tente novamente.'
      );
      return vacinaService.registrar(dados, usuario);
    },

    [IPC_CHANNELS.VACINAS_ATUALIZAR]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      policy.exigirAcessoClinico(usuario, 'editar registros de vacinação');
      const dados = exigir(
        args[0],
        ehDadosAtualizacaoVacina,
        'Dados da vacina inválidos. Confira os campos e tente novamente.'
      );
      return vacinaService.atualizar(dados, usuario);
    },

    [IPC_CHANNELS.VACINAS_ESTORNAR]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      policy.exigirAcessoClinico(usuario, 'estornar registros de vacinação');
      const dados = exigir(
        args[0],
        ehDadosInativacao,
        'Informe o registro de vacina e o motivo do estorno (de 3 a 500 caracteres).'
      );
      return vacinaService.estornar(dados, usuario);
    },
  };
}
