/**
 * Bootstrap do primeiro administrador do PetHealthPD.
 *
 * Uso (PowerShell, na raiz do projeto):
 *   $env:PHD_ADMIN_NOME = "Administrador da Clínica"
 *   $env:PHD_ADMIN_EMAIL = "admin@clinica.local"
 *   $env:PHD_ADMIN_SENHA = "<senha-definida-pelo-administrador>"
 *   npm run seed:admin
 *
 * As credenciais vêm de variáveis de ambiente (definidas no shell ou no `.env`
 * local, ignorado pelo Git): não existe senha padrão no código e a senha nunca
 * é exibida. Se o e-mail já estiver cadastrado, a conta é promovida a ADMIN e
 * reativada, mantendo a senha existente.
 *
 * O npm script usa `ts-node --compiler typescript5` porque o TypeScript 7 não
 * expõe a API JS que o ts-node 10 exige; o build do app continua no TypeScript 7.
 */
/** Primeiro import: o Prisma Client não carrega .env sozinho fora do CLI. */
import '../src/main/config/carregarEnv';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { CUSTO_HASH_SENHA } from '../src/shared/constants';

interface ConfiguracaoAdmin {
  nome: string;
  email: string;
  senha: string;
}

const prisma = new PrismaClient();

function lerConfiguracao(): ConfiguracaoAdmin {
  const nome = process.env.PHD_ADMIN_NOME?.trim() ?? '';
  const email = process.env.PHD_ADMIN_EMAIL?.trim() ?? '';
  const senha = process.env.PHD_ADMIN_SENHA ?? '';

  const ausentes: string[] = [];
  if (!nome) ausentes.push('PHD_ADMIN_NOME');
  if (!email) ausentes.push('PHD_ADMIN_EMAIL');
  if (!senha) ausentes.push('PHD_ADMIN_SENHA');

  if (ausentes.length > 0) {
    throw new Error(`Defina as variáveis de ambiente obrigatórias: ${ausentes.join(', ')}.`);
  }
  if (senha.length < 6) {
    throw new Error('A senha do administrador deve ter pelo menos 6 caracteres (PHD_ADMIN_SENHA).');
  }

  return { nome, email, senha };
}

async function executar(): Promise<void> {
  const { nome, email, senha } = lerConfiguracao();
  const existente = await prisma.usuario.findUnique({ where: { email } });

  if (existente) {
    await prisma.usuario.update({
      where: { id: existente.id },
      data: { role: 'ADMIN', ativo: true },
    });
    console.log(`[seed:admin] Aviso: já existia uma conta com o e-mail "${email}".`);
    console.log('[seed:admin] A conta foi promovida a ADMIN e reativada; a senha anterior foi mantida.');
    console.log(`[seed:admin] Conta atualizada: ${existente.nome} <${existente.email}> (id ${existente.id}).`);
  } else {
    const senhaHash = await bcrypt.hash(senha, CUSTO_HASH_SENHA);
    const criado = await prisma.usuario.create({
      data: { nome, email, senhaHash, role: 'ADMIN', ativo: true },
    });
    console.log(`[seed:admin] Conta criada: ${criado.nome} <${criado.email}> (id ${criado.id}).`);
  }

  console.log('[seed:admin] Resumo: 1 Administrador ativo pronto para uso.');
  console.log('[seed:admin] Faça login no aplicativo com o e-mail informado e a senha definida no ambiente.');
}

async function main(): Promise<void> {
  try {
    await executar();
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : 'Falha inesperada ao preparar o administrador.';
    console.error(`[seed:admin] Falha: ${mensagem}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => {
      console.error('[seed:admin] Aviso: não foi possível encerrar a conexão com o banco.');
    });
  }
}

void main();
