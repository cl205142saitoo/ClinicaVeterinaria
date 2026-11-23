/** Tipos do contrato IPC reexportados do módulo compartilhado. */

export type {
  AlertaEstoqueRelatorio,
  AlertaVacina,
  AnexoClinico,
  Api,
  ArquivoAnexoSelecionado,
  CategoriaAnexo,
  Cliente,
  ConsultaAgenda,
  ConsultaProntuario,
  ContadorGrupo,
  CotacaoDolar,
  DadosAtualizacaoAnexo,
  DadosAtualizacaoCliente,
  DadosAtualizacaoConsulta,
  DadosAtualizacaoLote,
  DadosAtualizacaoMovimentacao,
  DadosAtualizacaoOrcamento,
  DadosAtualizacaoPet,
  DadosAtualizacaoProduto,
  DadosAtualizacaoTabelaPreco,
  DadosAtualizacaoUsuario,
  DadosAtualizacaoVacina,
  DadosBaixaMovimentacao,
  DadosCliente,
  DadosConsulta,
  DadosInativacao,
  DadosItemOrcamento,
  DadosLote,
  DadosMovimentacao,
  DadosOrcamento,
  DadosPet,
  DadosProntuario,
  DadosProduto,
  DadosRegistro,
  DadosRegistroAnexo,
  DadosRegistroVacina,
  DadosStatusOrcamento,
  DadosTabelaPreco,
  Endereco,
  Feriado,
  FiltroAgenda,
  FiltroRelatorio,
  HistoricoPreco,
  ItemOrcamento,
  ItemOrcamentoTipo,
  Lote,
  MovimentacaoFinanceira,
  MovimentacaoStatus,
  MovimentacaoTipo,
  MunicipioIbge,
  NivelAlertaVacina,
  Orcamento,
  OrcamentoStatus,
  OrigemHistoricoPreco,
  Pet,
  Produto,
  RegistroVacina,
  RelatorioDados,
  ResumoDashboard,
  ResumoFinanceiro,
  ResultadoEnvioAvisos,
  ResultadoExportacaoCsv,
  Role,
  SerieMensal,
  StatusConsulta,
  TabelaPreco,
  Usuario,
  VeterinarioResumo,
} from '../shared/types';

export interface BootstrapModal {
  show(): void;
  hide(): void;
}

export interface BootstrapModalConstructor {
  new (element: HTMLElement, options?: { backdrop?: boolean | 'static'; keyboard?: boolean }): BootstrapModal;
}

export interface BootstrapToastConstructor {
  new (element: HTMLElement, options?: { delay?: number }): { show(): void };
}

/** Recursos do bundle do Bootstrap usados pelo renderer. */
export interface BootstrapGlobal {
  Modal: BootstrapModalConstructor;
  Toast: BootstrapToastConstructor;
}
