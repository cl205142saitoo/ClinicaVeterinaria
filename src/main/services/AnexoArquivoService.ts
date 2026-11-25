import { createHash, randomUUID } from 'crypto';
import { app, dialog, shell } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import {
  ANEXO_MIMES_ACEITOS,
  ANEXO_NOME_ORIGINAL_MAXIMO,
  ANEXO_STAGING_TTL_MINUTOS,
  ANEXO_TAMANHO_MAXIMO_BYTES,
} from '../../shared/constants';
import { ErroAplicacao } from '../../shared/errors';
import type { ArquivoAnexoSelecionado } from '../../shared/types';
import { ehObjeto } from '../../shared/validators';
import { carregarEnv } from '../config/carregarEnv';

type MimeAceito = (typeof ANEXO_MIMES_ACEITOS)[number];
type FormatoAssinatura = 'jpg' | 'png' | 'pdf';

/** Metadados internos: o caminho jamais sai deste módulo ou do handler que o consome. */
export interface MetadadosInternos {
  stagingPath: string;
  nomeArquivoGerado: string;
  nomeOriginal: string;
  mimeType: string;
  tamanhoBytes: number;
  checksumSha256: string;
  /** Timestamp (ms) em que o token deixa de ser aceito. */
  expiraEm: number;
}

const MIME_POR_ASSINATURA: Readonly<Record<FormatoAssinatura, MimeAceito>> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  pdf: 'application/pdf',
};

/** `.jpeg` é extensão válida para a mesma assinatura JPG. */
const MIME_POR_EXTENSAO: Readonly<Record<string, MimeAceito>> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.pdf': 'application/pdf',
};

const ASSINATURA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ASSINATURA_PDF = Buffer.from('%PDF-', 'ascii');
const RE_NOME_GERADO =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|pdf)$/;
const MILISSEGUNDOS_POR_MINUTO = 60_000;

function ehErroComCodigo(erro: unknown, codigo: string): boolean {
  return ehObjeto(erro) && erro.code === codigo;
}

async function removerSeExistir(caminho: string): Promise<void> {
  try {
    await fs.unlink(caminho);
  } catch (erro) {
    if (!ehErroComCodigo(erro, 'ENOENT')) throw erro;
  }
}

function sanitizarNomeOriginal(nome: string): string {
  const semBarras = path.basename(nome).replace(/[/\\]/g, '');
  const semControle = semBarras.replace(/[\u0000-\u001F\u007F]/g, '');
  const nomeLimpo = semControle.slice(0, ANEXO_NOME_ORIGINAL_MAXIMO);
  if (nomeLimpo.length === 0 || nomeLimpo === '.' || nomeLimpo === '..') return 'anexo';
  return nomeLimpo;
}

function identificarFormato(assinatura: Buffer): FormatoAssinatura | null {
  if (
    assinatura.length >= 3 &&
    assinatura[0] === 0xff &&
    assinatura[1] === 0xd8 &&
    assinatura[2] === 0xff
  ) {
    return 'jpg';
  }
  if (
    assinatura.length >= ASSINATURA_PNG.length &&
    assinatura.subarray(0, ASSINATURA_PNG.length).equals(ASSINATURA_PNG)
  ) {
    return 'png';
  }
  if (
    assinatura.length >= ASSINATURA_PDF.length &&
    assinatura.subarray(0, ASSINATURA_PDF.length).equals(ASSINATURA_PDF)
  ) {
    return 'pdf';
  }
  return null;
}

interface ConteudoValidado {
  conteudo: Buffer;
  tamanhoBytes: number;
  formato: FormatoAssinatura;
}

/** Único módulo com Electron/fs: diálogo, validação binária, gravação e abertura. */
export class AnexoArquivoService {
  private readonly pendentes = new Map<string, MetadadosInternos>();

  private get raiz(): string {
    // Override opcional do seed/instalação; o padrão continua sendo userData/anexos.
    carregarEnv(['PHD_ANEXOS_DIR']);
    const override = process.env.PHD_ANEXOS_DIR?.trim() ?? '';
    return override === ''
      ? path.join(app.getPath('userData'), 'anexos')
      : path.resolve(override);
  }

  private get staging(): string {
    return path.join(this.raiz, '.staging');
  }

  /** Remove resíduos de processos anteriores antes de registrar handlers. */
  async iniciar(): Promise<void> {
    await fs.mkdir(this.staging, { recursive: true });
    const entradas = await fs.readdir(this.staging, { withFileTypes: true });
    for (const entrada of entradas) {
      if (!entrada.isFile() || !RE_NOME_GERADO.test(entrada.name)) continue;
      try {
        await fs.unlink(path.join(this.staging, entrada.name));
      } catch (erro) {
        if (!ehErroComCodigo(erro, 'ENOENT')) console.error('[Anexos] Falha ao limpar staging:', erro);
      }
    }
  }

  async escolher(): Promise<ArquivoAnexoSelecionado | null> {
    await fs.mkdir(this.raiz, { recursive: true });
    await fs.mkdir(this.staging, { recursive: true });
    await this.limparExpirados();

    const resultado = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Imagens e PDF', extensions: ['jpg', 'jpeg', 'png', 'pdf'] }],
    });
    if (resultado.canceled) return null;
    const caminho: string | undefined = resultado.filePaths[0];
    if (caminho === undefined) return null;

    // Um único descritor é usado para stat, assinatura e leitura completa:
    // o arquivo não pode ser trocado entre as validações (TOCTOU).
    const { conteudo, tamanhoBytes, formato } = await this.lerArquivoValidado(caminho);
    const mimeEsperado = MIME_POR_ASSINATURA[formato];
    if (!ANEXO_MIMES_ACEITOS.some((aceito) => aceito === mimeEsperado)) {
      throw new ErroAplicacao('Formato não aceito. Envie apenas JPG, PNG ou PDF.');
    }

    const nomeOriginal = sanitizarNomeOriginal(path.basename(caminho));
    const extensao = path.extname(nomeOriginal).toLowerCase();
    if (MIME_POR_EXTENSAO[extensao] !== mimeEsperado) {
      throw new ErroAplicacao('O formato do arquivo não confere com a extensão.');
    }

    const checksumSha256 = createHash('sha256').update(conteudo).digest('hex');
    const nomeArquivoGerado = `${randomUUID()}${extensao}`;
    const stagingPath = path.join(this.staging, nomeArquivoGerado);
    await fs.writeFile(stagingPath, conteudo, { flag: 'wx' });

    const token = randomUUID();
    this.pendentes.set(token, {
      stagingPath,
      nomeArquivoGerado,
      nomeOriginal,
      mimeType: mimeEsperado,
      tamanhoBytes,
      checksumSha256,
      expiraEm: Date.now() + ANEXO_STAGING_TTL_MINUTOS * MILISSEGUNDOS_POR_MINUTO,
    });

    return {
      token,
      nomeOriginal,
      mimeType: mimeEsperado,
      tamanhoBytes,
      checksumSha256,
    };
  }

  /** Caminho incluso apenas para o handler; o renderer nunca o recebe. */
  async obter(token: string): Promise<MetadadosInternos | null> {
    const metadados = this.pendentes.get(token);
    if (metadados === undefined) return null;
    if (metadados.expiraEm <= Date.now()) {
      await this.cancelar(token);
      return null;
    }
    return { ...metadados };
  }

  async confirmar(token: string): Promise<MetadadosInternos> {
    const metadados = this.pendentes.get(token);
    if (metadados === undefined || metadados.expiraEm <= Date.now()) {
      if (metadados !== undefined) await this.cancelar(token);
      throw new ErroAplicacao('Selecione o arquivo novamente.');
    }
    await fs.mkdir(this.raiz, { recursive: true });
    await fs.rename(metadados.stagingPath, path.join(this.raiz, metadados.nomeArquivoGerado));
    this.pendentes.delete(token);
    return { ...metadados };
  }

  async cancelar(token: string): Promise<void> {
    const metadados = this.pendentes.get(token);
    if (metadados === undefined) return;
    this.pendentes.delete(token);
    await removerSeExistir(metadados.stagingPath);
  }

  /** Compensação quando o registro no banco falha após a confirmação do arquivo. */
  async removerPorNome(nomeArquivoGerado: string): Promise<void> {
    if (!RE_NOME_GERADO.test(nomeArquivoGerado)) {
      throw new ErroAplicacao('Caminho inválido.');
    }
    await removerSeExistir(path.join(this.raiz, nomeArquivoGerado));
  }

  async abrir(nomeArquivoGerado: string): Promise<void> {
    const raiz = this.raiz;
    const destino = path.resolve(raiz, nomeArquivoGerado);
    if (!destino.startsWith(raiz + path.sep)) {
      throw new ErroAplicacao('Caminho inválido.');
    }
    try {
      await fs.access(destino);
    } catch {
      throw new ErroAplicacao('Arquivo do anexo não encontrado no disco.');
    }
    const resultado = await shell.openPath(destino);
    if (typeof resultado === 'string' && resultado.length > 0) {
      throw new ErroAplicacao('Não foi possível abrir o arquivo.');
    }
  }

  private async limparExpirados(): Promise<void> {
    for (const [token, metadados] of [...this.pendentes]) {
      if (metadados.expiraEm > Date.now()) continue;
      try {
        await this.cancelar(token);
      } catch (erro) {
        console.error('[Anexos] Falha ao remover arquivo expirado:', erro);
      }
    }
  }

  private async lerArquivoValidado(caminho: string): Promise<ConteudoValidado> {
    let handle: Awaited<ReturnType<typeof fs.open>>;
    try {
      handle = await fs.open(caminho, 'r');
    } catch (erro) {
      if (ehErroComCodigo(erro, 'ENOENT')) {
        throw new ErroAplicacao('Arquivo não encontrado. Selecione outro.');
      }
      throw erro;
    }

    try {
      const estat = await handle.stat();
      if (!estat.isFile()) {
        throw new ErroAplicacao('Formato não aceito. Envie apenas JPG, PNG ou PDF.');
      }
      if (estat.size === 0) {
        throw new ErroAplicacao('O arquivo está vazio.');
      }
      if (estat.size > ANEXO_TAMANHO_MAXIMO_BYTES) {
        throw new ErroAplicacao('O arquivo excede o limite de 10 MB.');
      }

      const assinatura = Buffer.alloc(8);
      const { bytesRead } = await handle.read(assinatura, 0, assinatura.length, 0);
      const formato = identificarFormato(assinatura.subarray(0, bytesRead));
      if (formato === null) {
        throw new ErroAplicacao('Formato não aceito. Envie apenas JPG, PNG ou PDF.');
      }

      const conteudo = Buffer.allocUnsafe(estat.size);
      let deslocamento = 0;
      while (deslocamento < estat.size) {
        const leitura = await handle.read(
          conteudo,
          deslocamento,
          estat.size - deslocamento,
          deslocamento
        );
        if (leitura.bytesRead === 0) {
          throw new ErroAplicacao('Não foi possível ler o arquivo. Selecione outro.');
        }
        deslocamento += leitura.bytesRead;
      }

      return { conteudo, tamanhoBytes: estat.size, formato };
    } finally {
      await handle.close();
    }
  }
}
