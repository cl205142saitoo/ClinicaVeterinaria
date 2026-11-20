import { IPC_CHANNELS } from '../../shared/ipc-channels';
import {
  ehCep,
  ehCpf,
  ehDadosCliente,
  ehDadosPet,
  ehIdPositivo,
  ehObjeto,
  exigir,
} from '../../shared/validators';
import type { ClientePetService } from '../services/ClientePetService';
import type { SessaoService } from '../services/SessaoService';
import type { HandlerIpc } from './tipos';

type CanaisClientePet =
  | typeof IPC_CHANNELS.BUSCAR_CEP
  | typeof IPC_CHANNELS.CLIENTES_LISTAR
  | typeof IPC_CHANNELS.CLIENTES_CRIAR
  | typeof IPC_CHANNELS.CLIENTES_DELETAR
  | typeof IPC_CHANNELS.PETS_LISTAR
  | typeof IPC_CHANNELS.PETS_CRIAR
  | typeof IPC_CHANNELS.PETS_DELETAR;

export function criarHandlersClientePet(
  clientePetService: ClientePetService,
  sessaoService: SessaoService
): Record<CanaisClientePet, HandlerIpc> {
  return {
    [IPC_CHANNELS.BUSCAR_CEP]: async (args) => {
      sessaoService.exigirAutenticado();
      const cep = exigir(args[0], ehCep, 'CEP inválido. Digite 8 números.');
      return clientePetService.buscarEnderecoPorCep(cep);
    },

    [IPC_CHANNELS.CLIENTES_LISTAR]: () => {
      sessaoService.exigirAutenticado();
      return clientePetService.listarClientes();
    },

    [IPC_CHANNELS.CLIENTES_CRIAR]: async (args) => {
      sessaoService.exigirAutenticado();
      if (ehObjeto(args[0])) {
        exigir(args[0].cpf, ehCpf, 'CPF inválido. Confira os números digitados.');
      }
      const dados = exigir(
        args[0],
        ehDadosCliente,
        'Dados do cliente inválidos. Confira os campos e tente novamente.'
      );
      return clientePetService.criarCliente(dados);
    },

    [IPC_CHANNELS.CLIENTES_DELETAR]: async (args) => {
      sessaoService.exigirAdmin();
      const id = exigir(args[0], ehIdPositivo, 'Informe um cliente válido para excluir.');
      return clientePetService.deletarCliente(id);
    },

    [IPC_CHANNELS.PETS_LISTAR]: () => {
      sessaoService.exigirAutenticado();
      return clientePetService.listarPets();
    },

    [IPC_CHANNELS.PETS_CRIAR]: async (args) => {
      sessaoService.exigirAutenticado();
      const dados = exigir(
        args[0],
        ehDadosPet,
        'Dados do pet inválidos. Confira os campos e tente novamente.'
      );
      return clientePetService.criarPet(dados);
    },

    [IPC_CHANNELS.PETS_DELETAR]: async (args) => {
      sessaoService.exigirAdmin();
      const id = exigir(args[0], ehIdPositivo, 'Informe um pet válido para excluir.');
      return clientePetService.deletarPet(id);
    },
  };
}
