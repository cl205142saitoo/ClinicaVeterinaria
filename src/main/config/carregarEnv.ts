/**
 * Carrega o `.env` no processo principal.
 *
 * O Prisma CLI carrega o `.env` sozinho, mas o Prisma Client NÃO. Sem este
 * módulo, `DATABASE_URL` não existe dentro do Electron e todo acesso ao banco
 * (inclusive o primeiro cadastro) falha mesmo com o arquivo configurado.
 *
 * Nenhuma variável é repassada ao renderer: este módulo só escreve em
 * `process.env` do main e apenas para as chaves explicitamente permitidas.
 */

import { existsSync, readFileSync } from 'fs';
import path from 'path';

const CHAVES_PERMITIDAS = new Set([
  'DATABASE_URL',
  'PHD_ADMIN_NOME',
  'PHD_ADMIN_EMAIL',
  'PHD_ADMIN_SENHA',
]);

function candidatos(): string[] {
  const doPacote = path.resolve(__dirname, '../../../.env');
  const doCwd = path.join(process.cwd(), '.env');
  return doPacote === doCwd ? [doCwd] : [doCwd, doPacote];
}

function valorDaLinha(bruto: string): string {
  const valor = bruto.trim();
  const aspas = valor[0];
  if (
    valor.length >= 2 &&
    (aspas === '"' || aspas === "'") &&
    valor[valor.length - 1] === aspas
  ) {
    return valor.slice(1, -1);
  }
  return valor.replace(/\s+#.*$/, '').trim();
}

function aplicar(conteudo: string): void {
  for (const linhaOriginal of conteudo.split(/\r?\n/)) {
    const linha = linhaOriginal.trim();
    if (linha === '' || linha.startsWith('#')) continue;

    const encontrada =
      /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(linha);
    if (encontrada === null) continue;

    const chave = encontrada[1];
    if (chave === undefined || !CHAVES_PERMITIDAS.has(chave)) continue;
    // Variável já definida no ambiente tem precedência sobre o arquivo.
    if (process.env[chave] !== undefined) continue;

    const valor = valorDaLinha(encontrada[2] ?? '');
    if (valor !== '') process.env[chave] = valor;
  }
}

const arquivo = candidatos().find((caminho) => existsSync(caminho));
if (arquivo !== undefined) {
  try {
    aplicar(readFileSync(arquivo, 'utf8'));
    console.log('[config] Configuração do banco carregada do .env.');
  } catch (erro) {
    console.error('[config] Não foi possível ler o .env:', erro);
  }
}
