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

  /** Liga os eventos de login, registro e logout. */
  iniciar(): void {
    const formLogin = obrigatorio<HTMLFormElement>('#formLogin');
    const formRegistro = obrigatorio<HTMLFormElement>('#formRegistro');
    const botaoLogin = obrigatorio<HTMLButtonElement>('#btnLogin');
    const botaoRegistrar = obrigatorio<HTMLButtonElement>('#btnRegistrar');
    const botaoSair = obrigatorio<HTMLButtonElement>('#btnSair');

    formLogin.addEventListener('submit', (evento) => {
      void this.entrar(evento, formLogin, botaoLogin);
    });
    formRegistro.addEventListener('submit', (evento) => {
      void this.registrar(evento, formRegistro, botaoRegistrar);
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

  /** Esconde ações exclusivas de administrador. */
  aplicarPermissoes(): void {
    const visivel = this.isAdmin();
    document.querySelectorAll<HTMLElement>('.danger, .somente-admin').forEach((elemento) => {
      elemento.hidden = !visivel;
    });
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
      'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])'
    );
    const primeiroVisivel = Array.from(controles).find((controle) => controle.offsetParent !== null);
    (primeiroVisivel ?? obrigatorio<HTMLButtonElement>('#btnSair')).focus();
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

  private async registrar(
    evento: Event,
    formulario: HTMLFormElement,
    botao: HTMLButtonElement
  ): Promise<void> {
    evento.preventDefault();
    const nome = obrigatorio<HTMLInputElement>('#rNome');
    const email = obrigatorio<HTMLInputElement>('#rEmail');
    const senha = obrigatorio<HTMLInputElement>('#rSenha');
    limparValidacao(formulario);

    const resultados = [
      exigir(nome, nome.value.trim().length >= 2, 'Informe seu nome completo.'),
      exigir(email, email.value.trim() !== '' && email.checkValidity(), 'Informe um e-mail válido.'),
      exigir(senha, senha.value.length >= 6, 'A senha deve ter pelo menos 6 caracteres.'),
    ];
    if (!resultados.every(Boolean)) {
      focarPrimeiroInvalido(formulario);
      return;
    }

    setCarregando(botao, true, 'Cadastrando…');
    try {
      await window.api.registrarUsuario({
        nome: nome.value.trim(),
        email: email.value.trim(),
        senha: senha.value,
      });
      formulario.reset();
      limparValidacao(formulario);
      mostrarToast('Usuário criado com sucesso! Agora faça login.', 'sucesso');
      email.focus();
    } catch (erro) {
      const mensagem = mensagemErro(erro);
      marcarInvalido(email, mensagem);
      mostrarToast(mensagem, 'erro');
      email.focus();
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
