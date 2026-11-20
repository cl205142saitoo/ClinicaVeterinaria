/** Type guards de fronteira: nenhum dado do renderer é confiável. */

import {
  ANEXO_CATEGORIAS,
  ANEXO_DESCRICAO_MAXIMO,
  ANEXO_DESCRICAO_MINIMO,
  ESTOQUE_CATEGORIA_MAXIMO,
  ESTOQUE_CODIGO_LOTE_MAXIMO,
  ESTOQUE_NOME_MAXIMO,
  ESTOQUE_PRECO_MAXIMO,
  PRONTUARIO_TEMPERATURA_MAXIMA_C,
  PRONTUARIO_TEMPERATURA_MINIMA_C,
  PRONTUARIO_TEXTO_MAXIMO,
  PRONTUARIO_TEXTO_MINIMO,
  STATUS_CANCELAVEIS,
  STATUS_CONCLUIVEIS,
  STATUS_CONSULTA,
  VACINA_DOSE_MAXIMO,
  VACINA_FABRICANTE_MAXIMO,
  VACINA_LOTE_MAXIMO,
  VACINA_NOME_MAXIMO,
  VACINA_OBSERVACOES_MAXIMO,
  VACINA_REACAO_MAXIMO,
} from './constants';
import { ErroAplicacao } from './errors';
import type {
  CategoriaAnexo,
  DadosCliente,
  DadosConsulta,
  DadosLote,
  DadosPet,
  DadosProduto,
  DadosProntuario,
  DadosRegistro,
  DadosRegistroAnexo,
  DadosRegistroVacina,
  FiltroAgenda,
  Role,
  StatusConsulta,
} from './types';

export function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function digitoVerificadorCpf(base: string): number {
  let soma = 0;
  for (let indice = 0; indice < base.length; indice += 1) {
    soma += Number(base.charAt(indice)) * (base.length + 1 - indice);
  }
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
}

function ehTexto(valor: unknown, minimo: number, maximo: number): valor is string {
  return typeof valor === 'string' && valor.trim().length >= minimo && valor.trim().length <= maximo;
}

export function ehCpf(valor: unknown): valor is string {
  if (typeof valor !== 'string') return false;
  const digitos = valor.replace(/\D/g, '');
  if (digitos.length !== 11 || /^(\d)\1{10}$/.test(digitos)) return false;

  return (
    digitoVerificadorCpf(digitos.slice(0, 9)) === Number(digitos.charAt(9)) &&
    digitoVerificadorCpf(digitos.slice(0, 10)) === Number(digitos.charAt(10))
  );
}

function ehTelefone(valor: unknown): valor is string {
  return typeof valor === 'string' && /^\d{10,11}$/.test(valor.replace(/\D/g, ''));
}

function ehUf(valor: unknown): valor is string {
  return typeof valor === 'string' && /^[A-Za-z]{2}$/.test(valor.trim());
}

export function ehIdPositivo(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isInteger(valor) && valor > 0;
}

export function ehCep(valor: unknown): valor is string {
  return typeof valor === 'string' && /^\d{8}$/.test(valor.replace(/\D/g, ''));
}

export function ehEmail(valor: unknown): valor is string {
  return (
    typeof valor === 'string' &&
    valor.trim().length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor.trim())
  );
}

export function ehSenha(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.length >= 6 && valor.length <= 128;
}

export function ehSenhaPreenchida(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.length > 0 && valor.length <= 128;
}

const RE_DATA_ISO =
  /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/;

/** Aceita ISO 8601 com hora e fuso explícitos; o instante é comparado em UTC. */
export function ehDataIso(valor: unknown): valor is string {
  if (typeof valor !== 'string' || !RE_DATA_ISO.test(valor) || !Number.isFinite(Date.parse(valor))) {
    return false;
  }
  const [ano, mes, dia] = valor.slice(0, 10).split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
}

const RE_DATA_CIVIL = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Aceita apenas YYYY-MM-DD com dia real, sem interpretar fuso horário. */
export function ehDataCivil(valor: unknown): valor is string {
  if (typeof valor !== 'string' || !RE_DATA_CIVIL.test(valor)) return false;
  const [ano, mes, dia] = valor.split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
}

export function ehStatusConsulta(valor: unknown): valor is StatusConsulta {
  return typeof valor === 'string' && STATUS_CONSULTA.some((status) => status === valor);
}

export function ehStatusCancelavel(valor: unknown): valor is StatusConsulta {
  return typeof valor === 'string' && STATUS_CANCELAVEIS.some((status) => status === valor);
}

export function ehStatusConcluivel(valor: unknown): valor is StatusConsulta {
  return typeof valor === 'string' && STATUS_CONCLUIVEIS.some((status) => status === valor);
}

export function ehRole(valor: unknown): valor is Role {
  return valor === 'ADMIN' || valor === 'VETERINARIO' || valor === 'ATENDENTE';
}

export function ehDadosCliente(valor: unknown): valor is DadosCliente {
  if (!ehObjeto(valor)) return false;
  return (
    ehTexto(valor.nome, 2, 120) &&
    ehCpf(valor.cpf) &&
    ehTelefone(valor.telefone) &&
    ehCep(valor.cep) &&
    ehTexto(valor.logradouro, 1, 200) &&
    typeof valor.bairro === 'string' &&
    valor.bairro.trim().length <= 120 &&
    ehTexto(valor.cidade, 1, 120) &&
    ehUf(valor.uf) &&
    typeof valor.aceiteLgpd === 'boolean'
  );
}

export function ehDadosPet(valor: unknown): valor is DadosPet {
  if (!ehObjeto(valor)) return false;
  return (
    ehIdPositivo(valor.clienteId) &&
    ehTexto(valor.nome, 2, 120) &&
    ehTexto(valor.especie, 1, 80) &&
    typeof valor.raca === 'string' &&
    valor.raca.trim().length <= 120 &&
    typeof valor.peso === 'number' &&
    Number.isFinite(valor.peso) &&
    valor.peso > 0 &&
    (valor.nascimento === undefined ||
      (typeof valor.nascimento === 'string' && valor.nascimento.length <= 20))
  );
}

export function ehDadosRegistro(valor: unknown): valor is DadosRegistro {
  if (!ehObjeto(valor)) return false;
  return ehTexto(valor.nome, 2, 120) && ehEmail(valor.email) && ehSenha(valor.senha);
}

export function ehDadosConsulta(valor: unknown): valor is DadosConsulta {
  if (!ehObjeto(valor)) return false;
  return (
    ehIdPositivo(valor.petId) &&
    ehIdPositivo(valor.veterinarioId) &&
    ehDataIso(valor.dataHora) &&
    ehTexto(valor.motivo, 3, 500)
  );
}

export function ehFiltroAgenda(valor: unknown): valor is FiltroAgenda {
  if (!ehObjeto(valor)) return false;
  return (
    (valor.de === undefined || ehDataIso(valor.de)) &&
    (valor.ate === undefined || ehDataIso(valor.ate))
  );
}

export function ehMotivoCancelamento(valor: unknown): valor is string {
  return ehTexto(valor, 3, 500);
}

export function ehDuracaoMinutos(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isInteger(valor) && valor > 0 && valor <= 1440;
}

function ehTextoProntuario(valor: unknown): valor is string {
  return ehTexto(valor, PRONTUARIO_TEXTO_MINIMO, PRONTUARIO_TEXTO_MAXIMO);
}

function ehPesoAferido(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor) && valor > 0;
}

function ehTemperaturaC(valor: unknown): valor is number {
  return (
    typeof valor === 'number' &&
    Number.isFinite(valor) &&
    valor >= PRONTUARIO_TEMPERATURA_MINIMA_C &&
    valor <= PRONTUARIO_TEMPERATURA_MAXIMA_C
  );
}

/** Campos opcionais aceitam ausência ou `null` para limpar a aferição. */
function ehOpcional(valor: unknown, guarda: (valor: unknown) => valor is number): boolean {
  return valor === undefined || valor === null || guarda(valor);
}

export function ehDadosProntuario(valor: unknown): valor is DadosProntuario {
  if (!ehObjeto(valor)) return false;
  return (
    ehIdPositivo(valor.consultaId) &&
    ehTextoProntuario(valor.exameClinico) &&
    ehTextoProntuario(valor.diagnostico) &&
    ehTextoProntuario(valor.conduta) &&
    ehOpcional(valor.pesoAferido, ehPesoAferido) &&
    ehOpcional(valor.temperaturaC, ehTemperaturaC)
  );
}

function ehIdOpcional(valor: unknown): boolean {
  return valor === undefined || valor === null || ehIdPositivo(valor);
}

/** Texto livre opcional: vazio é aceito aqui e normalizado no service. */
function ehTextoOpcional(valor: unknown, maximo: number): boolean {
  return valor === undefined || valor === null || (typeof valor === 'string' && valor.length <= maximo);
}

export function ehDadosRegistroVacina(valor: unknown): valor is DadosRegistroVacina {
  if (!ehObjeto(valor)) return false;
  return (
    ehIdPositivo(valor.petId) &&
    ehIdOpcional(valor.consultaId) &&
    ehIdOpcional(valor.veterinarioId) &&
    ehTexto(valor.vacina, 2, VACINA_NOME_MAXIMO) &&
    ehTexto(valor.fabricante, 2, VACINA_FABRICANTE_MAXIMO) &&
    ehTexto(valor.lote, 1, VACINA_LOTE_MAXIMO) &&
    ehTexto(valor.dose, 1, VACINA_DOSE_MAXIMO) &&
    ehDataCivil(valor.validade) &&
    ehDataIso(valor.aplicadaEm) &&
    (valor.proximaDose === undefined ||
      valor.proximaDose === null ||
      ehDataCivil(valor.proximaDose)) &&
    ehTextoOpcional(valor.reacao, VACINA_REACAO_MAXIMO) &&
    ehTextoOpcional(valor.observacoes, VACINA_OBSERVACOES_MAXIMO)
  );
}

export function ehDadosProduto(valor: unknown): valor is DadosProduto {
  if (!ehObjeto(valor)) return false;
  const preco = valor.precoBrl;
  return (
    ehTexto(valor.nome, 2, ESTOQUE_NOME_MAXIMO) &&
    ehTexto(valor.categoria, 1, ESTOQUE_CATEGORIA_MAXIMO) &&
    typeof valor.estoqueMinimo === 'number' &&
    Number.isInteger(valor.estoqueMinimo) &&
    valor.estoqueMinimo >= 0 &&
    valor.estoqueMinimo <= 1_000_000 &&
    typeof preco === 'number' &&
    Number.isFinite(preco) &&
    preco >= 0 &&
    preco <= ESTOQUE_PRECO_MAXIMO &&
    Math.abs(preco * 100 - Math.round(preco * 100)) <= 1e-9
  );
}

export function ehDadosLote(valor: unknown): valor is DadosLote {
  if (!ehObjeto(valor)) return false;
  return (
    ehIdPositivo(valor.produtoId) &&
    ehTexto(valor.codigo, 1, ESTOQUE_CODIGO_LOTE_MAXIMO) &&
    ehDataCivil(valor.validade) &&
    typeof valor.quantidade === 'number' &&
    Number.isInteger(valor.quantidade) &&
    valor.quantidade > 0
  );
}

export function ehCategoriaAnexo(valor: unknown): valor is CategoriaAnexo {
  return typeof valor === 'string' && ANEXO_CATEGORIAS.some((categoria) => categoria === valor);
}

export function ehDadosRegistroAnexo(valor: unknown): valor is DadosRegistroAnexo {
  if (!ehObjeto(valor)) return false;
  return (
    typeof valor.token === 'string' &&
    valor.token.trim().length > 0 &&
    ehIdPositivo(valor.petId) &&
    ehIdOpcional(valor.consultaId) &&
    ehIdOpcional(valor.responsavelId) &&
    ehTexto(valor.descricao, ANEXO_DESCRICAO_MINIMO, ANEXO_DESCRICAO_MAXIMO) &&
    ehCategoriaAnexo(valor.categoria) &&
    ehDataCivil(valor.dataDocumento)
  );
}

export function exigir<T>(valor: unknown, guarda: (valor: unknown) => valor is T, mensagem: string): T {
  if (!guarda(valor)) {
    throw new ErroAplicacao(mensagem);
  }
  return valor;
}
