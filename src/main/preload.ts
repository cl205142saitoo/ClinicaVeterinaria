import { contextBridge } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import type {
  AnexoClinico,
  Api,
  ArquivoAnexoSelecionado,
  Cliente,
  ConsultaAgenda,
  ConsultaProntuario,
  DadosCliente,
  DadosConsulta,
  DadosLote,
  DadosPet,
  DadosProduto,
  DadosProntuario,
  DadosRegistro,
  DadosRegistroAnexo,
  DadosRegistroVacina,
  Endereco,
  FiltroAgenda,
  Lote,
  Pet,
  Produto,
  RegistroVacina,
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
};

contextBridge.exposeInMainWorld('api', api);
