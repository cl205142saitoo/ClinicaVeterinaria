import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS, type IpcChannel } from '../../shared/ipc-channels';
import type { AnexoArquivoService } from '../services/AnexoArquivoService';
import type { AnexoService } from '../services/AnexoService';
import type { AuthService } from '../services/AuthService';
import type { ClientePetService } from '../services/ClientePetService';
import type { ConsultaService } from '../services/ConsultaService';
import type { EstoqueService } from '../services/EstoqueService';
import type { SessaoService } from '../services/SessaoService';
import type { VacinaService } from '../services/VacinaService';
import { paraErroSeguro } from './erros';
import { criarHandlersAnexo } from './handlersAnexo';
import { criarHandlersAuth } from './handlersAuth';
import { criarHandlersClientePet } from './handlersClientePet';
import { criarHandlersConsulta } from './handlersConsulta';
import { criarHandlersEstoque } from './handlersEstoque';
import { criarHandlersProntuario } from './handlersProntuario';
import { criarHandlersVacina } from './handlersVacina';
import type { HandlerIpc } from './tipos';

export interface DependenciasIpc {
  clientePetService: ClientePetService;
  authService: AuthService;
  consultaService: ConsultaService;
  vacinaService: VacinaService;
  anexoService: AnexoService;
  arquivoService: AnexoArquivoService;
  estoqueService: EstoqueService;
  sessaoService: SessaoService;
}

const CANAIS: readonly IpcChannel[] = [
  IPC_CHANNELS.BUSCAR_CEP,
  IPC_CHANNELS.CLIENTES_LISTAR,
  IPC_CHANNELS.CLIENTES_CRIAR,
  IPC_CHANNELS.CLIENTES_DELETAR,
  IPC_CHANNELS.PETS_LISTAR,
  IPC_CHANNELS.PETS_CRIAR,
  IPC_CHANNELS.PETS_DELETAR,
  IPC_CHANNELS.AUTH_LOGIN,
  IPC_CHANNELS.AUTH_REGISTRAR,
  IPC_CHANNELS.AUTH_LOGOUT,
  IPC_CHANNELS.CONSULTAS_LISTAR,
  IPC_CHANNELS.CONSULTAS_CRIAR,
  IPC_CHANNELS.CONSULTAS_CANCELAR,
  IPC_CHANNELS.CONSULTAS_CONCLUIR,
  IPC_CHANNELS.VETERINARIOS_LISTAR,
  IPC_CHANNELS.PRONTUARIO_SALVAR,
  IPC_CHANNELS.PRONTUARIO_LISTAR_PET,
  IPC_CHANNELS.VACINAS_LISTAR_PET,
  IPC_CHANNELS.VACINAS_REGISTRAR,
  IPC_CHANNELS.ANEXOS_LISTAR_PET,
  IPC_CHANNELS.ANEXOS_ESCOLHER_ARQUIVO,
  IPC_CHANNELS.ANEXOS_REGISTRAR,
  IPC_CHANNELS.ANEXOS_ABRIR,
  IPC_CHANNELS.ANEXOS_INATIVAR,
  IPC_CHANNELS.ANEXOS_CANCELAR,
  IPC_CHANNELS.ESTOQUE_PRODUTOS_LISTAR,
  IPC_CHANNELS.ESTOQUE_PRODUTOS_CRIAR,
  IPC_CHANNELS.ESTOQUE_LOTES_LISTAR,
  IPC_CHANNELS.ESTOQUE_LOTES_CRIAR,
];

async function executar(
  canal: IpcChannel,
  handlers: Record<IpcChannel, HandlerIpc>,
  args: readonly unknown[]
): Promise<unknown> {
  try {
    return await handlers[canal](args);
  } catch (erro) {
    throw paraErroSeguro(erro, canal);
  }
}

/** Registra apenas canais do contrato e devolve a rotina de limpeza. */
export function registrarHandlersIpc(dependencias: DependenciasIpc): () => void {
  const handlers: Record<IpcChannel, HandlerIpc> = {
    ...criarHandlersClientePet(dependencias.clientePetService, dependencias.sessaoService),
    ...criarHandlersAuth(dependencias.authService, dependencias.sessaoService),
    ...criarHandlersConsulta(dependencias.consultaService, dependencias.sessaoService),
    ...criarHandlersProntuario(dependencias.consultaService, dependencias.sessaoService),
    ...criarHandlersVacina(dependencias.vacinaService, dependencias.sessaoService),
    ...criarHandlersAnexo(
      dependencias.anexoService,
      dependencias.arquivoService,
      dependencias.sessaoService
    ),
    ...criarHandlersEstoque(dependencias.estoqueService, dependencias.sessaoService),
  };

  for (const canal of CANAIS) {
    ipcMain.handle(canal, (_evento: IpcMainInvokeEvent, ...args: unknown[]) =>
      executar(canal, handlers, args)
    );
  }

  return () => {
    for (const canal of CANAIS) {
      ipcMain.removeHandler(canal);
    }
  };
}
