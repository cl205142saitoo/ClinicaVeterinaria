import { contextBridge } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import type {
  AnexoClinico,
  Api,
  ArquivoAnexoSelecionado,
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
  DadosProduto,
  DadosProntuario,
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
  Usuario,
  VeterinarioResumo,
} from '../shared/types';
import { invocar } from './ipc/invocar';

const api: Api = {
  buscarCep: (cep) => invocar<Endereco>(IPC_CHANNELS.BUSCAR_CEP, cep),
  listarClientes: () => invocar<Cliente[]>(IPC_CHANNELS.CLIENTES_LISTAR),
  criarCliente: (dados: DadosCliente) => invocar<Cliente>(IPC_CHANNELS.CLIENTES_CRIAR, dados),
  deletarCliente: (id: number) => invocar<Cliente>(IPC_CHANNELS.CLIENTES_DELETAR, id),
  listarPets: () => invocar<Pet[]>(IPC_CHANNELS.PETS_LISTAR),
  criarPet: (dados: DadosPet) => invocar<Pet>(IPC_CHANNELS.PETS_CRIAR, dados),
  deletarPet: (id: number) => invocar<Pet>(IPC_CHANNELS.PETS_DELETAR, id),
  login: (email: string, senha: string) => invocar<Usuario>(IPC_CHANNELS.AUTH_LOGIN, email, senha),
  registrarUsuario: (dados: DadosRegistro) => invocar<Usuario>(IPC_CHANNELS.AUTH_REGISTRAR, dados),
  logout: () => invocar<void>(IPC_CHANNELS.AUTH_LOGOUT),
  consultasListar: (filtro?: FiltroAgenda) =>
    invocar<ConsultaAgenda[]>(IPC_CHANNELS.CONSULTAS_LISTAR, filtro),
  consultasCriar: (dados: DadosConsulta) =>
    invocar<ConsultaAgenda>(IPC_CHANNELS.CONSULTAS_CRIAR, dados),
  consultasCancelar: (id: number, motivo: string) =>
    invocar<ConsultaAgenda>(IPC_CHANNELS.CONSULTAS_CANCELAR, id, motivo),
  consultasConcluir: (id: number) =>
    invocar<ConsultaAgenda>(IPC_CHANNELS.CONSULTAS_CONCLUIR, id),
  veterinariosListar: () => invocar<VeterinarioResumo[]>(IPC_CHANNELS.VETERINARIOS_LISTAR),
  prontuarioSalvar: (dados: DadosProntuario) =>
    invocar<ConsultaProntuario>(IPC_CHANNELS.PRONTUARIO_SALVAR, dados),
  prontuarioListarPet: (petId: number) =>
    invocar<ConsultaProntuario[]>(IPC_CHANNELS.PRONTUARIO_LISTAR_PET, petId),
  vacinasListarPet: (petId: number) =>
    invocar<RegistroVacina[]>(IPC_CHANNELS.VACINAS_LISTAR_PET, petId),
  vacinasRegistrar: (dados: DadosRegistroVacina) =>
    invocar<RegistroVacina>(IPC_CHANNELS.VACINAS_REGISTRAR, dados),
  anexosListarPet: (petId: number) =>
    invocar<AnexoClinico[]>(IPC_CHANNELS.ANEXOS_LISTAR_PET, petId),
  anexosEscolherArquivo: () =>
    invocar<ArquivoAnexoSelecionado | null>(IPC_CHANNELS.ANEXOS_ESCOLHER_ARQUIVO),
  anexosRegistrar: (dados: DadosRegistroAnexo) =>
    invocar<AnexoClinico>(IPC_CHANNELS.ANEXOS_REGISTRAR, dados),
  anexosAbrir: (id: number) => invocar<void>(IPC_CHANNELS.ANEXOS_ABRIR, id),
  anexosInativar: (id: number, motivo: string) =>
    invocar<AnexoClinico>(IPC_CHANNELS.ANEXOS_INATIVAR, id, motivo),
  anexosCancelar: (token: string) => invocar<void>(IPC_CHANNELS.ANEXOS_CANCELAR, token),
  estoqueProdutosListar: () => invocar<Produto[]>(IPC_CHANNELS.ESTOQUE_PRODUTOS_LISTAR),
  estoqueProdutosCriar: (dados: DadosProduto) =>
    invocar<Produto>(IPC_CHANNELS.ESTOQUE_PRODUTOS_CRIAR, dados),
  estoqueLotesListar: () => invocar<Lote[]>(IPC_CHANNELS.ESTOQUE_LOTES_LISTAR),
  estoqueLotesCriar: (dados: DadosLote) => invocar<Lote>(IPC_CHANNELS.ESTOQUE_LOTES_CRIAR, dados),
  atualizarCliente: (dados: DadosAtualizacaoCliente) =>
    invocar<Cliente>(IPC_CHANNELS.CLIENTES_ATUALIZAR, dados),
  inativarCliente: (dados: DadosInativacao) =>
    invocar<Cliente>(IPC_CHANNELS.CLIENTES_INATIVAR, dados),
  atualizarPet: (dados: DadosAtualizacaoPet) => invocar<Pet>(IPC_CHANNELS.PETS_ATUALIZAR, dados),
  inativarPet: (dados: DadosInativacao) => invocar<Pet>(IPC_CHANNELS.PETS_INATIVAR, dados),
  listarUsuarios: () => invocar<Usuario[]>(IPC_CHANNELS.USUARIOS_LISTAR),
  atualizarUsuario: (dados: DadosAtualizacaoUsuario) =>
    invocar<Usuario>(IPC_CHANNELS.USUARIOS_ATUALIZAR, dados),
  inativarUsuario: (dados: DadosInativacao) =>
    invocar<Usuario>(IPC_CHANNELS.USUARIOS_INATIVAR, dados),
  consultasAtualizar: (dados: DadosAtualizacaoConsulta) =>
    invocar<ConsultaAgenda>(IPC_CHANNELS.CONSULTAS_ATUALIZAR, dados),
  consultasExcluir: (dados: DadosInativacao) =>
    invocar<ConsultaAgenda>(IPC_CHANNELS.CONSULTAS_EXCLUIR, dados),
  estoqueProdutosAtualizar: (dados: DadosAtualizacaoProduto) =>
    invocar<Produto>(IPC_CHANNELS.ESTOQUE_PRODUTOS_ATUALIZAR, dados),
  estoqueProdutosInativar: (dados: DadosInativacao) =>
    invocar<Produto>(IPC_CHANNELS.ESTOQUE_PRODUTOS_INATIVAR, dados),
  estoqueLotesAtualizar: (dados: DadosAtualizacaoLote) =>
    invocar<Lote>(IPC_CHANNELS.ESTOQUE_LOTES_ATUALIZAR, dados),
  estoqueLotesBaixar: (dados: DadosInativacao) =>
    invocar<Lote>(IPC_CHANNELS.ESTOQUE_LOTES_BAIXAR, dados),
  vacinasAtualizar: (dados: DadosAtualizacaoVacina) =>
    invocar<RegistroVacina>(IPC_CHANNELS.VACINAS_ATUALIZAR, dados),
  vacinasEstornar: (dados: DadosInativacao) =>
    invocar<RegistroVacina>(IPC_CHANNELS.VACINAS_ESTORNAR, dados),
  anexosAtualizar: (dados: DadosAtualizacaoAnexo) =>
    invocar<AnexoClinico>(IPC_CHANNELS.ANEXOS_ATUALIZAR, dados),
  buscarMunicipioIbge: (nome: string, uf: string) =>
    invocar<MunicipioIbge | null>(IPC_CHANNELS.API_IBGE_MUNICIPIO, nome, uf),
  listarFeriados: (ano: number) => invocar<Feriado[]>(IPC_CHANNELS.API_FERIADOS_ANO, ano),
  resumoDashboard: () => invocar<ResumoDashboard>(IPC_CHANNELS.API_RESUMO_DASHBOARD),
};

contextBridge.exposeInMainWorld('api', api);
