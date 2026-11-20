/** Autenticação, primeiro acesso e controle de permissões por perfil. */

import type { Usuario } from './types';
import {
  exigir,
  focarPrimeiroInvalido,
  limparValidacao,
  marcarInvalido,
  mensagemErro,
  mostrarToast,
  obrigatorio,
  setCarregando,
} from './ui';

export interface CallbacksAuth {
  aoAutenticar: () => void;
  aoSair: () => void;
}

let usuarioAtual: Usuario | null = null;

export function isAdmin(): boolean {
  return usuarioAtual?.role === 'ADMIN';
}

/** Cópia do usuário da sessão para decisões de interface (o backend continua validando). */
export function obterUsuario(): Usuario | null {
  return usuarioAtual === null ? null : { ...usuarioAtual };
}

/** Esconde as ações exclusivas de administrador. */
export function aplicarPermissoes(): void {
  document.querySelectorAll<HTMLElement>('.danger').forEach((botao) => {
    botao.hidden = !isAdmin();
  });
}

/** Move o foco para o conteúdo autenticado, não para um campo da tela oculta. */
function focarAppAutenticado(): void {
  const app = obrigatorio<HTMLElement>('#appPrincipal');
  const controles = app.querySelectorAll<HTMLElement>(
    'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])'
  );
  const primeiroVisivel = Array.from(controles).find((controle) => controle.offsetParent !== null);
  (primeiroVisivel ?? obrigatorio<HTMLButtonElement>('#btnSair')).focus();
}

function mostrarTelaAutenticada(): void {
  obrigatorio<HTMLElement>('#telaLogin').hidden = true;
  obrigatorio<HTMLElement>('#barraUsuario').hidden = false;
  obrigatorio<HTMLElement>('#appPrincipal').hidden = false;
  obrigatorio<HTMLElement>('#infoUsuario').textContent =
    `Logado como: ${usuarioAtual?.nome ?? ''} (${usuarioAtual?.role ?? ''})`;
  aplicarPermissoes();
  focarAppAutenticado();
}

export function iniciarAuth(callbacks: CallbacksAuth): void {
  const formLogin = obrigatorio<HTMLFormElement>('#formLogin');
  const formRegistro = obrigatorio<HTMLFormElement>('#formRegistro');
  const botaoLogin = obrigatorio<HTMLButtonElement>('#btnLogin');
  const botaoRegistrar = obrigatorio<HTMLButtonElement>('#btnRegistrar');
  const botaoSair = obrigatorio<HTMLButtonElement>('#btnSair');

  formLogin.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const email = obrigatorio<HTMLInputElement>('#lEmail');
    const senha = obrigatorio<HTMLInputElement>('#lSenha');
    limparValidacao(formLogin);

    const emailValido = exigir(email, email.value.trim() !== '' && email.checkValidity(), 'Informe um e-mail válido.');
    const senhaValida = exigir(senha, senha.value.trim() !== '', 'Informe sua senha.');
    if (!emailValido || !senhaValida) {
      focarPrimeiroInvalido(formLogin);
      return;
    }

    setCarregando(botaoLogin, true, 'Entrando…');
    try {
      usuarioAtual = await window.api.login(email.value.trim(), senha.value);
      mostrarTelaAutenticada();
      mostrarToast(`Bem-vindo(a), ${usuarioAtual.nome}!`, 'sucesso');
      senha.value = '';
      callbacks.aoAutenticar();
    } catch (erro) {
      const mensagem = mensagemErro(erro);
      marcarInvalido(senha, mensagem);
      mostrarToast(mensagem, 'erro');
      senha.focus();
    } finally {
      setCarregando(botaoLogin, false);
    }
  });

  formRegistro.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const nome = obrigatorio<HTMLInputElement>('#rNome');
    const email = obrigatorio<HTMLInputElement>('#rEmail');
    const senha = obrigatorio<HTMLInputElement>('#rSenha');
    limparValidacao(formRegistro);

    const resultados = [
      exigir(nome, nome.value.trim().length >= 2, 'Informe seu nome completo.'),
      exigir(email, email.value.trim() !== '' && email.checkValidity(), 'Informe um e-mail válido.'),
      exigir(senha, senha.value.length >= 6, 'A senha deve ter pelo menos 6 caracteres.'),
    ];
    if (!resultados.every(Boolean)) {
      focarPrimeiroInvalido(formRegistro);
      return;
    }

    setCarregando(botaoRegistrar, true, 'Cadastrando…');
    try {
      await window.api.registrarUsuario({
        nome: nome.value.trim(),
        email: email.value.trim(),
        senha: senha.value,
      });
      formRegistro.reset();
      limparValidacao(formRegistro);
      mostrarToast('Usuário criado com sucesso! Agora faça login.', 'sucesso');
      email.focus();
    } catch (erro) {
      const mensagem = mensagemErro(erro);
      marcarInvalido(email, mensagem);
      mostrarToast(mensagem, 'erro');
      email.focus();
    } finally {
      setCarregando(botaoRegistrar, false);
    }
  });

  botaoSair.addEventListener('click', async () => {
    try {
      await window.api.logout();
    } catch {
      // A interface é limpa mesmo se o processo principal não confirmar o logout.
    }
    usuarioAtual = null;
    obrigatorio<HTMLElement>('#telaLogin').hidden = false;
    obrigatorio<HTMLElement>('#barraUsuario').hidden = true;
    obrigatorio<HTMLElement>('#appPrincipal').hidden = true;
    obrigatorio<HTMLInputElement>('#lSenha').value = '';
    callbacks.aoSair();
    obrigatorio<HTMLInputElement>('#lEmail').focus();
  });
}
