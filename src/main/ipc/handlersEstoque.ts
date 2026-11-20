import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { ehDadosLote, ehDadosProduto, exigir } from '../../shared/validators';
import type { EstoqueService } from '../services/EstoqueService';
import type { SessaoService } from '../services/SessaoService';
import type { HandlerIpc } from './tipos';

type CanaisEstoque =
  | typeof IPC_CHANNELS.ESTOQUE_PRODUTOS_LISTAR
  | typeof IPC_CHANNELS.ESTOQUE_PRODUTOS_CRIAR
  | typeof IPC_CHANNELS.ESTOQUE_LOTES_LISTAR
  | typeof IPC_CHANNELS.ESTOQUE_LOTES_CRIAR;

export function criarHandlersEstoque(
  estoqueService: EstoqueService,
  sessaoService: SessaoService
): Record<CanaisEstoque, HandlerIpc> {
  return {
    [IPC_CHANNELS.ESTOQUE_PRODUTOS_LISTAR]: async () => {
      const usuario = sessaoService.exigirAutenticado();
      return estoqueService.listarProdutos(usuario);
    },

    [IPC_CHANNELS.ESTOQUE_PRODUTOS_CRIAR]: async (args) => {
      const usuario = sessaoService.exigirAutenticado();
      const dados = exigir(
        args[0],
        ehDadosProduto,
        'Dados do produto inválidos. Confira os campos e tente novamente.'
      );
      return estoqueService.criarProduto(dados, usuario);
    },

    [IPC_CHANNELS.ESTOQUE_LOTES_LISTAR]: async () => {
      const usuario = sessaoService.exigirAutenticado();
      return estoqueService.listarLotes(usuario);
    },

    [IPC_CHANNELS.ESTOQUE_LOTES_CRIAR]: async (args) => {
      const usuario = sessaoService.exigirAutenticado();
      const dados = exigir(
        args[0],
        ehDadosLote,
        'Dados do lote inválidos. Confira os campos e tente novamente.'
      );
      return estoqueService.criarLote(dados, usuario);
    },
  };
}
