import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS, type IpcChannel } from '../../shared/ipc-channels';
import type { AlertaVacinaService } from '../services/AlertaVacinaService';
import type { AnexoArquivoService } from '../services/AnexoArquivoService';
import type { AnexoService } from '../services/AnexoService';
import type { AuthService } from '../services/AuthService';
import type { ClientePetService } from '../services/ClientePetService';
import type { ConsultaService } from '../services/ConsultaService';
import type { CotacaoService } from '../services/CotacaoService';
import type { EstoqueService } from '../services/EstoqueService';
import type { HistoricoPrecoService } from '../services/HistoricoPrecoService';
import type { IntegracoesService } from '../services/IntegracoesService';
import type { MovimentacaoFinanceiraService } from '../services/MovimentacaoFinanceiraService';
import type { OrcamentoService } from '../services/OrcamentoService';
import type { PolicyService } from '../services/PolicyService';
import type { RelatorioService } from '../services/RelatorioService';
import type { SessaoService } from '../services/SessaoService';
import type { TabelaPrecoService } from '../services/TabelaPrecoService';
import type { UsuarioService } from '../services/UsuarioService';
import type { VacinaService } from '../services/VacinaService';
import { paraErroSeguro } from './erros';
import { criarHandlersAnexo } from './handlersAnexo';
import { criarHandlersAuth } from './handlersAuth';
import { criarHandlersClientePet } from './handlersClientePet';
import { criarHandlersComplementos } from './handlersComplementos';
import { criarHandlersConsulta } from './handlersConsulta';
import { criarHandlersEstoque } from './handlersEstoque';
import { criarHandlersFase2 } from './handlersFase2';
import { criarHandlersIntegracoes } from './handlersIntegracoes';
import { criarHandlersProntuario } from './handlersProntuario';
import { criarHandlersUsuarios } from './handlersUsuarios';
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
  usuarioService: UsuarioService;
  policyService: PolicyService;
  integracoesService: IntegracoesService;
  alertaVacinaService: AlertaVacinaService;
  cotacaoService: CotacaoService;
  relatorioService: RelatorioService;
  tabelaPrecoService: TabelaPrecoService;
  historicoPrecoService: HistoricoPrecoService;
  orcamentoService: OrcamentoService;
  financeiroService: MovimentacaoFinanceiraService;
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
  IPC_CHANNELS.AUTH_LOGOUT,
  IPC_CHANNELS.CONSULTAS_LISTAR,
  IPC_CHANNELS.CONSULTAS_CRIAR,
  IPC_CHANNELS.CONSULTAS_CANCELAR,
  IPC_CHANNELS.CONSULTAS_CONCLUIR,
  IPC_CHANNELS.VETERINARIOS_LISTAR,
  IPC_CHANNELS.PRONTUARIO_SALVAR,
  IPC_CHANNELS.PRONTUARIO_LISTAR_PET,
  IPC_CHANNELS.PRONTUARIO_EXPORTAR_TXT,
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
  IPC_CHANNELS.CLIENTES_ATUALIZAR,
  IPC_CHANNELS.CLIENTES_INATIVAR,
  IPC_CHANNELS.CLIENTES_REATIVAR,
  IPC_CHANNELS.PETS_ATUALIZAR,
  IPC_CHANNELS.PETS_INATIVAR,
  IPC_CHANNELS.PETS_REATIVAR,
  IPC_CHANNELS.USUARIOS_LISTAR,
  IPC_CHANNELS.USUARIOS_CRIAR,
  IPC_CHANNELS.USUARIOS_ATUALIZAR,
  IPC_CHANNELS.USUARIOS_INATIVAR,
  IPC_CHANNELS.USUARIOS_REATIVAR,
  IPC_CHANNELS.CONSULTAS_ATUALIZAR,
  IPC_CHANNELS.CONSULTAS_EXCLUIR,
  IPC_CHANNELS.ESTOQUE_PRODUTOS_ATUALIZAR,
  IPC_CHANNELS.ESTOQUE_PRODUTOS_INATIVAR,
  IPC_CHANNELS.ESTOQUE_LOTES_ATUALIZAR,
  IPC_CHANNELS.ESTOQUE_LOTES_BAIXAR,
  IPC_CHANNELS.VACINAS_ATUALIZAR,
  IPC_CHANNELS.VACINAS_ESTORNAR,
  IPC_CHANNELS.ANEXOS_ATUALIZAR,
  IPC_CHANNELS.API_IBGE_MUNICIPIO,
  IPC_CHANNELS.API_FERIADOS_ANO,
  IPC_CHANNELS.API_RESUMO_DASHBOARD,
  IPC_CHANNELS.VACINAS_ALERTAS,
  IPC_CHANNELS.VACINAS_ENVIAR_AVISOS,
  IPC_CHANNELS.API_COTACAO_DOLAR,
  IPC_CHANNELS.RELATORIOS_GERAR,
  IPC_CHANNELS.RELATORIOS_EXPORTAR_CSV,
  IPC_CHANNELS.PRECOS_TABELA_LISTAR,
  IPC_CHANNELS.PRECOS_TABELA_CRIAR,
  IPC_CHANNELS.PRECOS_TABELA_ATUALIZAR,
  IPC_CHANNELS.PRECOS_TABELA_INATIVAR,
  IPC_CHANNELS.PRECOS_TABELA_REATIVAR,
  IPC_CHANNELS.PRECOS_HISTORICO_LISTAR,
  IPC_CHANNELS.ORCAMENTOS_LISTAR,
  IPC_CHANNELS.ORCAMENTOS_CRIAR,
  IPC_CHANNELS.ORCAMENTOS_ATUALIZAR,
  IPC_CHANNELS.ORCAMENTOS_DEFINIR_STATUS,
  IPC_CHANNELS.ORCAMENTOS_CANCELAR,
  IPC_CHANNELS.FINANCEIRO_LISTAR,
  IPC_CHANNELS.FINANCEIRO_CRIAR,
  IPC_CHANNELS.FINANCEIRO_ATUALIZAR,
  IPC_CHANNELS.FINANCEIRO_BAIXAR,
  IPC_CHANNELS.FINANCEIRO_CANCELAR,
  IPC_CHANNELS.FINANCEIRO_RESUMO,
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
    ...criarHandlersClientePet(
      dependencias.clientePetService,
      dependencias.sessaoService,
      dependencias.policyService
    ),
    ...criarHandlersAuth(dependencias.authService, dependencias.sessaoService, dependencias.policyService),
    ...criarHandlersConsulta(
      dependencias.consultaService,
      dependencias.sessaoService,
      dependencias.policyService
    ),
    ...criarHandlersProntuario(
      dependencias.consultaService,
      dependencias.sessaoService,
      dependencias.policyService
    ),
    ...criarHandlersVacina(
      dependencias.vacinaService,
      dependencias.sessaoService,
      dependencias.policyService
    ),
    ...criarHandlersAnexo(
      dependencias.anexoService,
      dependencias.arquivoService,
      dependencias.sessaoService,
      dependencias.policyService
    ),
    ...criarHandlersEstoque(
      dependencias.estoqueService,
      dependencias.sessaoService,
      dependencias.policyService
    ),
    ...criarHandlersIntegracoes(dependencias.integracoesService, dependencias.policyService),
    ...criarHandlersUsuarios(
      dependencias.usuarioService,
      dependencias.sessaoService,
      dependencias.policyService
    ),
    ...criarHandlersComplementos(
      dependencias.alertaVacinaService,
      dependencias.cotacaoService,
      dependencias.relatorioService,
      dependencias.sessaoService,
      dependencias.policyService
    ),
    ...criarHandlersFase2(
      dependencias.tabelaPrecoService,
      dependencias.historicoPrecoService,
      dependencias.orcamentoService,
      dependencias.financeiroService,
      dependencias.sessaoService,
      dependencias.policyService
    ),
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
