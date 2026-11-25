import { contextBridge } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import type {
  AlertaVacina,
  AnexoClinico,
  Api,
  ArquivoAnexoSelecionado,
  Cliente,
  ConsultaAgenda,
  ConsultaProntuario,
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
  DadosLote,
  DadosMovimentacao,
  DadosNovoUsuario,
  DadosOrcamento,
  DadosPet,
  DadosProduto,
  DadosProntuario,
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
  Lote,
  MovimentacaoFinanceira,
  MunicipioIbge,
  Orcamento,
  OrigemHistoricoPreco,
  Pet,
  Produto,
  RegistroVacina,
  RelatorioDados,
  ResultadoEnvioAvisos,
  ResultadoExportacaoCsv,
  ResultadoExportacaoTxt,
  ResumoDashboard,
  ResumoFinanceiro,
  TabelaPreco,
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
  prontuarioExportarTxt: (consultaId: number) =>
    invocar<ResultadoExportacaoTxt | null>(IPC_CHANNELS.PRONTUARIO_EXPORTAR_TXT, consultaId),
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
  reativarCliente: (id: number) => invocar<Cliente>(IPC_CHANNELS.CLIENTES_REATIVAR, id),
  atualizarPet: (dados: DadosAtualizacaoPet) => invocar<Pet>(IPC_CHANNELS.PETS_ATUALIZAR, dados),
  inativarPet: (dados: DadosInativacao) => invocar<Pet>(IPC_CHANNELS.PETS_INATIVAR, dados),
  reativarPet: (id: number) => invocar<Pet>(IPC_CHANNELS.PETS_REATIVAR, id),
  listarUsuarios: () => invocar<Usuario[]>(IPC_CHANNELS.USUARIOS_LISTAR),
  criarUsuario: (dados: DadosNovoUsuario) => invocar<Usuario>(IPC_CHANNELS.USUARIOS_CRIAR, dados),
  atualizarUsuario: (dados: DadosAtualizacaoUsuario) =>
    invocar<Usuario>(IPC_CHANNELS.USUARIOS_ATUALIZAR, dados),
  inativarUsuario: (dados: DadosInativacao) =>
    invocar<Usuario>(IPC_CHANNELS.USUARIOS_INATIVAR, dados),
  reativarUsuario: (id: number) => invocar<Usuario>(IPC_CHANNELS.USUARIOS_REATIVAR, id),
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
  vacinasAlertas: () => invocar<AlertaVacina[]>(IPC_CHANNELS.VACINAS_ALERTAS),
  vacinasEnviarAvisos: () =>
    invocar<ResultadoEnvioAvisos>(IPC_CHANNELS.VACINAS_ENVIAR_AVISOS),
  cotacaoDolar: () => invocar<CotacaoDolar>(IPC_CHANNELS.API_COTACAO_DOLAR),
  relatorioGerar: (filtro: FiltroRelatorio) =>
    invocar<RelatorioDados>(IPC_CHANNELS.RELATORIOS_GERAR, filtro),
  relatorioExportarCsv: (filtro: FiltroRelatorio) =>
    invocar<ResultadoExportacaoCsv | null>(IPC_CHANNELS.RELATORIOS_EXPORTAR_CSV, filtro),
  tabelaPrecoListar: () => invocar<TabelaPreco[]>(IPC_CHANNELS.PRECOS_TABELA_LISTAR),
  tabelaPrecoCriar: (dados: DadosTabelaPreco) =>
    invocar<TabelaPreco>(IPC_CHANNELS.PRECOS_TABELA_CRIAR, dados),
  tabelaPrecoAtualizar: (dados: DadosAtualizacaoTabelaPreco) =>
    invocar<TabelaPreco>(IPC_CHANNELS.PRECOS_TABELA_ATUALIZAR, dados),
  tabelaPrecoInativar: (dados: DadosInativacao) =>
    invocar<TabelaPreco>(IPC_CHANNELS.PRECOS_TABELA_INATIVAR, dados),
  tabelaPrecoReativar: (id: number) =>
    invocar<TabelaPreco>(IPC_CHANNELS.PRECOS_TABELA_REATIVAR, id),
  historicoPrecoListar: (origem?: OrigemHistoricoPreco, origemId?: number) =>
    invocar<HistoricoPreco[]>(IPC_CHANNELS.PRECOS_HISTORICO_LISTAR, origem, origemId),
  orcamentosListar: () => invocar<Orcamento[]>(IPC_CHANNELS.ORCAMENTOS_LISTAR),
  orcamentoCriar: (dados: DadosOrcamento) =>
    invocar<Orcamento>(IPC_CHANNELS.ORCAMENTOS_CRIAR, dados),
  orcamentoAtualizar: (dados: DadosAtualizacaoOrcamento) =>
    invocar<Orcamento>(IPC_CHANNELS.ORCAMENTOS_ATUALIZAR, dados),
  orcamentoDefinirStatus: (dados: DadosStatusOrcamento) =>
    invocar<Orcamento>(IPC_CHANNELS.ORCAMENTOS_DEFINIR_STATUS, dados),
  orcamentoCancelar: (dados: DadosInativacao) =>
    invocar<Orcamento>(IPC_CHANNELS.ORCAMENTOS_CANCELAR, dados),
  movimentacoesListar: () =>
    invocar<MovimentacaoFinanceira[]>(IPC_CHANNELS.FINANCEIRO_LISTAR),
  movimentacaoCriar: (dados: DadosMovimentacao) =>
    invocar<MovimentacaoFinanceira>(IPC_CHANNELS.FINANCEIRO_CRIAR, dados),
  movimentacaoAtualizar: (dados: DadosAtualizacaoMovimentacao) =>
    invocar<MovimentacaoFinanceira>(IPC_CHANNELS.FINANCEIRO_ATUALIZAR, dados),
  movimentacaoBaixar: (dados: DadosBaixaMovimentacao) =>
    invocar<MovimentacaoFinanceira>(IPC_CHANNELS.FINANCEIRO_BAIXAR, dados),
  movimentacaoCancelar: (dados: DadosInativacao) =>
    invocar<MovimentacaoFinanceira>(IPC_CHANNELS.FINANCEIRO_CANCELAR, dados),
  resumoFinanceiro: () => invocar<ResumoFinanceiro>(IPC_CHANNELS.FINANCEIRO_RESUMO),
};

contextBridge.exposeInMainWorld('api', api);
