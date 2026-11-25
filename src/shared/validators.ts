/** Type guards de fronteira: nenhum dado do renderer é confiável. */

import {
  ANEXO_CATEGORIAS,
  ANEXO_DESCRICAO_MAXIMO,
  ANEXO_DESCRICAO_MINIMO,
  CLIENTE_NASCIMENTO_ANO_MINIMO,
  CLIENTE_RG_MAXIMO,
  ESTOQUE_CATEGORIA_MAXIMO,
  ESTOQUE_CODIGO_LOTE_MAXIMO,
  ESTOQUE_NOME_MAXIMO,
  ESTOQUE_PRECO_MAXIMO,
  FORMA_PAGAMENTO_MAXIMA,
  ITEM_QUANTIDADE_MAXIMA,
  MOVIMENTACAO_STATUS,
  MOVIMENTACAO_TIPOS,
  ORCAMENTO_STATUS,
  ORIGEM_HISTORICO_PRECO,
  PET_IDADE_MAXIMA_ANOS,
  PRECO_ITEM_TIPOS,
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
import { dataCivilClinica } from './datas';
import { ErroAplicacao } from './errors';
import type {
  CategoriaAnexo,
  DadosAtualizacaoAnexo,
  DadosAtualizacaoCliente,
  DadosAtualizacaoConsulta,
  DadosAtualizacaoLote,
  DadosAtualizacaoPet,
  DadosAtualizacaoProduto,
  DadosAtualizacaoUsuario,
  DadosAtualizacaoVacina,
  DadosAtualizacaoMovimentacao,
  DadosAtualizacaoOrcamento,
  DadosAtualizacaoTabelaPreco,
  DadosBaixaMovimentacao,
  DadosCliente,
  DadosConsulta,
  DadosInativacao,
  DadosItemOrcamento,
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
  FiltroAgenda,
  FiltroRelatorio,
  OrigemHistoricoPreco,
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

const RE_RG = new RegExp(`^\\d{1,${CLIENTE_RG_MAXIMO}}$`);

const RE_DATA_CIVIL = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Aceita apenas YYYY-MM-DD com dia real, sem interpretar fuso horário. */
export function ehDataCivil(valor: unknown): valor is string {
  if (typeof valor !== 'string' || !RE_DATA_CIVIL.test(valor)) return false;
  const [ano, mes, dia] = valor.split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
}

/** RG: até 11 dígitos numéricos, limite aceito no cadastro. */
export function ehRg(valor: unknown): valor is string {
  return typeof valor === 'string' && RE_RG.test(valor);
}

/** Data de nascimento: civil válida, não futura e dentro de faixa plausível. */
export function ehDataNascimento(valor: unknown): valor is string {
  if (!ehDataCivil(valor)) return false;
  const ano = Number(valor.slice(0, 4));
  return ano >= CLIENTE_NASCIMENTO_ANO_MINIMO && valor <= dataCivilClinica(new Date());
}

/** Idade do pet em anos, inteira e compatível com o CHECK do banco. */
export function ehIdadePet(valor: unknown): valor is number {
  return (
    typeof valor === 'number' &&
    Number.isInteger(valor) &&
    valor >= 0 &&
    valor <= PET_IDADE_MAXIMA_ANOS
  );
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
    ehRg(valor.rg) &&
    ehDataNascimento(valor.dataNascimento) &&
    ehTelefone(valor.telefone) &&
    (valor.email === null || valor.email === '' || ehEmail(valor.email)) &&
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
    ehIdadePet(valor.idade) &&
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
    (valor.ate === undefined || ehDataIso(valor.ate)) &&
    (valor.veterinarioId === undefined || ehIdPositivo(valor.veterinarioId))
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
    ehTextoProntuario(valor.prescricao) &&
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
    ehTextoOpcional(valor.fabricante, VACINA_FABRICANTE_MAXIMO) &&
    typeof valor.alertaEstoque === 'boolean' &&
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

/* ---------- Guards das operações de CRUD completo ---------- */

export function ehDadosInativacao(valor: unknown): valor is DadosInativacao {
  return ehObjeto(valor) && ehIdPositivo(valor.id) && ehTexto(valor.motivo, 3, 500);
}

export function ehDadosAtualizacaoCliente(valor: unknown): valor is DadosAtualizacaoCliente {
  return ehObjeto(valor) && ehIdPositivo(valor.id) && ehDadosCliente(valor);
}

export function ehDadosAtualizacaoPet(valor: unknown): valor is DadosAtualizacaoPet {
  return ehObjeto(valor) && ehIdPositivo(valor.id) && ehDadosPet(valor);
}

export function ehDadosNovoUsuario(valor: unknown): valor is DadosNovoUsuario {
  if (!ehObjeto(valor)) return false;
  if (valor.role !== 'VETERINARIO' && valor.role !== 'ATENDENTE') return false;
  return (
    ehTexto(valor.nome, 2, 120) &&
    ehEmail(valor.email) &&
    typeof valor.senha === 'string' &&
    valor.senha.length >= 6 &&
    (valor.crmv === null || (typeof valor.crmv === 'string' && valor.crmv.length <= 30)) &&
    (valor.rg === null || ehRg(valor.rg)) &&
    (valor.ativo === undefined || typeof valor.ativo === 'boolean')
  );
}

export function ehDadosAtualizacaoUsuario(valor: unknown): valor is DadosAtualizacaoUsuario {
  if (!ehObjeto(valor) || !ehIdPositivo(valor.id) || !ehRole(valor.role)) return false;
  return (
    ehTexto(valor.nome, 2, 120) &&
    ehEmail(valor.email) &&
    (valor.crmv === null || (typeof valor.crmv === 'string' && valor.crmv.length <= 30)) &&
    (valor.rg === null || ehRg(valor.rg)) &&
    typeof valor.ativo === 'boolean'
  );
}

export function ehDadosAtualizacaoConsulta(valor: unknown): valor is DadosAtualizacaoConsulta {
  return (
    ehObjeto(valor) &&
    ehIdPositivo(valor.id) &&
    ehIdPositivo(valor.veterinarioId) &&
    ehDataIso(valor.dataHora) &&
    ehTexto(valor.motivo, 2, PRONTUARIO_TEXTO_MAXIMO)
  );
}

export function ehDadosAtualizacaoProduto(valor: unknown): valor is DadosAtualizacaoProduto {
  return ehObjeto(valor) && ehIdPositivo(valor.id) && ehDadosProduto(valor);
}

export function ehDadosAtualizacaoLote(valor: unknown): valor is DadosAtualizacaoLote {
  return ehObjeto(valor) && ehIdPositivo(valor.id) && ehDadosLote(valor);
}

export function ehDadosAtualizacaoVacina(valor: unknown): valor is DadosAtualizacaoVacina {
  return ehObjeto(valor) && ehIdPositivo(valor.id) && ehDadosRegistroVacina(valor);
}

export function ehDadosAtualizacaoAnexo(valor: unknown): valor is DadosAtualizacaoAnexo {
  return (
    ehObjeto(valor) &&
    ehIdPositivo(valor.id) &&
    ehTexto(valor.descricao, ANEXO_DESCRICAO_MINIMO, ANEXO_DESCRICAO_MAXIMO) &&
    ehCategoriaAnexo(valor.categoria) &&
    ehDataCivil(valor.dataDocumento)
  );
}

export function ehAno(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= 2020 && valor <= 2100;
}

export function ehNomeMunicipio(valor: unknown): valor is string {
  return typeof valor === 'string' && ehTexto(valor, 2, 120);
}

export function exigir<T>(valor: unknown, guarda: (valor: unknown) => valor is T, mensagem: string): T {
  if (!guarda(valor)) {
    throw new ErroAplicacao(mensagem);
  }
  return valor;
}

/* ---------------- Fase 2: preços, orçamentos e financeiro ---------------- */

/** Valor monetário com no máximo duas casas decimais e dentro do DECIMAL(10,2). */
function ehValorMonetario(valor: unknown, permitsZero = true): valor is number {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return false;
  if (!permitsZero && valor <= 0) return false;
  if (permitsZero && valor < 0) return false;
  return (
    valor <= ESTOQUE_PRECO_MAXIMO && Math.abs(valor * 100 - Math.round(valor * 100)) <= 1e-9
  );
}

export function ehFiltroRelatorio(valor: unknown): valor is FiltroRelatorio {
  return ehObjeto(valor) && ehDataCivil(valor.de) && ehDataCivil(valor.ate) && valor.de <= valor.ate;
}

export function ehDadosTabelaPreco(valor: unknown): valor is DadosTabelaPreco {
  return (
    ehObjeto(valor) &&
    ehTexto(valor.codigo, 1, 40) &&
    ehTexto(valor.descricao, 2, 160) &&
    ehTexto(valor.categoria, 1, ESTOQUE_CATEGORIA_MAXIMO) &&
    ehValorMonetario(valor.preco)
  );
}

export function ehDadosAtualizacaoTabelaPreco(valor: unknown): valor is DadosAtualizacaoTabelaPreco {
  return ehObjeto(valor) && ehIdPositivo(valor.id) && ehDadosTabelaPreco(valor);
}

export function ehOrigemHistoricoPreco(valor: unknown): valor is OrigemHistoricoPreco {
  return typeof valor === 'string' && ORIGEM_HISTORICO_PRECO.some((origem) => origem === valor);
}

export function ehDadosItemOrcamento(valor: unknown): valor is DadosItemOrcamento {
  if (!ehObjeto(valor)) return false;
  if (!PRECO_ITEM_TIPOS.some((tipo) => tipo === valor.tipo)) return false;
  if (valor.tipo === 'PRODUTO') {
    if (!ehIdPositivo(valor.produtoId) || valor.tabelaPrecoId !== null) return false;
  } else if (!ehIdPositivo(valor.tabelaPrecoId) || valor.produtoId !== null) {
    return false;
  }
  return (
    ehTexto(valor.descricao, 2, 200) &&
    typeof valor.quantidade === 'number' &&
    Number.isInteger(valor.quantidade) &&
    valor.quantidade >= 1 &&
    valor.quantidade <= ITEM_QUANTIDADE_MAXIMA &&
    ehValorMonetario(valor.precoUnitario)
  );
}

export function ehDadosOrcamento(valor: unknown): valor is DadosOrcamento {
  if (!ehObjeto(valor)) return false;
  if (!ehIdPositivo(valor.clienteId) || !ehIdOpcional(valor.petId)) return false;
  if (!ehDataCivil(valor.validade) || !ehValorMonetario(valor.desconto)) return false;
  if (!ehTextoOpcional(valor.observacoes, 2000)) return false;
  return Array.isArray(valor.itens) && valor.itens.length > 0 && valor.itens.every(ehDadosItemOrcamento);
}

export function ehDadosAtualizacaoOrcamento(valor: unknown): valor is DadosAtualizacaoOrcamento {
  return ehObjeto(valor) && ehIdPositivo(valor.id) && ehDadosOrcamento(valor);
}

export function ehDadosStatusOrcamento(valor: unknown): valor is DadosStatusOrcamento {
  return (
    ehObjeto(valor) &&
    ehIdPositivo(valor.id) &&
    typeof valor.status === 'string' &&
    ORCAMENTO_STATUS.some((status) => status === valor.status) &&
    valor.status !== 'CANCELADO'
  );
}

export function ehDadosMovimentacao(valor: unknown): valor is DadosMovimentacao {
  if (!ehObjeto(valor)) return false;
  if (!MOVIMENTACAO_TIPOS.some((tipo) => tipo === valor.tipo)) return false;
  if (!MOVIMENTACAO_STATUS.some((status) => status === valor.status)) return false;
  if (!ehTexto(valor.categoria, 2, ESTOQUE_CATEGORIA_MAXIMO)) return false;
  if (!ehTexto(valor.descricao, 3, 200)) return false;
  if (!ehValorMonetario(valor.valor, false)) return false;
  if (!ehDataCivil(valor.vencimento)) return false;
  if (valor.pagamento !== null && !ehDataCivil(valor.pagamento)) return false;
  if (valor.status === 'PAGO' && !ehDataCivil(valor.pagamento)) return false;
  if (!ehIdOpcional(valor.orcamentoId)) return false;
  return (
    valor.formaPagamento === null ||
    ehTexto(valor.formaPagamento, 1, FORMA_PAGAMENTO_MAXIMA)
  );
}

export function ehDadosAtualizacaoMovimentacao(valor: unknown): valor is DadosAtualizacaoMovimentacao {
  return ehObjeto(valor) && ehIdPositivo(valor.id) && ehDadosMovimentacao(valor);
}

export function ehDadosBaixaMovimentacao(valor: unknown): valor is DadosBaixaMovimentacao {
  return (
    ehObjeto(valor) &&
    ehIdPositivo(valor.id) &&
    ehDataCivil(valor.pagamento) &&
    (valor.formaPagamento === null || ehTexto(valor.formaPagamento, 1, FORMA_PAGAMENTO_MAXIMA))
  );
}
