import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { ErroAplicacao } from '../../shared/errors';
import type { ResumoDashboard } from '../../shared/types';

const HOST_LOOPBACK = '127.0.0.1';
const CAMINHO_RESUMO = '/api/resumo';
const MENSAGEM_INICIO = 'Não foi possível iniciar a API local do painel.';
const MENSAGEM_PARADA = 'Não foi possível encerrar a API local do painel.';
const MENSAGEM_INTERNA = 'Não foi possível carregar o resumo do painel.';
const MENSAGEM_NAO_ENCONTRADO = 'Recurso não encontrado.';

/**
 * Adaptador HTTP da API própria: escuta apenas em loopback e expõe somente o
 * resumo agregado. O cálculo é injetado para manter o transporte desacoplado do
 * domínio (a implementação padrão consulta o banco via `Database.getInstance()`).
 */
export class ServidorApiLocal {
  private servidor: Server | null = null;
  private enderecoBase: string | null = null;

  constructor(private readonly obterResumo: () => Promise<ResumoDashboard>) {}

  get urlBase(): string | null {
    return this.enderecoBase;
  }

  iniciar(): Promise<void> {
    if (this.servidor !== null) return Promise.resolve();

    return new Promise<void>((resolve, reject) => {
      const servidor = createServer((requisicao, resposta) => {
        void this.tratarRequisicao(requisicao, resposta);
      });

      const falhar = (erro: unknown): void => {
        reject(erro instanceof ErroAplicacao ? erro : new ErroAplicacao(MENSAGEM_INICIO));
      };
      servidor.once('error', falhar);

      servidor.listen(0, HOST_LOOPBACK, () => {
        const endereco = servidor.address();
        if (endereco === null || typeof endereco === 'string') {
          servidor.close();
          falhar(new ErroAplicacao(MENSAGEM_INICIO));
          return;
        }

        servidor.off('error', falhar);
        servidor.on('error', (erro) => {
          console.error('[API local] Falha no servidor:', erro);
        });
        this.servidor = servidor;
        this.enderecoBase = `http://${HOST_LOOPBACK}:${endereco.port}`;
        resolve();
      });
    });
  }

  parar(): Promise<void> {
    const servidor = this.servidor;
    if (servidor === null) return Promise.resolve();

    this.servidor = null;
    this.enderecoBase = null;

    return new Promise<void>((resolve, reject) => {
      servidor.close((erro) => {
        if (erro) {
          reject(new ErroAplicacao(MENSAGEM_PARADA));
          return;
        }
        resolve();
      });
      servidor.closeAllConnections();
    });
  }

  private async tratarRequisicao(
    requisicao: IncomingMessage,
    resposta: ServerResponse
  ): Promise<void> {
    const metodo = requisicao.method ?? '';
    const caminho = (requisicao.url ?? '').split('?')[0];

    if (metodo !== 'GET' || caminho !== CAMINHO_RESUMO) {
      const cabecalhos: Record<string, string> = {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      };
      if (metodo !== 'GET') cabecalhos.Allow = 'GET';
      resposta.writeHead(metodo === 'GET' ? 404 : 405, cabecalhos);
      resposta.end(JSON.stringify({ erro: MENSAGEM_NAO_ENCONTRADO }));
      return;
    }

    try {
      const resumo = await this.obterResumo();
      resposta.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      resposta.end(JSON.stringify(resumo));
    } catch (erro) {
      console.error('[API local] Falha ao montar o resumo:', erro);
      resposta.writeHead(500, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      resposta.end(JSON.stringify({ erro: MENSAGEM_INTERNA }));
    }
  }
}
