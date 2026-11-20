/** Tipos do contrato IPC reexportados do módulo compartilhado. */

export type {
  AnexoClinico,
  Api,
  ArquivoAnexoSelecionado,
  CategoriaAnexo,
  Cliente,
  ConsultaAgenda,
  ConsultaProntuario,
  DadosCliente,
  DadosConsulta,
  DadosPet,
  DadosProntuario,
  DadosRegistro,
  DadosRegistroAnexo,
  DadosRegistroVacina,
  DadosLote,
  DadosProduto,
  Endereco,
  FiltroAgenda,
  Lote,
  Pet,
  Produto,
  RegistroVacina,
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
