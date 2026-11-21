import axios from 'axios';
import { ErroAplicacao } from '../../shared/errors';
import type { Feriado, MunicipioIbge, ResumoDashboard } from '../../shared/types';
import {
  ehAno,
  ehDataCivil,
  ehNomeMunicipio,
  ehObjeto,
  exigir,
} from '../../shared/validators';
import { ServidorApiLocal } from '../api/ServidorApiLocal';
import { Database } from '../database/PrismaClient';

const TTL_CACHE_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_EXTERNO_MS = 5000;
const TIMEOUT_API_LOCAL_MS = 3000;

const MENSAGEM_IBGE = 'Não foi possível consultar o IBGE. Tente novamente mais tarde.';
const MENSAGEM_FERIADOS = 'Não foi possível consultar os feriados. Tente novamente mais tarde.';
const MENSAGEM_RESUMO = 'Não foi possível carregar o resumo do painel. Tente novamente.';

interface EntradaCache<T> {
  valor: T;
  expiraEm: number;
}

interface MunicipioBruto {
  id: number;
  nome: string;
}

/** Status que ainda representam trabalho futuro na agenda. */
const STATUS_PENDENTES = ['AGENDADA', 'CONFIRMADA'] as const;

/** Códigos de falha de transporte: nesses casos o sistema opera offline. */
const CODIGOS_OFFLINE = [
  'ECONNABORTED',
  'ENOTFOUND',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'ERR_NETWORK',
  'ENETUNREACH',
  'EHOSTUNREACH',
] as const;

function ehUf(valor: unknown): valor is string {
  return typeof valor === 'string' && /^[A-Za-z]{2}$/.test(valor.trim());
}

/** Mantém cada elemento como `unknown`, sem confiar no estreitamento da biblioteca. */
function ehLista(valor: unknown): valor is unknown[] {
  return Array.isArray(valor);
}

function ehContador(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= 0;
}

function ehResumoDashboard(valor: unknown): valor is ResumoDashboard {
  return (
    ehObjeto(valor) &&
    ehContador(valor.clientesAtivos) &&
    ehContador(valor.petsAtivos) &&
    ehContador(valor.consultasHoje) &&
    ehContador(valor.consultasAgendadas) &&
    ehContador(valor.vacinasRegistradasHoje)
  );
}

function ehMunicipioBruto(valor: unknown): valor is MunicipioBruto {
  return (
    ehObjeto(valor) &&
    typeof valor.id === 'number' &&
    Number.isInteger(valor.id) &&
    valor.id > 0 &&
    typeof valor.nome === 'string' &&
    valor.nome.trim().length > 0
  );
}

function ehFalhaOffline(erro: unknown): boolean {
  if (!axios.isAxiosError(erro) || erro.response !== undefined) return false;
  const codigo = erro.code ?? '';
  return CODIGOS_OFFLINE.some((candidato) => candidato === codigo);
}

function normalizarTexto(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim()
    .replace(/\s+/g, ' ');
}

function cacheValido<T>(entrada: EntradaCache<T> | undefined): entrada is EntradaCache<T> {
  return entrada !== undefined && entrada.expiraEm > Date.now();
}

function limitesUtcDoDia(agora: Date): { inicio: Date; fim: Date } {
  const ano = agora.getUTCFullYear();
  const mes = agora.getUTCMonth();
  const dia = agora.getUTCDate();
  return {
    inicio: new Date(Date.UTC(ano, mes, dia)),
    fim: new Date(Date.UTC(ano, mes, dia + 1)),
  };
}

/**
 * Fonte única dos números do painel: usada pelo endpoint HTTP local e pelo
 * fallback quando o servidor não está ativo. Nenhum campo sensível é lido.
 */
export async function calcularResumoDashboard(agora: Date = new Date()): Promise<ResumoDashboard> {
  const prisma = Database.getInstance();
  const { inicio, fim } = limitesUtcDoDia(agora);

  const [clientesAtivos, petsAtivos, consultasHoje, consultasAgendadas, vacinasRegistradasHoje] =
    await Promise.all([
      prisma.cliente.count({ where: { ativo: true } }),
      prisma.pet.count({ where: { ativo: true } }),
      prisma.consulta.count({ where: { dataHora: { gte: inicio, lt: fim } } }),
      prisma.consulta.count({ where: { status: { in: [...STATUS_PENDENTES] } } }),
      prisma.registroVacina.count({
        where: { estornado: false, registradoEm: { gte: inicio, lt: fim } },
      }),
    ]);

  return {
    clientesAtivos,
    petsAtivos,
    consultasHoje,
    consultasAgendadas,
    vacinasRegistradasHoje,
  };
}

function extrairMunicipio(
  dados: unknown,
  nomeDigitado: string,
  uf: string
): MunicipioIbge | null {
  if (!ehLista(dados)) {
    throw new ErroAplicacao(MENSAGEM_IBGE);
  }

  const alvo = normalizarTexto(nomeDigitado);
  const encontrado = dados.find(
    (item) => ehMunicipioBruto(item) && normalizarTexto(item.nome) === alvo
  );

  if (encontrado === undefined || !ehMunicipioBruto(encontrado)) return null;
  return { id: encontrado.id, nome: encontrado.nome.trim(), uf };
}

function extrairFeriados(dados: unknown): Feriado[] {
  if (!ehLista(dados)) {
    throw new ErroAplicacao(MENSAGEM_FERIADOS);
  }

  return dados
    .flatMap((item): Feriado[] => {
      if (!ehObjeto(item) || !ehDataCivil(item.date)) return [];
      const nomeLocal = item.localName;
      const nomeOficial = item.name;
      const nome =
        typeof nomeLocal === 'string' && nomeLocal.trim().length > 0
          ? nomeLocal
          : nomeOficial;
      if (typeof nome !== 'string' || nome.trim().length === 0) return [];
      return [{ data: item.date, nome: nome.trim(), tipo: 'nacional' }];
    })
    .sort((a, b) => a.data.localeCompare(b.data));
}

export class IntegracoesService {
  private readonly cacheMunicipios = new Map<string, EntradaCache<MunicipioIbge | null>>();
  private readonly cacheFeriados = new Map<number, EntradaCache<Feriado[]>>();

  constructor(
    private readonly servidor: ServidorApiLocal = new ServidorApiLocal(calcularResumoDashboard)
  ) {}

  async iniciar(): Promise<void> {
    try {
      await this.servidor.iniciar();
    } catch (erro) {
      // A API local é um caminho de desempenho; o cálculo direto mantém o painel funcionando.
      console.error('[Integrações] API local não iniciada:', erro);
    }
  }

  parar(): Promise<void> {
    return this.servidor.parar();
  }

  async buscarMunicipioIbge(nome: string, uf: string): Promise<MunicipioIbge | null> {
    const municipio = exigir(nome, ehNomeMunicipio, 'Informe o nome do município.');
    const sigla = exigir(uf, ehUf, 'Informe uma UF válida com 2 letras.').trim().toUpperCase();
    const chave = `${sigla}:${normalizarTexto(municipio)}`;

    const emCache = this.cacheMunicipios.get(chave);
    if (cacheValido(emCache)) return emCache.valor;

    let valor: MunicipioIbge | null;
    try {
      const resposta = await axios.get<unknown>(
        `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${sigla}/municipios`,
        { timeout: TIMEOUT_EXTERNO_MS }
      );
      valor = extrairMunicipio(resposta.data, municipio, sigla);
    } catch (erro) {
      if (erro instanceof ErroAplicacao) throw erro;
      if (ehFalhaOffline(erro)) return null;
      throw new ErroAplicacao(MENSAGEM_IBGE);
    }

    this.cacheMunicipios.set(chave, { valor, expiraEm: Date.now() + TTL_CACHE_MS });
    return valor;
  }

  async listarFeriados(ano: number): Promise<Feriado[]> {
    const anoValido = exigir(ano, ehAno, 'Informe um ano entre 2020 e 2100.');

    const emCache = this.cacheFeriados.get(anoValido);
    if (cacheValido(emCache)) return emCache.valor;

    let valor: Feriado[];
    try {
      const resposta = await axios.get<unknown>(
        `https://date.nager.at/api/v3/PublicHolidays/${anoValido}/BR`,
        { timeout: TIMEOUT_EXTERNO_MS }
      );
      valor = extrairFeriados(resposta.data);
    } catch (erro) {
      if (erro instanceof ErroAplicacao) throw erro;
      if (ehFalhaOffline(erro)) return [];
      throw new ErroAplicacao(MENSAGEM_FERIADOS);
    }

    this.cacheFeriados.set(anoValido, { valor, expiraEm: Date.now() + TTL_CACHE_MS });
    return valor;
  }

  async resumoDashboard(): Promise<ResumoDashboard> {
    const urlBase = this.servidor.urlBase;
    if (urlBase !== null) {
      try {
        const resposta = await axios.get<unknown>(`${urlBase}/api/resumo`, {
          timeout: TIMEOUT_API_LOCAL_MS,
        });
        if (!ehResumoDashboard(resposta.data)) {
          throw new ErroAplicacao(MENSAGEM_RESUMO);
        }
        return resposta.data;
      } catch (erro) {
        if (erro instanceof ErroAplicacao) throw erro;
        if (!ehFalhaOffline(erro)) {
          console.error('[Integrações] Resposta inválida da API local:', erro);
          throw new ErroAplicacao(MENSAGEM_RESUMO);
        }
      }
    }

    return this.calcularResumoLocal();
  }

  private async calcularResumoLocal(): Promise<ResumoDashboard> {
    try {
      return await calcularResumoDashboard();
    } catch (erro) {
      if (erro instanceof ErroAplicacao) throw erro;
      console.error('[Integrações] Falha ao calcular o resumo local:', erro);
      throw new ErroAplicacao(MENSAGEM_RESUMO);
    }
  }
}
