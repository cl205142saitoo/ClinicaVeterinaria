/** Utilitários de interface: DOM seguro, validação, feedback e formatação. */

import { CLIENTE_RG_MAXIMO, ESTOQUE_PRECO_MAXIMO } from '../shared/constants';
import { extrairMensagemAplicacao } from '../shared/errors';
import { ehCpf, ehRg } from '../shared/validators';

/** Texto usado sempre que o erro não é uma falha de domínio explicitamente segura. */
const MENSAGEM_ERRO_GENERICA = 'Não foi possível concluir a operação. Tente novamente.';

/**
 * Padrões que identificam detalhes de implementação. Um `ErroAplicacao` legítimo
 * nunca deve conter stack, caminho de arquivo, SQL, host ou endereço IP.
 */
const PADROES_TECNICOS: readonly RegExp[] = [
  /\bat\s+[\w.$]+\s*\(/i,
  /\b(?:PrismaClient|Prisma|PrismaClientKnownRequestError|TypeError|ReferenceError|SyntaxError)\b/i,
  /\b(?:Error|error):\s/i,
  /\b(?:SELECT|INSERT|UPDATE|DELETE|DROP)\s+/i,
  /\bnode_modules\b/i,
  /[A-Za-z]:[\\/]/,
  /\\\\[\w.]+/,
  /\b\d{1,3}(?:\.\d{1,3}){3}\b/,
  /\b(?:ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND)\b/i,
  /\.\w{1,4}:\d+:\d+/,
  /\bstack\s*:/i,
  /=>|[{}\[\]]/,
  /0x[0-9a-f]+/i,
  /```/,
  /[\r\n]/,
];

/** Aceita apenas texto curto, de linha única, sem indícios técnicos. */
function mensagemSegura(mensagem: unknown): string {
  if (typeof mensagem !== 'string') return MENSAGEM_ERRO_GENERICA;
  const texto = mensagem.trim();
  if (texto.length < 3 || texto.length > 300) return MENSAGEM_ERRO_GENERICA;
  if (PADROES_TECNICOS.some((padrao) => padrao.test(texto))) return MENSAGEM_ERRO_GENERICA;
  return texto;
}

/**
 * Converte qualquer falha em texto seguro para a tela. Somente mensagens
 * marcadas como `ErroAplicacao` — único dado preservado pelo IPC — podem ser
 * exibidas; erros crus de Prisma, rede ou sistema recebem texto genérico.
 */
export function mensagemErro(erro: unknown): string {
  const mensagem = extrairMensagemAplicacao(erro);
  return mensagem === null ? MENSAGEM_ERRO_GENERICA : mensagemSegura(mensagem);
}

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

/** Botão de ação de tabela: todos os dados sensíveis ficam em mapas em memória. */
export function criarBotaoAcao(
  acao: string,
  id: number,
  texto: string,
  rotulo: string,
  classe = 'btn-outline-primary'
): HTMLButtonElement {
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = `btn btn-sm ${classe}`;
  botao.dataset.acao = acao;
  botao.dataset.id = String(id);
  botao.setAttribute('aria-label', rotulo);
  botao.textContent = texto;
  return botao;
}

/** Linha única de status/estado vazio, com `colspan` configurável. */
export function linhaMensagem(
  texto: string,
  colunas: number,
  classe = 'text-center text-muted fst-italic py-4'
): HTMLTableRowElement {
  const linha = document.createElement('tr');
  const celula = criarCelula(texto, classe);
  celula.colSpan = colunas;
  linha.append(celula);
  return linha;
}

export function criarBadge(texto: string, classe: string): HTMLSpanElement {
  const badge = document.createElement('span');
  badge.className = `badge ${classe}`;
  badge.textContent = texto;
  return badge;
}

export function textoOuTraco(valor: string | null | undefined): string {
  const texto = valor?.trim();
  return texto ? texto : '—';
}

/** Instante: fuso local da máquina, sem fixar `timeZone` (fuso da clínica). */
export function formatarDataHora(dataIso: string): string {
  const data = new Date(dataIso);
  return Number.isNaN(data.getTime()) ? '—' : data.toLocaleString('pt-BR');
}

/** Data civil (AAAA-MM-DD) em UTC, sem deslocar o dia por fuso horário. */
export function formatarDataCivil(valor: string | null | undefined): string {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return '—';
  const data = new Date(`${valor}T00:00:00.000Z`);
  return Number.isNaN(data.getTime()) ? '—' : data.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
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

/**
 * Compatibilidade com o helper antigo: toda ação destrutiva agora passa pelo
 * modal de motivo auditável. Retorna o motivo informado ou `null` se desistir.
 */
export function confirmarExclusao(nome: string): Promise<string | null> {
  return pedirMotivo({
    titulo: 'Confirmar exclusão',
    descricao: `Deseja realmente excluir "${nome}"? Informe o motivo desta ação para registro em auditoria.`,
    rotuloConfirmar: 'Excluir',
  });
}

export interface OpcoesMotivo {
  readonly titulo: string;
  readonly descricao: string;
  readonly rotuloConfirmar: string;
}

/**
 * Modal único para inativar, baixar, estornar ou cancelar: exige motivo
 * auditável (3 a 500 caracteres) e nunca usa `prompt`/`confirm` nativos.
 * Retorna `null` quando o usuário desiste.
 */
export function pedirMotivo(opcoes: OpcoesMotivo): Promise<string | null> {
  const modalElemento = obrigatorio<HTMLDivElement>('#modalMotivo');
  const formulario = obrigatorio<HTMLFormElement>('#formMotivo');
  const titulo = obrigatorio<HTMLElement>('#modalMotivoTitulo');
  const descricao = obrigatorio<HTMLElement>('#modalMotivoDescricao');
  const motivo = obrigatorio<HTMLTextAreaElement>('#txtMotivo');
  const confirmar = obrigatorio<HTMLButtonElement>('#btnConfirmarMotivo');
  const fechar = obrigatorio<HTMLButtonElement>('#btnFecharMotivo');

  titulo.textContent = opcoes.titulo;
  descricao.textContent = opcoes.descricao;
  confirmar.textContent = opcoes.rotuloConfirmar;
  motivo.value = '';
  limparValidacao(formulario);

  const modal = new window.bootstrap.Modal(modalElemento, { backdrop: 'static', keyboard: false });

  return new Promise<string | null>((resolve) => {
    let resolvido = false;
    const finalizar = (resposta: string | null): void => {
      if (resolvido) return;
      resolvido = true;
      confirmar.removeEventListener('click', aceitar);
      fechar.removeEventListener('click', recusar);
      modalElemento.removeEventListener('hidden.bs.modal', aoOcultar);
      modal.hide();
      resolve(resposta);
    };
    const aceitar = (): void => {
      limparValidacao(formulario);
      const texto = motivo.value.trim();
      if (!exigir(motivo, texto.length >= 3 && texto.length <= 500, 'Informe o motivo (de 3 a 500 caracteres).')) {
        motivo.focus();
        return;
      }
      finalizar(texto);
    };
    const recusar = (): void => finalizar(null);
    const aoOcultar = (): void => finalizar(null);

    confirmar.addEventListener('click', aceitar);
    fechar.addEventListener('click', recusar);
    modalElemento.addEventListener('hidden.bs.modal', aoOcultar);
    modalElemento.addEventListener('shown.bs.modal', () => motivo.focus(), { once: true });
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

/** RG: até 11 dígitos; vazio só é aceito nos campos opcionais. */
export function validarRg(campo: CampoValidavel, exigido = false): boolean {
  const texto = campo.value.trim();
  const valido = (texto === '' && !exigido) || ehRg(texto);
  return exigir(campo, valido, `O RG deve ter até ${CLIENTE_RG_MAXIMO} dígitos (somente números).`);
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

/** Formata valores em BRL; inválidos viram traço para não sugerir número errado. */
export function formatarMoeda(valor: number): string {
  return Number.isFinite(valor)
    ? valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : '—';
}

/** O backend devolve inadimplência como proporção (0 a 1); a tela mostra %. */
export function formatarPercentual(proporcao: number): string {
  if (!Number.isFinite(proporcao)) return '—';
  return `${(proporcao * 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

/**
 * Máscara de preço em BRL: aceita dígitos e uma vírgula decimal, agrupando
 * milhares com ponto. Não transforma "120" em "1,20" — o valor digitado é o
 * valor em reais.
 */
export function mascararPreco(valor: string): string {
  const texto = valor.replace(/[^\d,]/g, '');
  const partes = texto.split(',');
  const inteiros = (partes[0] ?? '').replace(/\D/g, '').slice(0, 8);
  const temVirgula = partes.length > 1;
  const decimais = temVirgula
    ? partes
        .slice(1)
        .join('')
        .replace(/\D/g, '')
        .slice(0, 2)
    : '';
  const comMilhar = inteiros.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return temVirgula ? `${comMilhar},${decimais}` : comMilhar;
}

export function aplicarMascaraPreco(campo: HTMLInputElement): void {
  campo.addEventListener('input', () => {
    campo.value = mascararPreco(campo.value);
  });
}

/** Converte o texto mascarado em number com no máximo duas casas decimais. */
export function precoOuNull(valor: string, permitirZero = true): number | null {
  const texto = valor.trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(texto)) return null;
  const numero = Number(texto);
  if (!Number.isFinite(numero) || numero > ESTOQUE_PRECO_MAXIMO) return null;
  if (!permitirZero && numero <= 0) return null;
  return numero;
}

/** Texto de preço pronto para voltar ao campo com a máscara aplicada. */
export function textoPreco(valor: number): string {
  return mascararPreco(valor.toFixed(2).replace('.', ','));
}
