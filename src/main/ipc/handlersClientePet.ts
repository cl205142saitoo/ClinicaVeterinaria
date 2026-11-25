import { IPC_CHANNELS } from '../../shared/ipc-channels';
import {
  ehCep,
  ehCpf,
  ehDadosAtualizacaoCliente,
  ehDadosAtualizacaoPet,
  ehDadosCliente,
  ehDadosInativacao,
  ehDadosPet,
  ehIdPositivo,
  ehObjeto,
  exigir,
} from '../../shared/validators';
import { PolicyService } from '../services/PolicyService';
import type { ClientePetService } from '../services/ClientePetService';
import type { SessaoService } from '../services/SessaoService';
import type { HandlerIpc } from './tipos';

type CanaisClientePet =
  | typeof IPC_CHANNELS.BUSCAR_CEP
  | typeof IPC_CHANNELS.CLIENTES_LISTAR
  | typeof IPC_CHANNELS.CLIENTES_CRIAR
  | typeof IPC_CHANNELS.CLIENTES_DELETAR
  | typeof IPC_CHANNELS.CLIENTES_ATUALIZAR
  | typeof IPC_CHANNELS.CLIENTES_INATIVAR
  | typeof IPC_CHANNELS.CLIENTES_REATIVAR
  | typeof IPC_CHANNELS.PETS_LISTAR
  | typeof IPC_CHANNELS.PETS_CRIAR
  | typeof IPC_CHANNELS.PETS_DELETAR
  | typeof IPC_CHANNELS.PETS_ATUALIZAR
  | typeof IPC_CHANNELS.PETS_INATIVAR
  | typeof IPC_CHANNELS.PETS_REATIVAR;

export function criarHandlersClientePet(
  clientePetService: ClientePetService,
  sessaoService: SessaoService,
  policy: PolicyService = new PolicyService(sessaoService)
): Record<CanaisClientePet, HandlerIpc> {
  return {
    [IPC_CHANNELS.BUSCAR_CEP]: async (args) => {
      await policy.exigirAutenticadoVerificado();
      const cep = exigir(args[0], ehCep, 'CEP inválido. Digite 8 números.');
      return clientePetService.buscarEnderecoPorCep(cep);
    },

    [IPC_CHANNELS.CLIENTES_LISTAR]: async () => {
      await policy.exigirAutenticadoVerificado();
      return clientePetService.listarClientes();
    },

    [IPC_CHANNELS.CLIENTES_CRIAR]: async (args) => {
      await policy.exigirAutenticadoVerificado();
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
      const usuario = await policy.exigirAutenticadoVerificado();
      policy.exigirAdmin(usuario);
      const id = exigir(args[0], ehIdPositivo, 'Informe um cliente válido para excluir.');
      return clientePetService.deletarCliente(id);
    },

    [IPC_CHANNELS.CLIENTES_ATUALIZAR]: async (args) => {
      await policy.exigirAutenticadoVerificado();
      const dados = exigir(
        args[0],
        ehDadosAtualizacaoCliente,
        'Dados do cliente inválidos. Confira os campos e tente novamente.'
      );
      return clientePetService.atualizarClienteCompleto(dados);
    },

    [IPC_CHANNELS.CLIENTES_INATIVAR]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      policy.exigirAdmin(usuario);
      const dados = exigir(
        args[0],
        ehDadosInativacao,
        'Informe o cliente e o motivo da inativação (de 3 a 500 caracteres).'
      );
      return clientePetService.inativarCliente(dados, usuario);
    },

    [IPC_CHANNELS.CLIENTES_REATIVAR]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      policy.exigirAdmin(usuario);
      const id = exigir(args[0], ehIdPositivo, 'Informe um cliente válido para reativar.');
      return clientePetService.reativarCliente(id, usuario);
    },

    [IPC_CHANNELS.PETS_LISTAR]: async () => {
      await policy.exigirAutenticadoVerificado();
      return clientePetService.listarPets();
    },

    [IPC_CHANNELS.PETS_CRIAR]: async (args) => {
      await policy.exigirAutenticadoVerificado();
      const dados = exigir(
        args[0],
        ehDadosPet,
        'Dados do pet inválidos. Confira os campos e tente novamente.'
      );
      return clientePetService.criarPet(dados);
    },

    [IPC_CHANNELS.PETS_DELETAR]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      policy.exigirAdmin(usuario);
      const id = exigir(args[0], ehIdPositivo, 'Informe um pet válido para excluir.');
      return clientePetService.deletarPet(id);
    },

    [IPC_CHANNELS.PETS_ATUALIZAR]: async (args) => {
      await policy.exigirAutenticadoVerificado();
      const dados = exigir(
        args[0],
        ehDadosAtualizacaoPet,
        'Dados do pet inválidos. Confira os campos e tente novamente.'
      );
      return clientePetService.atualizarPetCompleto(dados);
    },

    [IPC_CHANNELS.PETS_INATIVAR]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      policy.exigirAdmin(usuario);
      const dados = exigir(
        args[0],
        ehDadosInativacao,
        'Informe o pet e o motivo da inativação (de 3 a 500 caracteres).'
      );
      return clientePetService.inativarPet(dados, usuario);
    },

    [IPC_CHANNELS.PETS_REATIVAR]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      policy.exigirAdmin(usuario);
      const id = exigir(args[0], ehIdPositivo, 'Informe um pet válido para reativar.');
      return clientePetService.reativarPet(id, usuario);
    },
  };
}
