/** Contratos de dados usados por main, preload e renderer. */

import type { ANEXO_CATEGORIAS } from './constants';

export type Role = 'ADMIN' | 'VETERINARIO' | 'ATENDENTE';

export type CategoriaAnexo = (typeof ANEXO_CATEGORIAS)[number];

export interface Endereco {
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
}

export interface Pet {
  id: number;
  nome: string;
  especie: string;
  raca: string;
  peso: number;
  nascimento: string | null;
  clienteId: number;
  /** Exclusão lógica: presente nas listagens após a Etapa 10. */
  ativo?: boolean;
  inativadoEm?: string | null;
  motivoInativacao?: string | null;
  /** Presente quando o pet vem de `listarPets()`. */
  cliente?: Cliente;
}

export interface Cliente {
  id: number;
  nome: string;
  cpf: string;
  telefone: string;
  email: string | null;
  cep: string;
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
  aceiteLgpd: boolean;
  criadoEm: Date;
  /** Exclusão lógica: presente nas listagens após a Etapa 10. */
  ativo?: boolean;
  inativadoEm?: string | null;
  motivoInativacao?: string | null;
  /** Presente quando o cliente vem de `listarClientes()`. */
  pets?: Pet[];
}

/** Usuário sem `senhaHash`: nunca trafega para o renderer. */
export interface Usuario {
  id: number;
  nome: string;
  email: string;
  /** Identificação profissional; visível apenas para ADMIN na interface. */
  crmv: string | null;
  rg: string | null;
  role: Role;
  ativo: boolean;
  criadoEm: Date;
  inativadoEm?: string | null;
  motivoInativacao?: string | null;
}

export interface DadosCliente {
  nome: string;
  cpf: string;
  telefone: string;
  cep: string;
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
  aceiteLgpd: boolean;
}

export interface DadosPet {
  clienteId: number;
  nome: string;
  especie: string;
  raca: string;
  peso: number;
  nascimento?: string;
}

/** Cadastro público: o perfil é fixado no backend e nunca vem do renderer. */
export interface DadosRegistro {
  nome: string;
  email: string;
  senha: string;
}

/** Status em ASCII para evitar divergência entre banco, backend e renderer. */
export type StatusConsulta = 'AGENDADA' | 'CONFIRMADA' | 'CONCLUIDA' | 'CANCELADA';

/**
 * Dados operacionais da consulta para agenda e ações de estado.
 * Nunca contém campos clínicos: ATENDENTE também recebe esta projeção.
 * `dataHora` é ISO UTC.
 */
export interface ConsultaAgenda {
  id: number;
  dataHora: string;
  duracaoMinutos: number;
  motivo: string;
  status: string;
  petId: number;
  veterinarioId: number;
  pet: { id: number; nome: string; clienteNome: string };
  veterinario: { id: number; nome: string; crmv: string | null };
}

/** Projeção clínica completa, restrita a ADMIN e ao VETERINARIO responsável. */
export interface ConsultaProntuario extends ConsultaAgenda {
  diagnostico: string | null;
  exameClinico: string | null;
  conduta: string | null;
  pesoAferido: number | null;
  temperaturaC: number | null;
}

export interface DadosConsulta {
  petId: number;
  veterinarioId: number;
  dataHora: string;
  motivo: string;
}

/** Campos clínicos gravados no prontuário; a conclusão permanece explícita. */
export interface DadosProntuario {
  consultaId: number;
  exameClinico: string;
  diagnostico: string;
  conduta: string;
  pesoAferido?: number | null;
  temperaturaC?: number | null;
}

/** Resumo seguro de veterinário: sem e-mail, senha ou papel de outros perfis. */
export interface VeterinarioResumo {
  id: number;
  nome: string;
  crmv: string | null;
}

export interface FiltroAgenda {
  de?: string;
  ate?: string;
}

/** Registro de vacinação: dado clínico sensível, nunca exposto a ATENDENTE. */
export interface RegistroVacina {
  id: number;
  petId: number;
  veterinarioId: number;
  consultaId: number | null;
  vacina: string;
  fabricante: string;
  lote: string;
  /** Data civil YYYY-MM-DD. */
  validade: string;
  /** ISO 8601 UTC. */
  aplicadaEm: string;
  /** Sequência da dose (1ª dose, reforço, dose única…), texto livre. */
  dose: string;
  /** Data civil YYYY-MM-DD, informada pelo veterinário; nunca calculada. */
  proximaDose: string | null;
  reacao: string | null;
  observacoes: string | null;
  registradoPorId: number;
  /** ISO 8601 UTC. */
  registradoEm: string;
  /** Exclusão lógica: estorno preserva a prova sanitária original. */
  estornado?: boolean;
  estornadoEm?: string | null;
  motivoEstorno?: string | null;
  veterinario: { id: number; nome: string; crmv: string | null };
}

export interface DadosRegistroVacina {
  petId: number;
  consultaId?: number | null;
  /** Obrigatório para ADMIN; ignorado/forçado para VETERINARIO. */
  veterinarioId?: number | null;
  vacina: string;
  fabricante: string;
  lote: string;
  validade: string;
  aplicadaEm: string;
  dose: string;
  proximaDose?: string | null;
  reacao?: string | null;
  observacoes?: string | null;
}

/** Dado clínico sensível; nunca inclui o nome do arquivo no disco. */
export interface AnexoClinico {
  id: number;
  petId: number;
  consultaId: number | null;
  responsavelId: number;
  descricao: string;
  categoria: CategoriaAnexo;
  /** YYYY-MM-DD */
  dataDocumento: string;
  nomeOriginal: string;
  mimeType: string;
  tamanhoBytes: number;
  checksumSha256: string;
  registradoPorId: number;
  registradoEm: string;
  atualizadoEm: string;
  inativo: boolean;
  inativadoPorId: number | null;
  inativadoEm: string | null;
  motivoInativacao: string | null;
  responsavel: { id: number; nome: string; crmv: string | null };
}

/** Metadados devolvidos após validar/escolher o arquivo no main. Nunca contém caminho. */
export interface ArquivoAnexoSelecionado {
  token: string;
  nomeOriginal: string;
  mimeType: string;
  tamanhoBytes: number;
  checksumSha256: string;
}

export interface DadosRegistroAnexo {
  token: string;
  petId: number;
  consultaId?: number | null;
  /** ADMIN informa; VET é forçado ao próprio id. */
  responsavelId?: number | null;
  descricao: string;
  categoria: CategoriaAnexo;
  /** YYYY-MM-DD, informado pelo usuário; validado no service */
  dataDocumento: string;
}

export interface Lote {
  id: number;
  codigo: string;
  /** YYYY-MM-DD (coluna DATETIME(6) ancorada em UTC). */
  validade: string;
  quantidade: number;
  produtoId: number;
  /** Presente em `estoqueLotesListar()`. */
  produto?: { id: number; nome: string; categoria: string };
  /** Baixa lógica: a quantidade não desaparece sem rastreio. */
  ativo?: boolean;
  baixadoEm?: string | null;
  motivoBaixa?: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

export interface Produto {
  id: number;
  nome: string;
  categoria: string;
  estoqueMinimo: number;
  /** BRL convertido de Prisma.Decimal para number. */
  precoBrl: number;
  ativo?: boolean;
  inativadoEm?: string | null;
  motivoInativacao?: string | null;
  lotes: Lote[];
}

export interface DadosProduto {
  nome: string;
  categoria: string;
  estoqueMinimo: number;
  precoBrl: number;
}

export interface DadosLote {
  produtoId: number;
  codigo: string;
  validade: string;
  quantidade: number;
}

/* ---------- CRUD completo: atualização e exclusão lógica ---------- */

/** "Delete" de entidades clínicas/auditoriais preserva o registro e o motivo. */
export interface DadosInativacao {
  id: number;
  /** Motivo obrigatório (3–500 caracteres), gravado na auditoria. */
  motivo: string;
}

export interface DadosAtualizacaoCliente extends DadosCliente {
  id: number;
}

export interface DadosAtualizacaoPet extends DadosPet {
  id: number;
}

export interface DadosAtualizacaoUsuario {
  id: number;
  nome: string;
  email: string;
  crmv: string | null;
  rg: string | null;
  role: Role;
  ativo: boolean;
}

/** Reagendamento/correção administrativa; nunca altera campos clínicos. */
export interface DadosAtualizacaoConsulta {
  id: number;
  dataHora: string;
  motivo: string;
  veterinarioId: number;
}

export interface DadosAtualizacaoProduto extends DadosProduto {
  id: number;
}

export interface DadosAtualizacaoLote extends DadosLote {
  id: number;
}

export interface DadosAtualizacaoVacina extends DadosRegistroVacina {
  id: number;
}

export interface DadosAtualizacaoAnexo {
  id: number;
  descricao: string;
  categoria: CategoriaAnexo;
  dataDocumento: string;
}

/* ---------- Integrações (4 situações de API com propósito real) ---------- */

/** Código IBGE oficial do município, usado em relatórios e campanhas municipais. */
export interface MunicipioIbge {
  id: number;
  nome: string;
  uf: string;
}

/** Feriado nacional do ano corrente, para alertar a agenda. */
export interface Feriado {
  data: string;
  nome: string;
  tipo: 'nacional';
}

/** Resumo servido pela API HTTP local do próprio sistema. */
export interface ResumoDashboard {
  clientesAtivos: number;
  petsAtivos: number;
  consultasHoje: number;
  consultasAgendadas: number;
  vacinasRegistradasHoje: number;
}

/** Superfície exposta pelo preload. Os nomes dos métodos são imutáveis. */
export interface Api {
  buscarCep(cep: string): Promise<Endereco>;
  listarClientes(): Promise<Cliente[]>;
  criarCliente(dados: DadosCliente): Promise<Cliente>;
  deletarCliente(id: number): Promise<Cliente>;
  listarPets(): Promise<Pet[]>;
  criarPet(dados: DadosPet): Promise<Pet>;
  deletarPet(id: number): Promise<Pet>;
  login(email: string, senha: string): Promise<Usuario>;
  registrarUsuario(dados: DadosRegistro): Promise<Usuario>;
  logout(): Promise<void>;
  consultasListar(filtro?: FiltroAgenda): Promise<ConsultaAgenda[]>;
  consultasCriar(dados: DadosConsulta): Promise<ConsultaAgenda>;
  consultasCancelar(id: number, motivo: string): Promise<ConsultaAgenda>;
  consultasConcluir(id: number): Promise<ConsultaAgenda>;
  veterinariosListar(): Promise<VeterinarioResumo[]>;
  prontuarioSalvar(dados: DadosProntuario): Promise<ConsultaProntuario>;
  prontuarioListarPet(petId: number): Promise<ConsultaProntuario[]>;
  vacinasListarPet(petId: number): Promise<RegistroVacina[]>;
  vacinasRegistrar(dados: DadosRegistroVacina): Promise<RegistroVacina>;
  anexosListarPet(petId: number): Promise<AnexoClinico[]>;
  anexosEscolherArquivo(): Promise<ArquivoAnexoSelecionado | null>;
  anexosRegistrar(dados: DadosRegistroAnexo): Promise<AnexoClinico>;
  anexosAbrir(id: number): Promise<void>;
  anexosInativar(id: number, motivo: string): Promise<AnexoClinico>;
  anexosCancelar(token: string): Promise<void>;
  estoqueProdutosListar(): Promise<Produto[]>;
  estoqueProdutosCriar(dados: DadosProduto): Promise<Produto>;
  estoqueLotesListar(): Promise<Lote[]>;
  estoqueLotesCriar(dados: DadosLote): Promise<Lote>;
  atualizarCliente(dados: DadosAtualizacaoCliente): Promise<Cliente>;
  inativarCliente(dados: DadosInativacao): Promise<Cliente>;
  atualizarPet(dados: DadosAtualizacaoPet): Promise<Pet>;
  inativarPet(dados: DadosInativacao): Promise<Pet>;
  listarUsuarios(): Promise<Usuario[]>;
  atualizarUsuario(dados: DadosAtualizacaoUsuario): Promise<Usuario>;
  inativarUsuario(dados: DadosInativacao): Promise<Usuario>;
  consultasAtualizar(dados: DadosAtualizacaoConsulta): Promise<ConsultaAgenda>;
  consultasExcluir(dados: DadosInativacao): Promise<ConsultaAgenda>;
  estoqueProdutosAtualizar(dados: DadosAtualizacaoProduto): Promise<Produto>;
  estoqueProdutosInativar(dados: DadosInativacao): Promise<Produto>;
  estoqueLotesAtualizar(dados: DadosAtualizacaoLote): Promise<Lote>;
  estoqueLotesBaixar(dados: DadosInativacao): Promise<Lote>;
  vacinasAtualizar(dados: DadosAtualizacaoVacina): Promise<RegistroVacina>;
  vacinasEstornar(dados: DadosInativacao): Promise<RegistroVacina>;
  anexosAtualizar(dados: DadosAtualizacaoAnexo): Promise<AnexoClinico>;
  buscarMunicipioIbge(nome: string, uf: string): Promise<MunicipioIbge | null>;
  listarFeriados(ano: number): Promise<Feriado[]>;
  resumoDashboard(): Promise<ResumoDashboard>;
}
