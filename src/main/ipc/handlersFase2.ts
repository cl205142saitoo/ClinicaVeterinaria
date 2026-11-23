import { IPC_CHANNELS } from '../../shared/ipc-channels';
import type { OrigemHistoricoPreco } from '../../shared/types';
import {
  ehDadosAtualizacaoMovimentacao,
  ehDadosAtualizacaoOrcamento,
  ehDadosAtualizacaoTabelaPreco,
  ehDadosBaixaMovimentacao,
  ehDadosInativacao,
  ehDadosMovimentacao,
  ehDadosOrcamento,
  ehDadosStatusOrcamento,
  ehDadosTabelaPreco,
  ehIdPositivo,
  ehOrigemHistoricoPreco,
  exigir,
} from '../../shared/validators';
import type { HistoricoPrecoService } from '../services/HistoricoPrecoService';
import type { MovimentacaoFinanceiraService } from '../services/MovimentacaoFinanceiraService';
import type { OrcamentoService } from '../services/OrcamentoService';
import { PolicyService } from '../services/PolicyService';
import type { SessaoService } from '../services/SessaoService';
import type { TabelaPrecoService } from '../services/TabelaPrecoService';
import type { HandlerIpc } from './tipos';

type CanaisFase2 =
  | typeof IPC_CHANNELS.PRECOS_TABELA_LISTAR
  | typeof IPC_CHANNELS.PRECOS_TABELA_CRIAR
  | typeof IPC_CHANNELS.PRECOS_TABELA_ATUALIZAR
  | typeof IPC_CHANNELS.PRECOS_TABELA_INATIVAR
  | typeof IPC_CHANNELS.PRECOS_HISTORICO_LISTAR
  | typeof IPC_CHANNELS.ORCAMENTOS_LISTAR
  | typeof IPC_CHANNELS.ORCAMENTOS_CRIAR
  | typeof IPC_CHANNELS.ORCAMENTOS_ATUALIZAR
  | typeof IPC_CHANNELS.ORCAMENTOS_DEFINIR_STATUS
  | typeof IPC_CHANNELS.ORCAMENTOS_CANCELAR
  | typeof IPC_CHANNELS.FINANCEIRO_LISTAR
  | typeof IPC_CHANNELS.FINANCEIRO_CRIAR
  | typeof IPC_CHANNELS.FINANCEIRO_ATUALIZAR
  | typeof IPC_CHANNELS.FINANCEIRO_BAIXAR
  | typeof IPC_CHANNELS.FINANCEIRO_CANCELAR
  | typeof IPC_CHANNELS.FINANCEIRO_RESUMO;

/** Validação de fronteira: o service ainda reaplica as regras de domínio. */
export function criarHandlersFase2(
  tabelaPrecoService: TabelaPrecoService,
  historicoPrecoService: HistoricoPrecoService,
  orcamentoService: OrcamentoService,
  financeiroService: MovimentacaoFinanceiraService,
  sessaoService: SessaoService,
  policy: PolicyService = new PolicyService(sessaoService)
): Record<CanaisFase2, HandlerIpc> {
  return {
    [IPC_CHANNELS.PRECOS_TABELA_LISTAR]: async () => {
      const usuario = await policy.exigirAutenticadoVerificado();
      return tabelaPrecoService.listar(usuario);
    },

    [IPC_CHANNELS.PRECOS_TABELA_CRIAR]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      const dados = exigir(
        args[0],
        ehDadosTabelaPreco,
        'Dados da tabela de preço inválidos. Confira código, descrição, categoria e preço.'
      );
      return tabelaPrecoService.criar(dados, usuario);
    },

    [IPC_CHANNELS.PRECOS_TABELA_ATUALIZAR]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      const dados = exigir(
        args[0],
        ehDadosAtualizacaoTabelaPreco,
        'Dados da tabela de preço inválidos. Confira código, descrição, categoria e preço.'
      );
      return tabelaPrecoService.atualizar(dados, usuario);
    },

    [IPC_CHANNELS.PRECOS_TABELA_INATIVAR]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      const dados = exigir(
        args[0],
        ehDadosInativacao,
        'Informe a tabela de preço e o motivo da inativação (de 3 a 500 caracteres).'
      );
      return tabelaPrecoService.inativar(dados, usuario);
    },

    [IPC_CHANNELS.PRECOS_HISTORICO_LISTAR]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      const origem =
        args[0] === undefined || args[0] === null
          ? undefined
          : exigir<OrigemHistoricoPreco>(
              args[0],
              ehOrigemHistoricoPreco,
              'Origem de histórico de preço inválida.'
            );
      const origemId =
        args[1] === undefined || args[1] === null
          ? undefined
          : exigir(args[1], ehIdPositivo, 'Informe um identificador válido para o filtro.');
      return historicoPrecoService.listar(usuario, origem, origemId);
    },

    [IPC_CHANNELS.ORCAMENTOS_LISTAR]: async () => {
      const usuario = await policy.exigirAutenticadoVerificado();
      return orcamentoService.listar(usuario);
    },

    [IPC_CHANNELS.ORCAMENTOS_CRIAR]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      const dados = exigir(
        args[0],
        ehDadosOrcamento,
        'Dados do orçamento inválidos. Confira cliente, validade e itens.'
      );
      return orcamentoService.criar(dados, usuario);
    },

    [IPC_CHANNELS.ORCAMENTOS_ATUALIZAR]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      const dados = exigir(
        args[0],
        ehDadosAtualizacaoOrcamento,
        'Dados do orçamento inválidos. Confira cliente, validade e itens.'
      );
      return orcamentoService.atualizar(dados, usuario);
    },

    [IPC_CHANNELS.ORCAMENTOS_DEFINIR_STATUS]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      const dados = exigir(
        args[0],
        ehDadosStatusOrcamento,
        'Informe o orçamento e um status válido (APROVADO ou REPROVADO).'
      );
      return orcamentoService.definirStatus(dados, usuario);
    },

    [IPC_CHANNELS.ORCAMENTOS_CANCELAR]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      const dados = exigir(
        args[0],
        ehDadosInativacao,
        'Informe o orçamento e o motivo do cancelamento (de 3 a 500 caracteres).'
      );
      return orcamentoService.cancelar(dados, usuario);
    },

    [IPC_CHANNELS.FINANCEIRO_LISTAR]: async () => {
      const usuario = await policy.exigirAutenticadoVerificado();
      return financeiroService.listar(usuario);
    },

    [IPC_CHANNELS.FINANCEIRO_CRIAR]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      const dados = exigir(
        args[0],
        ehDadosMovimentacao,
        'Dados da movimentação inválidos. Confira tipo, valor e vencimento.'
      );
      return financeiroService.criar(dados, usuario);
    },

    [IPC_CHANNELS.FINANCEIRO_ATUALIZAR]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      const dados = exigir(
        args[0],
        ehDadosAtualizacaoMovimentacao,
        'Dados da movimentação inválidos. Confira tipo, valor e vencimento.'
      );
      return financeiroService.atualizar(dados, usuario);
    },

    [IPC_CHANNELS.FINANCEIRO_BAIXAR]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      const dados = exigir(
        args[0],
        ehDadosBaixaMovimentacao,
        'Informe a movimentação e a data do pagamento (AAAA-MM-DD).'
      );
      return financeiroService.baixar(dados, usuario);
    },

    [IPC_CHANNELS.FINANCEIRO_CANCELAR]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      const dados = exigir(
        args[0],
        ehDadosInativacao,
        'Informe a movimentação e o motivo do cancelamento (de 3 a 500 caracteres).'
      );
      return financeiroService.cancelar(dados, usuario);
    },

    [IPC_CHANNELS.FINANCEIRO_RESUMO]: async () => {
      const usuario = await policy.exigirAutenticadoVerificado();
      return financeiroService.resumoFinanceiro(usuario);
    },
  };
}
