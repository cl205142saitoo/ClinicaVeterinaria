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
  DadosAtualizacaoPet,
  DadosAtualizacaoProduto,
  DadosAtualizacaoUsuario,
  DadosAtualizacaoVacina,
  DadosCliente,
  DadosConsulta,
  DadosInativacao,
  DadosLote,
  DadosPet,
  DadosProntuario,
  DadosProduto,
  DadosRegistro,
  DadosRegistroAnexo,
  DadosRegistroVacina,
  Endereco,
  Feriado,
  FiltroAgenda,
  FiltroRelatorio,
  Lote,
  MunicipioIbge,
  NivelAlertaVacina,
  Pet,
  Produto,
  RegistroVacina,
  RelatorioDados,
  ResumoDashboard,
  ResultadoEnvioAvisos,
  ResultadoExportacaoCsv,
  Role,
  SerieMensal,
  StatusConsulta,
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
