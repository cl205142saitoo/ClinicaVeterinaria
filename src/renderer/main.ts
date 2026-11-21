/** Ponto de entrada único do renderer: instancia e coordena os controladores. */

import { AgendaController } from './controladores/AgendaController';
import { AnexoController } from './controladores/AnexoController';
import { AuthController } from './controladores/AuthController';
import { ClienteController } from './controladores/ClienteController';
import type { ContextoApp } from './controladores/contexto';
import { EstoqueController } from './controladores/EstoqueController';
import { IntegracaoController } from './controladores/IntegracaoController';
import { PetController } from './controladores/PetController';
import { ProntuarioController } from './controladores/ProntuarioController';
import { UsuarioController } from './controladores/UsuarioController';
import { VacinaController } from './controladores/VacinaController';
import { limparInvalido, mensagemErro, mostrarToast } from './ui';

class App implements ContextoApp {
  readonly auth: AuthController;
  private readonly clientes: ClienteController;
  private readonly pets: PetController;
  private readonly agenda: AgendaController;
  private readonly prontuario: ProntuarioController;
  private readonly vacinas: VacinaController;
  private readonly estoque: EstoqueController;
  private readonly anexos: AnexoController;
  private readonly usuarios: UsuarioController;
  private readonly integracoes: IntegracaoController;
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
    this.anexos = new AnexoController(this);
    this.usuarios = new UsuarioController(this);
    this.integracoes = new IntegracaoController(this);
  }

  /** Liga os eventos uma única vez; nenhuma tela é carregada antes do login. */
  iniciar(): void {
    this.configurarValidacaoDinamica();
    this.auth.iniciar();
    this.clientes.iniciar();
    this.pets.iniciar();
    this.agenda.iniciar();
    this.prontuario.iniciar();
    this.vacinas.iniciar();
    this.estoque.iniciar();
    this.anexos.iniciar();
    this.usuarios.iniciar();
    this.integracoes.iniciar();
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

      await Promise.all([
        this.agenda.carregar(),
        this.estoque.carregar(),
        this.usuarios.carregar(),
        this.integracoes.carregar(),
      ]);

      await Promise.all([
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
  }

  /** Zera tabelas, formulários e seletores quando a sessão termina. */
  limparEstado(): void {
    this.clientes.renderizar([]);
    this.pets.renderizar([]);
    this.agenda.limpar();
    this.prontuario.limpar();
    this.vacinas.limpar();
    this.estoque.limpar();
    this.anexos.limpar();
    this.usuarios.limpar();
    this.integracoes.limpar();
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
