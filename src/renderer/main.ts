/** Ponto de entrada único do renderer: instancia e coordena os controladores. */

import { AgendaController } from './controladores/AgendaController';
import { AnexoController } from './controladores/AnexoController';
import { AuthController } from './controladores/AuthController';
import { ClienteController } from './controladores/ClienteController';
import type { ContextoApp } from './controladores/contexto';
import { EstoqueController } from './controladores/EstoqueController';
import { FinanceiroController } from './controladores/FinanceiroController';
import { IntegracaoController } from './controladores/IntegracaoController';
import { OrcamentoController } from './controladores/OrcamentoController';
import { PetController } from './controladores/PetController';
import { ProntuarioController } from './controladores/ProntuarioController';
import { RelatorioController } from './controladores/RelatorioController';
import { TabelaPrecoController } from './controladores/TabelaPrecoController';
import { UsuarioController } from './controladores/UsuarioController';
import { VacinaController } from './controladores/VacinaController';
import { configurarVisibilidadeSenhas, limparInvalido, mensagemErro, mostrarToast } from './ui';

class App implements ContextoApp {
  readonly auth: AuthController;
  private readonly clientes: ClienteController;
  private readonly pets: PetController;
  private readonly agenda: AgendaController;
  private readonly prontuario: ProntuarioController;
  private readonly vacinas: VacinaController;
  private readonly estoque: EstoqueController;
  private readonly tabelasPreco: TabelaPrecoController;
  private readonly orcamentos: OrcamentoController;
  private readonly financeiro: FinanceiroController;
  private readonly anexos: AnexoController;
  private readonly usuarios: UsuarioController;
  private readonly integracoes: IntegracaoController;
  private readonly relatorios: RelatorioController;
  private carregando = false;

  constructor() {
    this.auth = new AuthController({
      aoAutenticar: () => void this.carregarTudo(),
      aoSair: () => this.limparEstado(),
    });
    this.clientes = new ClienteController(this);
    this.pets = new PetController(this);
    this.agenda = new AgendaController(this);
    this.prontuario = new ProntuarioController(this);
    this.vacinas = new VacinaController(this);
    this.estoque = new EstoqueController(this);
    this.tabelasPreco = new TabelaPrecoController(this);
    this.orcamentos = new OrcamentoController(this);
    this.financeiro = new FinanceiroController(this);
    this.anexos = new AnexoController(this);
    this.usuarios = new UsuarioController(this);
    this.integracoes = new IntegracaoController(this);
    this.relatorios = new RelatorioController(this);
  }

  /** Liga os eventos uma única vez; nenhuma tela é carregada antes do login. */
  iniciar(): void {
    this.configurarValidacaoDinamica();
    configurarVisibilidadeSenhas();
    this.auth.iniciar();
    this.clientes.iniciar();
    this.pets.iniciar();
    this.agenda.iniciar();
    this.prontuario.iniciar();
    this.vacinas.iniciar();
    this.estoque.iniciar();
    this.tabelasPreco.iniciar();
    this.orcamentos.iniciar();
    this.financeiro.iniciar();
    this.anexos.iniciar();
    this.usuarios.iniciar();
    this.integracoes.iniciar();
    this.relatorios.iniciar();
    this.limparEstado();
  }

  /** Alias usado pelos controladores após mutações. */
  recarregarTudo(): Promise<void> {
    return this.carregarTudo();
  }

  /** Carrega todas as telas e mantém os seletores dependentes sincronizados. */
  async carregarTudo(): Promise<void> {
    if (this.carregando) return;
    if (this.auth.obterUsuario() === null) return;
    this.carregando = true;
    try {
      const [clientes, pets] = await Promise.all([this.clientes.carregar(), this.pets.carregar()]);
      this.clientes.renderizar(clientes);
      this.pets.renderizar(pets);
      this.pets.preencherSelectClientes(clientes);
      this.agenda.preencherSelectPets(pets);
      this.prontuario.preencherSelectPets(pets);
      this.vacinas.preencherSelectPets(pets);
      this.anexos.preencherSelectPets(pets);
      this.integracoes.definirClientes(clientes);

      // Módulos administrativos não são carregados para os demais perfis:
      // além de ocultos no menu, seus canais IPC agora os bloqueiam.
      const admin = this.auth.isAdmin();
      const [orcamentos] = await Promise.all([
        admin ? this.orcamentos.carregar(clientes, pets) : Promise.resolve([]),
        admin ? this.tabelasPreco.carregar() : Promise.resolve(),
        this.agenda.carregar(),
        this.estoque.carregar(),
        admin ? this.usuarios.carregar() : Promise.resolve(),
        this.integracoes.carregar(),
        this.relatorios.carregar(),
      ]);

      await Promise.all([
        admin ? this.financeiro.carregar(orcamentos) : Promise.resolve(),
        this.prontuario.carregarSessao(),
        this.vacinas.carregarSessao(),
        this.anexos.carregarSessao(),
      ]);
    } catch (erro) {
      mostrarToast(`Não foi possível carregar os dados: ${mensagemErro(erro)}`, 'erro');
    } finally {
      this.carregando = false;
    }
  }

  async recarregarAgenda(): Promise<void> {
    if (this.auth.obterUsuario() === null) return;
    await this.agenda.carregar();
  }

  async recarregarTabelasPreco(): Promise<void> {
    if (this.auth.obterUsuario() === null || !this.auth.isAdmin()) return;
    // Uma única sincronização: a aba Preços e o seletor de orçamentos leem a mesma API.
    await Promise.all([this.tabelasPreco.carregar(), this.orcamentos.recarregarTabelas()]);
  }

  async recarregarVeterinarios(): Promise<void> {
    if (this.auth.obterUsuario() === null) return;
    await Promise.all([this.agenda.carregar(), this.anexos.recarregarResponsaveis()]);
  }

  async recarregarClientesEPets(): Promise<void> {
    if (this.auth.obterUsuario() === null) return;
    const [clientes, pets] = await Promise.all([this.clientes.carregar(), this.pets.carregar()]);
    this.clientes.renderizar(clientes);
    this.pets.renderizar(pets);
    this.pets.preencherSelectClientes(clientes);
    this.agenda.preencherSelectPets(pets);
    this.prontuario.preencherSelectPets(pets);
    this.vacinas.preencherSelectPets(pets);
    this.anexos.preencherSelectPets(pets);
    this.integracoes.definirClientes(clientes);
    this.orcamentos.definirDadosBase(clientes, pets);
  }

  /** Zera tabelas, formulários e seletores quando a sessão termina. */
  limparEstado(): void {
    this.clientes.renderizar([]);
    this.pets.renderizar([]);
    this.agenda.limpar();
    this.prontuario.limpar();
    this.vacinas.limpar();
    this.estoque.limpar();
    this.tabelasPreco.limpar();
    this.orcamentos.limpar();
    this.financeiro.limpar();
    this.anexos.limpar();
    this.usuarios.limpar();
    this.integracoes.limpar();
    this.relatorios.limpar();
    this.auth.aplicarPermissoes();
  }

  private configurarValidacaoDinamica(): void {
    const limpar = (evento: Event): void => {
      const alvo = evento.target;
      if (
        alvo instanceof HTMLInputElement ||
        alvo instanceof HTMLSelectElement ||
        alvo instanceof HTMLTextAreaElement
      ) {
        if (alvo.classList.contains('is-invalid')) limparInvalido(alvo);
      }
    };
    document.addEventListener('input', limpar);
    document.addEventListener('change', limpar);
  }
}

new App().iniciar();
