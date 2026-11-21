/** Tipos do contrato IPC reexportados do módulo compartilhado. */

export type {
  AnexoClinico,
  Api,
  ArquivoAnexoSelecionado,
  CategoriaAnexo,
  Cliente,
  ConsultaAgenda,
  ConsultaProntuario,
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
  Lote,
  MunicipioIbge,
  Pet,
  Produto,
  RegistroVacina,
  ResumoDashboard,
  Role,
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
