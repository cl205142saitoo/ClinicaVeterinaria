import axios from 'axios';
import type { CotacaoDolar as CotacaoPersistida } from '@prisma/client';
import { dataCivilClinica } from '../../shared/datas';
import { ErroAplicacao } from '../../shared/errors';
import type { CotacaoDolar } from '../../shared/types';
import { ehObjeto } from '../../shared/validators';
import { Database } from '../database/PrismaClient';

const URL_COTACAO = 'https://economia.awesomeapi.com.br/last/USD-BRL';
const FONTE = 'AwesomeAPI (USD-BRL)';
const TIMEOUT_MS = 5000;
const MENSAGEM_FALHA =
  'Não foi possível consultar a cotação do dólar e não há cotação salva no sistema. Tente novamente mais tarde.';

/** Converte data civil para o instante UTC usado pelas colunas `@db.Date`. */
function dataCivilBanco(valor: string): Date {
  return new Date(`${valor}T00:00:00.000Z`);
}

function paraCotacao(registro: CotacaoPersistida): CotacaoDolar {
  return {
    valor: registro.valor.toNumber(),
    dataReferencia: registro.dataReferencia.toISOString().slice(0, 10),
    fonte: registro.fonte,
    consultadoEm: registro.consultadoEm.toISOString(),
  };
}

/** Cotação diária: cache no banco, com fallback para a última consulta salva. */
export class CotacaoService {
  private prisma = Database.getInstance();

  constructor(private readonly agora: () => Date = () => new Date()) {}

  async obter(): Promise<CotacaoDolar> {
    const dataReferencia = dataCivilBanco(dataCivilClinica(this.agora()));
    const salvaHoje = await this.prisma.cotacaoDolar.findUnique({ where: { dataReferencia } });
    if (salvaHoje !== null) return paraCotacao(salvaHoje);

    try {
      const resposta = await axios.get<unknown>(URL_COTACAO, { timeout: TIMEOUT_MS });
      const valor = extrairBid(resposta.data);
      const registro = await this.prisma.cotacaoDolar.upsert({
        where: { dataReferencia },
        create: {
          dataReferencia,
          valor: valor,
          fonte: FONTE,
          consultadoEm: this.agora(),
        },
        update: {
          valor,
          fonte: FONTE,
          consultadoEm: this.agora(),
        },
      });
      return paraCotacao(registro);
    } catch (erro) {
      console.error('[Cotação] Falha ao consultar a API do dólar:', erro);
      const ultima = await this.prisma.cotacaoDolar.findFirst({
        orderBy: { dataReferencia: 'desc' },
      });
      if (ultima !== null) return paraCotacao(ultima);
      throw new ErroAplicacao(MENSAGEM_FALHA);
    }
  }
}

function extrairBid(dados: unknown): number {
  if (!ehObjeto(dados) || !ehObjeto(dados.USDBRL)) {
    throw new ErroAplicacao('A API de cotação retornou uma resposta inesperada.');
  }
  const bruto = dados.USDBRL.bid;
  const valor = typeof bruto === 'number' || typeof bruto === 'string' ? Number(bruto) : NaN;
  if (!Number.isFinite(valor) || valor <= 0) {
    throw new ErroAplicacao('A API de cotação retornou um valor inválido para o dólar.');
  }
  return Math.round(valor * 10_000) / 10_000;
}
