/** Utilitários de interface: DOM seguro, validação, feedback e formatação. */

import { ehCpf } from '../shared/validators';

export function obrigatorio<T extends Element>(seletor: string): T {
  const elemento = document.querySelector<T>(seletor);
  if (!elemento) {
    throw new Error(`Elemento obrigatório não encontrado: ${seletor}`);
  }
  return elemento;
}

/** Escapa texto que, por algum motivo, precise ser gravado em HTML. */
export function escapeHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function mensagemErro(erro: unknown): string {
  return erro instanceof Error && erro.message.trim() ? erro.message : 'Ocorreu um erro inesperado. Tente novamente.';
}

export function criarCelula(texto: string, classe = ''): HTMLTableCellElement {
  const celula = document.createElement('td');
  if (classe) celula.className = classe;
  celula.textContent = texto;
  return celula;
}

export function criarBotaoExcluir(tipo: 'cliente' | 'pet', id: number, nome: string): HTMLButtonElement {
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 'btn btn-sm btn-outline-danger danger';
  botao.dataset.excluir = tipo;
  botao.dataset.id = String(id);
  botao.dataset.nome = nome;
  botao.setAttribute('aria-label', `Excluir ${tipo} ${nome}`);
  botao.textContent = 'Excluir';
  return botao;
}

/** Campos que participam da validação visual padronizada do renderer. */
export type CampoValidavel = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export function marcarInvalido(campo: CampoValidavel, mensagem: string): void {
  campo.classList.add('is-invalid');
  campo.setAttribute('aria-invalid', 'true');
  const feedback = campo.parentElement?.querySelector<HTMLElement>('.invalid-feedback');
  if (feedback) feedback.textContent = mensagem;
}

export function limparInvalido(campo: CampoValidavel): void {
  campo.classList.remove('is-invalid');
  campo.removeAttribute('aria-invalid');
  const feedback = campo.parentElement?.querySelector<HTMLElement>('.invalid-feedback');
  if (feedback) feedback.textContent = '';
}

/** Registra o resultado da validação no próprio campo. */
export function exigir(
  campo: CampoValidavel,
  valido: boolean,
  mensagem: string
): boolean {
  if (valido) {
    limparInvalido(campo);
    return true;
  }
  marcarInvalido(campo, mensagem);
  return false;
}

export function limparValidacao(formulario: HTMLFormElement): void {
  formulario.querySelectorAll<CampoValidavel>('.is-invalid').forEach((campo) => {
    limparInvalido(campo);
  });
}

export function focarPrimeiroInvalido(formulario: HTMLFormElement): void {
  const invalido = formulario.querySelector<CampoValidavel>('.is-invalid');
  invalido?.focus();
}

const textosOriginais = new WeakMap<HTMLButtonElement, string>();

export function setCarregando(botao: HTMLButtonElement, ativo: boolean, texto = 'Carregando…'): void {
  if (ativo) {
    if (!textosOriginais.has(botao)) textosOriginais.set(botao, botao.textContent ?? '');
    botao.disabled = true;
    botao.setAttribute('aria-busy', 'true');
    botao.textContent = texto;
  } else {
    botao.disabled = false;
    botao.removeAttribute('aria-busy');
    botao.textContent = textosOriginais.get(botao) ?? botao.textContent ?? '';
    textosOriginais.delete(botao);
  }
}

type TipoToast = 'sucesso' | 'erro' | 'info';

const classesToast: Record<TipoToast, string> = {
  sucesso: 'text-bg-success',
  erro: 'text-bg-danger',
  info: 'text-bg-info',
};

export function mostrarToast(mensagem: string, tipo: TipoToast = 'info'): void {
  const container = obrigatorio<HTMLDivElement>('#toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast align-items-center border-0 ${classesToast[tipo]}`;
  toast.setAttribute('role', tipo === 'erro' ? 'alert' : 'status');
  toast.setAttribute('aria-live', tipo === 'erro' ? 'assertive' : 'polite');

  const conteudo = document.createElement('div');
  conteudo.className = 'd-flex';
  const corpo = document.createElement('div');
  corpo.className = 'toast-body';
  corpo.textContent = mensagem;
  const fechar = document.createElement('button');
  fechar.type = 'button';
  fechar.className = 'btn-close btn-close-white me-2 m-auto';
  fechar.setAttribute('data-bs-dismiss', 'toast');
  fechar.setAttribute('aria-label', 'Fechar aviso');
  conteudo.append(corpo, fechar);
  toast.append(conteudo);
  container.append(toast);

  toast.addEventListener('hidden.bs.toast', () => toast.remove(), { once: true });
  new window.bootstrap.Toast(toast, { delay: 5000 }).show();
}

export function confirmarExclusao(nome: string): Promise<boolean> {
  const modalElemento = obrigatorio<HTMLDivElement>('#modalConfirmacao');
  const descricao = obrigatorio<HTMLElement>('#modalConfirmacaoDescricao');
  const confirmar = obrigatorio<HTMLButtonElement>('#btnConfirmarExclusao');
  const cancelar = obrigatorio<HTMLButtonElement>('#btnCancelarExclusao');

  descricao.textContent = `Deseja realmente excluir "${nome}"? Esta ação não pode ser desfeita.`;
  const modal = new window.bootstrap.Modal(modalElemento, { backdrop: 'static', keyboard: false });

  return new Promise<boolean>((resolve) => {
    const concluir = (resposta: boolean): void => {
      confirmar.removeEventListener('click', aceitar);
      cancelar.removeEventListener('click', recusar);
      modal.hide();
      resolve(resposta);
    };
    const aceitar = (): void => concluir(true);
    const recusar = (): void => concluir(false);

    confirmar.addEventListener('click', aceitar, { once: true });
    cancelar.addEventListener('click', recusar, { once: true });
    modalElemento.addEventListener('shown.bs.modal', () => confirmar.focus(), { once: true });
    modal.show();
  });
}

export function somenteDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

export function formatarCpf(valor: string): string {
  const digitos = somenteDigitos(valor).slice(0, 11);
  if (digitos.length <= 3) return digitos;
  if (digitos.length <= 6) return digitos.replace(/^(\d{3})(\d{1,3})$/, '$1.$2');
  if (digitos.length <= 9) return digitos.replace(/^(\d{3})(\d{3})(\d{1,3})$/, '$1.$2.$3');
  return digitos.replace(/^(\d{3})(\d{3})(\d{3})(\d{1,2})$/, '$1.$2.$3-$4');
}

/** Exibe apenas os dois últimos dígitos: o número completo não é necessário na tela. */
export function mascararCpf(valor: string): string {
  const digitos = somenteDigitos(valor);
  if (digitos.length !== 11) return '***.***.***-**';
  return `***.***.***-${digitos.slice(-2)}`;
}

export function formatarCep(valor: string): string {
  const digitos = somenteDigitos(valor).slice(0, 8);
  return digitos.length > 5 ? digitos.replace(/^(\d{5})(\d{1,3})$/, '$1-$2') : digitos;
}

export function formatarTelefone(valor: string): string {
  const digitos = somenteDigitos(valor).slice(0, 11);
  if (!digitos) return '';
  if (digitos.length <= 2) return `(${digitos}`;
  if (digitos.length <= 6) return `(${digitos.slice(0, 2)}) ${digitos.slice(2)}`;
  if (digitos.length <= 10) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
  return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7, 11)}`;
}

export function aplicarMascara(campo: HTMLInputElement, formatador: (valor: string) => string): void {
  campo.addEventListener('input', () => {
    campo.value = formatador(campo.value);
  });
}

export function cpfValido(valor: string): boolean {
  return ehCpf(valor);
}

export function cepValido(valor: string): boolean {
  return somenteDigitos(valor).length === 8;
}

export function telefoneValido(valor: string): boolean {
  const quantidade = somenteDigitos(valor).length;
  return quantidade === 10 || quantidade === 11;
}

export function pesoValido(valor: string): boolean {
  const peso = Number(valor.replace(',', '.'));
  return valor.trim() !== '' && Number.isFinite(peso) && peso > 0;
}
