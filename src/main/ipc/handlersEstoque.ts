import { IPC_CHANNELS } from '../../shared/ipc-channels';
import {
  ehDadosAtualizacaoLote,
  ehDadosAtualizacaoProduto,
  ehDadosInativacao,
  ehDadosLote,
  ehDadosProduto,
  exigir,
} from '../../shared/validators';
import { PolicyService } from '../services/PolicyService';
import type { EstoqueService } from '../services/EstoqueService';
import type { SessaoService } from '../services/SessaoService';
import type { HandlerIpc } from './tipos';

type CanaisEstoque =
  | typeof IPC_CHANNELS.ESTOQUE_PRODUTOS_LISTAR
  | typeof IPC_CHANNELS.ESTOQUE_PRODUTOS_CRIAR
  | typeof IPC_CHANNELS.ESTOQUE_PRODUTOS_ATUALIZAR
  | typeof IPC_CHANNELS.ESTOQUE_PRODUTOS_INATIVAR
  | typeof IPC_CHANNELS.ESTOQUE_LOTES_LISTAR
  | typeof IPC_CHANNELS.ESTOQUE_LOTES_CRIAR
  | typeof IPC_CHANNELS.ESTOQUE_LOTES_ATUALIZAR
  | typeof IPC_CHANNELS.ESTOQUE_LOTES_BAIXAR;

export function criarHandlersEstoque(
  estoqueService: EstoqueService,
  sessaoService: SessaoService,
  policy: PolicyService = new PolicyService(sessaoService)
): Record<CanaisEstoque, HandlerIpc> {
  return {
    [IPC_CHANNELS.ESTOQUE_PRODUTOS_LISTAR]: async () => {
      const usuario = await policy.exigirAutenticadoVerificado();
      return estoqueService.listarProdutos(usuario);
    },

    [IPC_CHANNELS.ESTOQUE_PRODUTOS_CRIAR]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      const dados = exigir(
        args[0],
        ehDadosProduto,
        'Dados do produto inválidos. Confira os campos e tente novamente.'
      );
      return estoqueService.criarProduto(dados, usuario);
    },

    [IPC_CHANNELS.ESTOQUE_PRODUTOS_ATUALIZAR]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      policy.exigirAdmin(usuario);
      const dados = exigir(
        args[0],
        ehDadosAtualizacaoProduto,
        'Dados do produto inválidos. Confira os campos e tente novamente.'
      );
      return estoqueService.atualizarProduto(dados, usuario);
    },

    [IPC_CHANNELS.ESTOQUE_PRODUTOS_INATIVAR]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      policy.exigirAdmin(usuario);
      const dados = exigir(
        args[0],
        ehDadosInativacao,
        'Informe o produto e o motivo da inativação (de 3 a 500 caracteres).'
      );
      return estoqueService.inativarProduto(dados, usuario);
    },

    [IPC_CHANNELS.ESTOQUE_LOTES_LISTAR]: async () => {
      const usuario = await policy.exigirAutenticadoVerificado();
      return estoqueService.listarLotes(usuario);
    },

    [IPC_CHANNELS.ESTOQUE_LOTES_CRIAR]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      const dados = exigir(
        args[0],
        ehDadosLote,
        'Dados do lote inválidos. Confira os campos e tente novamente.'
      );
      return estoqueService.criarLote(dados, usuario);
    },

    [IPC_CHANNELS.ESTOQUE_LOTES_ATUALIZAR]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      policy.exigirAdmin(usuario);
      const dados = exigir(
        args[0],
        ehDadosAtualizacaoLote,
        'Dados do lote inválidos. Confira os campos e tente novamente.'
      );
      return estoqueService.atualizarLote(dados, usuario);
    },

    [IPC_CHANNELS.ESTOQUE_LOTES_BAIXAR]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      policy.exigirAdmin(usuario);
      const dados = exigir(
        args[0],
        ehDadosInativacao,
        'Informe o lote e o motivo da baixa (de 3 a 500 caracteres).'
      );
      return estoqueService.baixarLote(dados, usuario);
    },
  };
}
