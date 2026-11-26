/** Autenticação, primeiro acesso, sessão e permissões de interface. */

import type { Usuario } from '../types';
import {
  exigir,
  focarPrimeiroInvalido,
  limparValidacao,
  marcarInvalido,
  mensagemErro,
  mostrarToast,
  obrigatorio,
  setCarregando,
} from '../ui';

export interface CallbacksAuth {
  aoAutenticar: () => void;
  aoSair: () => void;
}

export class AuthController {
  private usuarioAtual: Usuario | null = null;

  constructor(private readonly callbacks: CallbacksAuth) {}

  /** Liga os eventos de login e logout. */
  iniciar(): void {
    const formLogin = obrigatorio<HTMLFormElement>('#formLogin');
    const botaoLogin = obrigatorio<HTMLButtonElement>('#btnLogin');
    const botaoSair = obrigatorio<HTMLButtonElement>('#btnSair');

    formLogin.addEventListener('submit', (evento) => {
      void this.entrar(evento, formLogin, botaoLogin);
    });
    botaoSair.addEventListener('click', () => {
      void this.sair();
    });
  }

  /** Cópia do usuário da sessão para decisões de interface (backend valida). */
  obterUsuario(): Usuario | null {
    return this.usuarioAtual === null ? null : { ...this.usuarioAtual };
  }

  isAdmin(): boolean {
    return this.usuarioAtual?.role === 'ADMIN';
  }

  temAcessoClinico(): boolean {
    const papel = this.usuarioAtual?.role;
    return papel === 'ADMIN' || papel === 'VETERINARIO';
  }

  /** Esconde abas e ações sem permissão para o perfil autenticado. */
  aplicarPermissoes(): void {
    const admin = this.isAdmin();
    const clinico = this.temAcessoClinico();

    document.querySelectorAll<HTMLElement>('.danger, .somente-admin').forEach((elemento) => {
      elemento.hidden = !admin;
    });
    // Administração e módulos comerciais ficam só com o ADMIN.
    for (const id of ['#abaPrecos-item', '#abaOrcamentos-item', '#abaFinanceiro-item', '#abaUsuarios-item']) {
      this.definirVisibilidadeAba(id, admin);
    }

    // Prontuário e relatórios contêm dados clínicos: ADMIN e VETERINARIO.
    for (const id of ['#abaProntuario-item', '#abaRelatorios-item']) {
      this.definirVisibilidadeAba(id, clinico);
    }
  }

  /** Esconde a aba; se ela estiver ativa, devolve o painel para Clientes. */
  private definirVisibilidadeAba(itemId: string, visivel: boolean): void {
    const item = obrigatorio<HTMLElement>(itemId);
    item.hidden = !visivel;

    const tab = item.querySelector<HTMLButtonElement>('button[data-bs-target]');
    const painelId = tab?.dataset.bsTarget;
    if (visivel || painelId === undefined) return;

    const painel = document.querySelector<HTMLElement>(painelId);
    if (painel === null || !painel.classList.contains('active')) return;

    painel.classList.remove('active', 'show');
    tab?.classList.remove('active');
    tab?.setAttribute('aria-selected', 'false');

    const clientes = obrigatorio<HTMLElement>('#abaClientes');
    const clientesTab = obrigatorio<HTMLElement>('#abaClientes-tab');
    clientes.classList.add('active', 'show');
    clientesTab.classList.add('active');
    clientesTab.setAttribute('aria-selected', 'true');
  }

  /** Exibe a aplicação autenticada e move o foco para o primeiro controle útil. */
  mostrarTelaAutenticada(): void {
    obrigatorio<HTMLElement>('#telaLogin').hidden = true;
    obrigatorio<HTMLElement>('#barraUsuario').hidden = false;
    obrigatorio<HTMLElement>('#appPrincipal').hidden = false;
    obrigatorio<HTMLElement>('#infoUsuario').textContent =
      `Logado como: ${this.usuarioAtual?.nome ?? ''} (${this.usuarioAtual?.role ?? ''})`;
    this.aplicarPermissoes();
    this.focarAppAutenticado();
  }

  private focarAppAutenticado(): void {
    const app = obrigatorio<HTMLElement>('#appPrincipal');
    const controles = app.querySelectorAll<HTMLElement>(
      '#navAbas button, input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])'
    );
    const primeiroVisivel = Array.from(controles).find((controle) => {
      // Ignora os botões de navegação: queremos o primeiro campo do painel ativo.
      if (controle.closest('#navAbas')) return false;
      // Em painéis inativos o offsetParent é null; isso preserva o foco útil.
      return controle.offsetParent !== null;
    });
    (primeiroVisivel ?? obrigatorio<HTMLButtonElement>('#abaClientes-tab')).focus();
  }

  private async entrar(
    evento: Event,
    formulario: HTMLFormElement,
    botao: HTMLButtonElement
  ): Promise<void> {
    evento.preventDefault();
    const email = obrigatorio<HTMLInputElement>('#lEmail');
    const senha = obrigatorio<HTMLInputElement>('#lSenha');
    limparValidacao(formulario);

    const emailValido = exigir(email, email.value.trim() !== '' && email.checkValidity(), 'Informe um e-mail válido.');
    const senhaValida = exigir(senha, senha.value.trim() !== '', 'Informe sua senha.');
    if (!emailValido || !senhaValida) {
      focarPrimeiroInvalido(formulario);
      return;
    }

    setCarregando(botao, true, 'Entrando…');
    try {
      this.usuarioAtual = await window.api.login(email.value.trim(), senha.value);
      this.mostrarTelaAutenticada();
      mostrarToast(`Bem-vindo(a), ${this.usuarioAtual.nome}!`, 'sucesso');
      senha.value = '';
      this.callbacks.aoAutenticar();
    } catch (erro) {
      const mensagem = mensagemErro(erro);
      marcarInvalido(senha, mensagem);
      mostrarToast(mensagem, 'erro');
      senha.focus();
    } finally {
      setCarregando(botao, false);
    }
  }

  private async sair(): Promise<void> {
    try {
      await window.api.logout();
    } catch {
      // A interface é limpa mesmo se o processo principal não confirmar o logout.
    }
    this.usuarioAtual = null;
    obrigatorio<HTMLElement>('#telaLogin').hidden = false;
    obrigatorio<HTMLElement>('#barraUsuario').hidden = true;
    obrigatorio<HTMLElement>('#appPrincipal').hidden = true;
    obrigatorio<HTMLInputElement>('#lSenha').value = '';
    this.callbacks.aoSair();
    obrigatorio<HTMLInputElement>('#lEmail').focus();
  }
}
