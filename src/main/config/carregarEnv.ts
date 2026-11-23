/**
 * Carrega o `.env` no processo principal.
 *
 * O Prisma CLI carrega o `.env` sozinho, mas o Prisma Client NÃO. Sem este
 * módulo, `DATABASE_URL` não existe dentro do Electron e todo acesso ao banco
 * (inclusive o primeiro cadastro) falha mesmo com o arquivo configurado.
 *
 * Por padrão só `DATABASE_URL` entra no runtime do aplicativo. As credenciais
 * de bootstrap do administrador são carregadas explicitamente pelo seed, para
 * não ficarem no processo do app. Nada é repassado ao renderer.
 */

import { existsSync, readFileSync } from 'fs';
import path from 'path';

const TODAS_AS_CHAVES = new Set([
  'DATABASE_URL',
  'PHD_ADMIN_NOME',
  'PHD_ADMIN_EMAIL',
  'PHD_ADMIN_SENHA',
  'PHD_ANEXOS_DIR',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_FROM',
  'PHD_CLAREZA_EMAIL',
]);

function candidatos(): string[] {
  const doPacote = path.resolve(__dirname, '../../../.env');
  const doCwd = path.join(process.cwd(), '.env');
  return doPacote === doCwd ? [doCwd] : [doCwd, doPacote];
}

function valorDaLinha(bruto: string): string {
  const valor = bruto.trim();
  const aspas = valor[0];
  if (valor.length >= 2 && (aspas === '"' || aspas === "'") && valor[valor.length - 1] === aspas) {
    return valor.slice(1, -1);
  }
  return valor.replace(/\s+#.*$/, '').trim();
}

/** Carrega apenas as chaves permitidas; variáveis já definidas no shell prevalecem. */
export function carregarEnv(chavesPermitidas: readonly string[] = ['DATABASE_URL']): boolean {
  const permitidas = new Set(chavesPermitidas.filter((chave) => TODAS_AS_CHAVES.has(chave)));
  if (permitidas.size === 0) return false;

  const arquivo = candidatos().find((caminho) => existsSync(caminho));
  if (arquivo === undefined) return false;

  try {
    for (const linhaOriginal of readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
      const linha = linhaOriginal.trim();
      if (linha === '' || linha.startsWith('#')) continue;
      const encontrada = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(linha);
      if (encontrada === null) continue;

      const chave = encontrada[1];
      if (chave === undefined || !permitidas.has(chave)) continue;
      if (process.env[chave] !== undefined) continue;

      const valor = valorDaLinha(encontrada[2] ?? '');
      if (valor !== '') process.env[chave] = valor;
    }
    return true;
  } catch (erro) {
    console.error('[config] Não foi possível ler o .env:', erro);
    return false;
  }
}

if (carregarEnv()) {
  console.log('[config] DATABASE_URL carregada do .env para o processo principal.');
}
