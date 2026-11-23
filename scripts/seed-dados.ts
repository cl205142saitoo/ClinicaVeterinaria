/**
 * Carga de dados fictícios do PetHealthPD (Fase 1 do plano de complementos).
 *
 * Uso (PowerShell, na raiz do projeto):
 *   npm run seed:dados
 *
 * O script é IDEMPOTENTE POR SEGURANÇA: antes de qualquer gravação ele confere
 * se já existe cliente com um dos CPFs reservados desta carga. Se existir, ele
 * avisa e termina sem apagar nem alterar nada. Nunca emite DELETE/TRUNCATE.
 *
 * Dados gerados por PRNG com semente fixa (mulberry32), datas relativas ao dia
 * civil da clínica (America/Sao_Paulo) e horários convertidos para UTC. Colunas
 * @db.Date são enviadas como `YYYY-MM-DDT00:00:00.000Z`; DECIMAL usa
 * Prisma.Decimal. Todos os CHECKs manuais das migrations são respeitados.
 *
 * Variáveis lidas do .env (com valores padrão documentados abaixo):
 *   DATABASE_URL, PHD_ADMIN_NOME, PHD_ADMIN_EMAIL, PHD_ADMIN_SENHA,
 *   PHD_ANEXOS_DIR.
 */
/** Primeiro import: o Prisma Client não carrega .env sozinho fora do CLI. */
import { carregarEnv } from '../src/main/config/carregarEnv';
import { Prisma, PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { deflateSync } from 'zlib';
import {
  ANEXO_CATEGORIAS,
  CUSTO_HASH_SENHA,
  LGPD_FINALIDADE_CADASTRO,
  LGPD_VERSAO_TERMO,
  STATUS_CONSULTA,
} from '../src/shared/constants';
import { dataCivilClinica } from '../src/shared/datas';
import { ehCpf } from '../src/shared/validators';

carregarEnv([
  'DATABASE_URL',
  'PHD_ADMIN_NOME',
  'PHD_ADMIN_EMAIL',
  'PHD_ADMIN_SENHA',
  'PHD_ANEXOS_DIR',
]);

const prisma = new PrismaClient();
const INICIO = Date.now();
const ARQUIVOS_CRIADOS: string[] = [];

const ADMIN_EMAIL_PADRAO = 'admin@pethealthpd.local';
const ADMIN_SENHA_PADRAO = 'PetHealth@2026!';
const ADMIN_NOME_PADRAO = 'Administrador PetHealthPD';
const SENHA_VETERINARIO = 'Vet@2026!';
const SENHA_ATENDENTE = 'Atendente@2026!';
const SEMENTE_FIXA = 0x50484450; // "PHDP"

type RoleSeed = 'ADMIN' | 'VETERINARIO' | 'ATENDENTE';

interface UsuarioSeed {
  id: number;
  nome: string;
  role: RoleSeed;
}

interface ClienteSeed {
  id: number;
  cpf: string;
  email: string;
}

interface PetSeed {
  id: number;
  clienteId: number;
  peso: number;
}

interface ConsultaSeed {
  id: number;
  petId: number;
  veterinarioId: number;
  dataHora: Date;
}

interface ProdutoSeed {
  id: number;
}

/* ----------------------------- PRNG / util ------------------------------ */

let estadoPrng = SEMENTE_FIXA >>> 0;

/** mulberry32: rápido, determinístico e suficiente para dados fictícios. */
function aleatorio(): number {
  estadoPrng = (estadoPrng + 0x6d2b79f5) >>> 0;
  let valor = estadoPrng;
  valor = Math.imul(valor ^ (valor >>> 15), valor | 1);
  valor ^= valor + Math.imul(valor ^ (valor >>> 7), valor | 61);
  return ((valor ^ (valor >>> 14)) >>> 0) / 4294967296;
}

function inteiro(minimo: number, maximo: number): number {
  return minimo + Math.floor(aleatorio() * (maximo - minimo + 1));
}

function escolher<T>(itens: readonly T[]): T {
  return itens[inteiro(0, itens.length - 1)] as T;
}

function decimal(minimo: number, maximo: number, casas: number): string {
  return (minimo + aleatorio() * (maximo - minimo)).toFixed(casas);
}

function zeroEsquerda(valor: number, tamanho: number): string {
  return String(valor).padStart(tamanho, '0');
}

function slug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 24);
}

/* ------------------------------- Datas ---------------------------------- */

const HOJE = dataCivilClinica(new Date());

/** Construtor único de @db.Date exigido pelo projeto. */
function dataCivil(civil: string): Date {
  return new Date(`${civil}T00:00:00.000Z`);
}

function partesCivil(civil: string): [number, number, number] {
  const [ano, mes, dia] = civil.split('-').map(Number);
  return [ano as number, mes as number, dia as number];
}

function somarDias(civil: string, dias: number): string {
  const [ano, mes, dia] = partesCivil(civil);
  return new Date(Date.UTC(ano, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

function diasEntre(inicio: string, fim: string): number {
  const [a1, m1, d1] = partesCivil(inicio);
  const [a2, m2, d2] = partesCivil(fim);
  return Math.round(
    (Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000
  );
}

function maximoCivil(a: string, b: string): string {
  return a >= b ? a : b;
}

/** Horário local de São Paulo (UTC-3, sem DST desde 2019) convertido para UTC. */
function dataHoraUtc(civil: string, horaLocal: number, minuto = 0): Date {
  const [ano, mes, dia] = partesCivil(civil);
  return new Date(Date.UTC(ano, mes - 1, dia, horaLocal + 3, minuto, 0, 0));
}

function diasUteisNoPeriodo(): string[] {
  const resultado: string[] = [];
  const total = 548; // ~18 meses
  for (let deslocamento = total; deslocamento >= 0; deslocamento -= 1) {
    const civil = somarDias(HOJE, -deslocamento);
    const [ano, mes, dia] = partesCivil(civil);
    const diaSemana = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
    if (diaSemana !== 0 && diaSemana !== 6) resultado.push(civil);
  }
  return resultado;
}

/* ------------------------------- CPF ------------------------------------ */

function digitoVerificador(base: string): number {
  let soma = 0;
  for (let indice = 0; indice < base.length; indice += 1) {
    soma += Number(base.charAt(indice)) * (base.length + 1 - indice);
  }
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
}

function gerarCpf(): string {
  for (;;) {
    let base = '';
    for (let indice = 0; indice < 9; indice += 1) base += String(inteiro(0, 9));
    if (/^(\d)\1{8}$/.test(base)) continue;
    const primeiro = digitoVerificador(base);
    const segundo = digitoVerificador(base + String(primeiro));
    const cpf = `${base}${primeiro}${segundo}`;
    if (ehCpf(cpf)) return cpf;
  }
}

/* --------------------------- Listas fictícias ---------------------------- */

const PRIMEIROS_NOMES = [
  'Ana', 'Bruno', 'Carla', 'Diego', 'Eduarda', 'Felipe', 'Gabriela', 'Henrique',
  'Isabela', 'Joao', 'Juliana', 'Lucas', 'Mariana', 'Marcelo', 'Natalia',
  'Otavio', 'Paula', 'Pedro', 'Rafael', 'Renata', 'Rodrigo', 'Sabrina',
  'Thiago', 'Vanessa', 'Wagner', 'Yara', 'Andre', 'Beatriz', 'Caio', 'Daniela',
];

const SOBRENOMES = [
  'Almeida', 'Barbosa', 'Carvalho', 'Dias', 'Esteves', 'Ferreira', 'Gomes',
  'Hernandes', 'Ibrahim', 'Jardim', 'Klein', 'Lima', 'Monteiro', 'Nascimento',
  'Oliveira', 'Pereira', 'Queiroz', 'Ribeiro', 'Santos', 'Teixeira', 'Ueda',
  'Vasconcelos', 'Watanabe', 'Xavier', 'Yoshida', 'Zanella',
];

const CIDADES = [
  { cidade: 'Sao Paulo', uf: 'SP', ddd: '11' },
  { cidade: 'Rio de Janeiro', uf: 'RJ', ddd: '21' },
  { cidade: 'Belo Horizonte', uf: 'MG', ddd: '31' },
  { cidade: 'Curitiba', uf: 'PR', ddd: '41' },
  { cidade: 'Porto Alegre', uf: 'RS', ddd: '51' },
  { cidade: 'Recife', uf: 'PE', ddd: '81' },
  { cidade: 'Salvador', uf: 'BA', ddd: '71' },
  { cidade: 'Brasilia', uf: 'DF', ddd: '61' },
  { cidade: 'Campinas', uf: 'SP', ddd: '19' },
  { cidade: 'Florianopolis', uf: 'SC', ddd: '48' },
  { cidade: 'Goiania', uf: 'GO', ddd: '62' },
  { cidade: 'Fortaleza', uf: 'CE', ddd: '85' },
];

const BAIRROS = [
  'Centro', 'Jardim das Flores', 'Vila Mariana', 'Bela Vista', 'Santa Cruz',
  'Jardim Paulista', 'Boa Viagem', 'Pinheiros', 'Mooca', 'Ipanema',
];

const LOGRADOUROS = ['Rua', 'Avenida', 'Travessa', 'Alameda'];

const ESPECIES = [
  {
    nome: 'Cachorro',
    racas: ['Labrador Retriever', 'Poodle', 'Golden Retriever', 'Buldogue Frances',
      'Yorkshire Terrier', 'Pastor Alemao', 'Shitzu', 'Dachshund', 'Boxer', 'Mestiço'],
    idadeMax: 16,
    pesoMin: 2,
    pesoMax: 45,
  },
  {
    nome: 'Gato',
    racas: ['Persa', 'Siamês', 'Maine Coon', 'Ragdoll', 'Abissínio', 'Scottish Fold',
      'Russian Blue', 'Mestiço'],
    idadeMax: 18,
    pesoMin: 2,
    pesoMax: 9,
  },
  {
    nome: 'Coelho',
    racas: ['Mini Lop', 'Holandês', 'Angora', 'Flanders'],
    idadeMax: 8,
    pesoMin: 0.8,
    pesoMax: 3,
  },
];

const NOMES_PET = [
  'Mel', 'Nina', 'Thor', 'Luna', 'Bob', 'Amora', 'Simba', 'Bidu', 'Lola', 'Rex',
  'Chico', 'Mimi', 'Bella', 'Joca', 'Teddy', 'Duda', 'Oreo', 'Pipoca', 'Zeus', 'Sofia',
];

const MOTIVOS_CONSULTA = [
  'Consulta de rotina', 'Vacinação anual', 'Avaliação dermatológica',
  'Controle de peso', 'Check-up pré-operatório', 'Tosse persistente',
  'Vômitos recorrentes', 'Avaliação odontológica', 'Acompanhamento geriátrico',
  'Dor abdominal', 'Corte e limpeza de unhas', 'Revisão pós-operatória',
];

const EXAMES_CLINICOS = [
  'Animal consciente, mucosas rosadas e hidratadas. Ausculta cardíaca e pulmonar sem alterações.',
  'Pelos com brilho preservado, sem lesões cutâneas. Palpação abdominal indolor.',
  'Temperatura dentro da faixa de referência. Gânglios linfáticos não palpáveis.',
  'Estado geral bom, apetite preservado, sem sinais de dor à manipulação.',
];

const DIAGNOSTICOS = [
  'Quadro clínico compatível com rotina sanitária em dia.',
  'Dermatite alérgica leve, sem sinais de infecção secundária.',
  'Distúrbio gastrointestinal leve, com melhora esperada em 48 horas.',
  'Idade avançada sem alterações clínicas relevantes no momento.',
];

const CONDUTAS = [
  'Manter rotina de alimentação e hidratação. Retorno em 30 dias.',
  'Prescrito anti-histamínico por 7 dias e banho com xampu hipoalergênico.',
  'Dieta de fácil digestão por 3 dias. Retorno se persistirem os sintomas.',
  'Solicitado hemograma completo e SEO para complementar a avaliação.',
];

const PRESCRICOES = [
  'Antihistaminico 10 mg, 1 comprimido por dia, durante 7 dias.',
  'Probioticos 1 sache por dia, durante 5 dias, junto com a racao.',
  'Colirio lubrificante 1 gota em cada olho, 2 vezes ao dia, por 5 dias.',
  'Nao prescrita medicacao; apenas orientacoes de manejo ambiental.',
];

const MOTIVOS_CANCELAMENTO = [
  'Tutor solicitou remarcacao por conflito de horario.',
  'Pet apresentou melhora clinica antes da consulta.',
  'Impossibilidade de comparecimento informada pelo tutor.',
  'Reagendamento realizado pela equipe de atendimento.',
];

const VACINAS = [
  { nome: 'V8 (Cachorro)', fabricante: 'Zoetis', dose: 'Reforço anual' },
  { nome: 'V10 (Cachorro)', fabricante: 'MSD Saúde Animal', dose: 'Reforço anual' },
  { nome: 'Antirrábica (Cachorro)', fabricante: 'Instituto Butantan', dose: 'Dose única' },
  { nome: 'V5 (Cachorro)', fabricante: 'Boehringer Ingelheim', dose: '2ª dose' },
  { nome: 'Quádrupla felina', fabricante: 'Zoetis', dose: 'Reforço anual' },
  { nome: 'Tríplice felina', fabricante: 'MSD Saúde Animal', dose: '1ª dose' },
  { nome: 'Antirrábica (Gato)', fabricante: 'Instituto Butantan', dose: 'Dose única' },
  { nome: 'V8 (Cachorro)', fabricante: 'Boehringer Ingelheim', dose: '1ª dose' },
];

const CATEGORIAS_PRODUTO = [
  { categoria: 'Ração', itens: ['Ração Premium Cães Adultos 15kg', 'Ração Gatos Castrados 10kg',
    'Ração Filhotes Raças Pequenas 3kg', 'Ração Geriátrica Cães 12kg', 'Ração Coelhos 5kg'] },
  { categoria: 'Medicamentos', itens: ['Amoxicilina 500mg 20 comprimidos', 'Ivomec 1% 10ml',
    'Anti-histamínico 10mg 20 comprimidos', 'Colírio Lubrificante 15ml', 'Probiótico Vet 5 sachês'] },
  { categoria: 'Vacinas', itens: ['Vacina V8 1 dose', 'Vacina V10 1 dose',
    'Vacina Antirrábica 1 dose', 'Vacina Quádrupla Felina 1 dose', 'Vacina V5 1 dose'] },
  { categoria: 'Suplementos', itens: ['Condroprotetor 60 comprimidos', 'Ômega 3 60 cápsulas',
    'Multivitamínico Pó 100g', 'Pasta de Maltose 100g', 'Probiótico Pó 30g'] },
  { categoria: 'Higiene', itens: ['Shampoo Hipoalergênico 500ml', 'Creme Dental Pet 90g',
    'Escova Dental Macia', 'Xampu Antipulgas 500ml', 'Toalha Umedecida Pet 80 unidades'] },
  { categoria: 'Acessórios', itens: ['Coleira Pele S', 'Coleira Nylon M',
    'Guia Reversível 3m', 'Cama Pet M', 'Brinquedo Mordedor'] },
  { categoria: 'Diagnóstico', itens: ['Kit Teste Parvovirose', 'Kit Teste Cinomose',
    'Kit Teste FIV/FeLV', 'Lâmina Microscopia 100 unidades', 'Kit Hemograma Descartável'] },
  { categoria: 'Cirurgia', itens: ['Campo Cirúrgico Descartável', 'Luvas Cirúrgicas 50 pares',
    'Fio de Sutura 4-0', 'Seringa 10ml 50 unidades', 'Bisturi Descartável 10 unidades'] },
  { categoria: 'Alimentação', itens: ['Ração Úmida Cães 400g', 'Petisco Natural 200g',
    'Biscoito Dental 500g', 'Sachê Gatos 85g', 'Farinha de Ossos 1kg'] },
  { categoria: 'Cuidados', itens: ['Protetor Solar Pet 200ml', 'Hidratante de Patas 100ml',
    'Repelente Natural 200ml', 'Algodão Hidrofilo 500g', 'Esponja Banho Pet'] },
];

/* -------------------------- Diretório de anexos -------------------------- */

/**
 * AnexoArquivoService usa `path.join(app.getPath('userData'), 'anexos')`.
 * Fora do Electron, reproduzimos esse caminho; PHD_ANEXOS_DIR tem precedência.
 */
function diretorioAnexos(): string {
  const override = process.env.PHD_ANEXOS_DIR?.trim();
  if (override) return path.resolve(override);

  const nomeApp = 'clinicaveterinaria'; // package.json name (sem productName)
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, nomeApp, 'anexos');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', nomeApp, 'anexos');
  }
  const config = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config');
  return path.join(config, nomeApp, 'anexos');
}

/** UUID v4 determinístico (bits de versão/variante corretos, aceito pelo CHECK). */
function uuidV4(): string {
  const bytes = Buffer.alloc(16);
  for (let indice = 0; indice < bytes.length; indice += 1) bytes[indice] = inteiro(0, 255);
  bytes[6] = (bytes[6] as number) & 0x0f | 0x40;
  bytes[8] = (bytes[8] as number) & 0x3f | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function textoPdfSeguro(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/[\\()]/g, (caractere) => `\\${caractere}`);
}

/** PDF mínimo porém estruturalmente válido (catálogo, página, fonte, xref). */
function pdfSimples(texto: string): Buffer {
  const stream = `BT /F1 12 Tf 72 720 Td (${textoPdfSeguro(texto)}) Tj ET`;
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];

  let conteudo = '%PDF-1.4\n';
  const deslocamentos: number[] = [];
  for (const [indice, objeto] of objetos.entries()) {
    deslocamentos.push(Buffer.byteLength(conteudo));
    conteudo += `${indice + 1} 0 obj\n${objeto}\nendobj\n`;
  }
  const inicioXref = Buffer.byteLength(conteudo);
  conteudo += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const deslocamento of deslocamentos) {
    conteudo += `${zeroEsquerda(deslocamento, 10)} 00000 n \n`;
  }
  conteudo += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`;
  return Buffer.from(conteudo, 'ascii');
}

const TABELA_CRC = ((): Uint32Array => {
  const tabela = new Uint32Array(256);
  for (let indice = 0; indice < 256; indice += 1) {
    let valor = indice;
    for (let bit = 0; bit < 8; bit += 1) {
      valor = valor & 1 ? 0xedb88320 ^ (valor >>> 1) : valor >>> 1;
    }
    tabela[indice] = valor >>> 0;
  }
  return tabela;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = ((TABELA_CRC[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunkPng(tipo: string, dados: Buffer): Buffer {
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length, 0);
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo), 0);
  return Buffer.concat([tamanho, corpo, crc]);
}

/** PNG 1x1 RGB com assinatura, IHDR, IDAT e IEND válidos. */
function pngSimples(cor: [number, number, number]): Buffer {
  const assinatura = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8; // profundidade
  ihdr[9] = 2; // RGB
  const varredura = Buffer.from([0, cor[0], cor[1], cor[2]]);
  return Buffer.concat([
    assinatura,
    chunkPng('IHDR', ihdr),
    chunkPng('IDAT', deflateSync(varredura)),
    chunkPng('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------ Carrega --------------------------------- */

function registrar(entidade: string, quantidade: number, detalhe = ''): void {
  const sufixo = detalhe ? ` — ${detalhe}` : '';
  console.log(`[seed:dados] ${entidade.padEnd(24)} ${zeroEsquerda(quantidade, 4)}${sufixo}`);
}

async function inserirUsuarios(): Promise<{
  admin: UsuarioSeed;
  veterinarios: UsuarioSeed[];
  atendentes: UsuarioSeed[];
}> {
  const nomeAdmin = process.env.PHD_ADMIN_NOME?.trim() || ADMIN_NOME_PADRAO;
  const emailAdmin = process.env.PHD_ADMIN_EMAIL?.trim() || ADMIN_EMAIL_PADRAO;
  const senhaAdmin = process.env.PHD_ADMIN_SENHA || ADMIN_SENHA_PADRAO;

  const hashAdmin = await bcrypt.hash(senhaAdmin, CUSTO_HASH_SENHA);
  const admin = await prisma.usuario.upsert({
    where: { email: emailAdmin },
    create: { nome: nomeAdmin, email: emailAdmin, senhaHash: hashAdmin, role: 'ADMIN', ativo: true },
    update: { nome: nomeAdmin, senhaHash: hashAdmin, role: 'ADMIN', ativo: true },
    select: { id: true, nome: true, role: true },
  });

  const vetsFicticios = [
    { nome: 'Dra. Ana Beatriz Costa', crmv: 'CRMV-SP 48211' },
    { nome: 'Dr. Rafael Mendes Prado', crmv: 'CRMV-RJ 31709' },
    { nome: 'Dra. Camila Ferreira Lima', crmv: 'CRMV-MG 25644' },
    { nome: 'Dr. Lucas Hiroshi Tanaka', crmv: 'CRMV-PR 19837' },
  ];
  const hashVet = await bcrypt.hash(SENHA_VETERINARIO, CUSTO_HASH_SENHA);
  const veterinarios: UsuarioSeed[] = [];
  for (const [indice, dados] of vetsFicticios.entries()) {
    const email = `veterinario${indice + 1}.seed@pethealthpd.local`;
    const usuario = await prisma.usuario.upsert({
      where: { email },
      create: {
        nome: dados.nome, email, senhaHash: hashVet, role: 'VETERINARIO',
        ativo: true, crmv: dados.crmv,
      },
      update: { nome: dados.nome, role: 'VETERINARIO', ativo: true, crmv: dados.crmv },
      select: { id: true, nome: true, role: true },
    });
    veterinarios.push(usuario as UsuarioSeed);
  }

  const atendentesFicticios = [
    'Juliana Ribeiro Alves',
    'Marcelo Souza Cardoso',
    'Patricia Nogueira Dias',
  ];
  const hashAtendente = await bcrypt.hash(SENHA_ATENDENTE, CUSTO_HASH_SENHA);
  const atendentes: UsuarioSeed[] = [];
  for (const [indice, nome] of atendentesFicticios.entries()) {
    const email = `atendente${indice + 1}.seed@pethealthpd.local`;
    const usuario = await prisma.usuario.upsert({
      where: { email },
      create: { nome, email, senhaHash: hashAtendente, role: 'ATENDENTE', ativo: true },
      update: { nome, role: 'ATENDENTE', ativo: true },
      select: { id: true, nome: true, role: true },
    });
    atendentes.push(usuario as UsuarioSeed);
  }

  registrar('Administrador', 1, emailAdmin);
  registrar('Veterinários', veterinarios.length, 'todos com CRMV');
  registrar('Atendentes', atendentes.length);
  return { admin: admin as UsuarioSeed, veterinarios, atendentes };
}

/**
 * Gera os CPFs reservados e ABORTA se algum já estiver cadastrado.
 * Nenhuma escrita acontece antes desta checagem.
 */
async function gerarCpfsReservados(): Promise<string[]> {
  const cpfs: string[] = [];
  const vistos = new Set<string>();
  while (cpfs.length < 180) {
    const cpf = gerarCpf();
    if (vistos.has(cpf)) continue;
    vistos.add(cpf);
    cpfs.push(cpf);
  }

  const existentes = await prisma.cliente.count({ where: { cpf: { in: cpfs } } });
  if (existentes > 0) {
    console.warn('[seed:dados] ----------------------------------------------------------------');
    console.warn(`[seed:dados] ABORTADO: já existem ${existentes} cliente(s) com CPF reservado desta carga.`);
    console.warn('[seed:dados] A carga é idempotente por segurança: nada foi apagado, alterado ou inserido.');
    console.warn('[seed:dados] Para refazer, use um banco vazio/own schema — nunca delete tabelas.');
    console.warn('[seed:dados] ----------------------------------------------------------------');
    throw new Error('SEED_JA_EXECUTADO');
  }
  return cpfs;
}

async function inserirClientes(
  cpfsReservados: string[],
  atendentes: UsuarioSeed[]
): Promise<ClienteSeed[]> {
  const primeiros = cpfsReservados.map(() => escolher(PRIMEIROS_NOMES));
  const emailsPlanejados = primeiros.map(
    (primeiro, indice) => `tutor${zeroEsquerda(indice + 1, 3)}.${slug(primeiro)}@emailficticio.com.br`
  );

  // E-mails de outras fontes recebem sufixo determinístico, sem falhar a carga.
  const emailsExistentes = new Set(
    (await prisma.cliente.findMany({
      where: { email: { in: emailsPlanejados } },
      select: { email: true },
    })).map((registro) => registro.email as string)
  );
  const emails = emailsPlanejados.map((emailBase) => {
    let email = emailBase;
    let sufixo = 2;
    while (emailsExistentes.has(email)) {
      const [prefixo, dominio] = emailBase.split('@');
      email = `${prefixo}.s${sufixo}@${dominio}`;
      sufixo += 1;
    }
    emailsExistentes.add(email);
    return email;
  });

  const dados: Prisma.ClienteCreateManyInput[] = cpfsReservados.map((cpf, indice) => {
    const primeiro = primeiros[indice] as string;
    const sobrenome1 = escolher(SOBRENOMES);
    const sobrenome2 = escolher(SOBRENOMES);
    const local = escolher(CIDADES);
    const nascimento = somarDias(HOJE, -((18 + inteiro(0, 55)) * 365 + inteiro(0, 364)));
    const lgpdEm = dataHoraUtc(somarDias(HOJE, -inteiro(0, 400)), inteiro(8, 18), inteiro(0, 59));
    return {
      nome: `${primeiro} ${sobrenome1} ${sobrenome2}`.slice(0, 120),
      cpf,
      rg: zeroEsquerda(inteiro(1000000, 99999999), 8) + inteiro(0, 9),
      dataNascimento: dataCivil(nascimento),
      telefone: `${local.ddd}9${zeroEsquerda(inteiro(0, 99_999_999), 8)}`,
      email: emails[indice],
      cep: `${zeroEsquerda(inteiro(10000, 99999), 5)}${zeroEsquerda(inteiro(100, 999), 3)}`,
      logradouro: `${escolher(LOGRADOUROS)} ${escolher(SOBRENOMES)}, ${inteiro(1, 2500)}`.slice(0, 200),
      bairro: escolher(BAIRROS),
      cidade: local.cidade,
      uf: local.uf,
      aceiteLgpd: true,
      lgpdAceiteEm: lgpdEm,
      lgpdFinalidade: LGPD_FINALIDADE_CADASTRO,
      lgpdVersaoTermo: LGPD_VERSAO_TERMO,
      ativo: indice % 29 !== 0,
      criadoEm: dataHoraUtc(somarDias(HOJE, -inteiro(1, 520)), inteiro(8, 17)),
      criadoPorId: atendentes[indice % atendentes.length]?.id,
    };
  });

  await prisma.cliente.createMany({ data: dados });
  const criados = await prisma.cliente.findMany({
    where: { cpf: { in: cpfsReservados } },
    select: { id: true, cpf: true, email: true },
  });
  if (criados.length !== cpfsReservados.length) {
    throw new Error(`Esperados ${cpfsReservados.length} clientes, encontrados ${criados.length} após a inserção.`);
  }
  registrar('Clientes', criados.length, 'CPF válido, LGPD e endereço');
  return criados as ClienteSeed[];
}

async function inserirPets(
  clientes: ClienteSeed[],
  atendentes: UsuarioSeed[]
): Promise<PetSeed[]> {
  const maxId = (await prisma.pet.aggregate({ _max: { id: true } }))._max.id ?? 0;
  const dados: Prisma.PetCreateManyInput[] = [];

  for (let indice = 0; indice < 240; indice += 1) {
    const especie = escolher(ESPECIES);
    const idade = inteiro(0, especie.idadeMax);
    const nascimentoAno = Number(somarDias(HOJE, -idade * 365).slice(0, 4));
    const pesoMin = especie.pesoMin;
    const pesoMax = Math.max(pesoMin + 0.2, especie.pesoMax - idade * 0.15);
    const peso = Number(decimal(pesoMin, pesoMax, 2));
    const cliente = clientes[indice % clientes.length] as ClienteSeed;
    dados.push({
      nome: escolher(NOMES_PET),
      especie: especie.nome,
      raca: escolher(especie.racas),
      idade,
      peso,
      nascimento: `${zeroEsquerda(inteiro(1, 12), 2)}/${nascimentoAno}`,
      clienteId: cliente.id,
      criadoPorId: atendentes[indice % atendentes.length]?.id,
      criadoEm: dataHoraUtc(somarDias(HOJE, -inteiro(1, 400)), inteiro(8, 17)),
      ativo: indice % 41 !== 0,
    });
  }

  await prisma.pet.createMany({ data: dados });
  const criados = await prisma.pet.findMany({
    where: { id: { gt: maxId }, clienteId: { in: clientes.map((cliente) => cliente.id) } },
    select: { id: true, clienteId: true, peso: true },
    orderBy: { id: 'asc' },
  });
  if (criados.length !== 240) {
    throw new Error(`Esperados 240 pets, encontrados ${criados.length} após a inserção.`);
  }
  registrar('Pets', criados.length, 'espécie/raça/idade/peso coerentes');
  return criados as PetSeed[];
}

async function inserirConsultas(
  pets: PetSeed[],
  veterinarios: UsuarioSeed[],
  atendentes: UsuarioSeed[]
): Promise<ConsultaSeed[]> {
  const maxId = (await prisma.consulta.aggregate({ _max: { id: true } }))._max.id ?? 0;
  const diasUteis = diasUteisNoPeriodo();
  const dados: Prisma.ConsultaCreateManyInput[] = [];
  const totalPorVet = 600 / veterinarios.length; // 150

  for (let indice = 0; indice < 600; indice += 1) {
    const veterinario = veterinarios[indice % veterinarios.length] as UsuarioSeed;
    const pet = pets[indice % pets.length] as PetSeed;
    const slot = Math.floor(indice / veterinarios.length);
    // Cada veterinário recebe um dia útil diferente => nunca há sobreposição.
    const dia = diasUteis[Math.min(diasUteis.length - 1, Math.floor(slot * diasUteis.length / totalPorVet))] as string;
    const hora = 8 + (slot % 8);
    const dataHora = dataHoraUtc(dia, hora, escolher([0, 0, 0, 30]));
    const duracaoMinutos = escolher([30, 45, 60, 60, 60, 90]);
    const restante = indice % 10;
    const status: (typeof STATUS_CONSULTA)[number] = restante === 0 ? 'CANCELADA'
      : restante === 1 ? 'AGENDADA'
        : restante === 2 ? 'CONFIRMADA'
          : 'CONCLUIDA';
    const atendente = atendentes[indice % atendentes.length] as UsuarioSeed;

    const registro: Prisma.ConsultaCreateManyInput = {
      dataHora,
      duracaoMinutos,
      motivo: escolher(MOTIVOS_CONSULTA),
      status,
      petId: pet.id,
      veterinarioId: veterinario.id,
      criadoPorId: atendente.id,
      criadoEm: dataHoraUtc(somarDias(dia, -inteiro(3, 30)), inteiro(8, 17)),
    };

    if (status === 'CONCLUIDA') {
      registro.exameClinico = escolher(EXAMES_CLINICOS);
      registro.diagnostico = escolher(DIAGNOSTICOS);
      registro.conduta = escolher(CONDUTAS);
      registro.prescricao = escolher(PRESCRICOES);
      registro.pesoAferido = Number(decimal(Math.max(0.2, pet.peso - 0.4), pet.peso + 0.4, 2));
      registro.temperaturaC = Number(decimal(37, 39.5, 1));
      registro.concluidaPorId = veterinario.id;
      registro.concluidaEm = new Date(dataHora.getTime() + duracaoMinutos * 60_000);
    } else if (status === 'CANCELADA') {
      registro.canceladoPorId = atendente.id;
      registro.canceladoEm = new Date(dataHora.getTime() - inteiro(1, 72) * 3_600_000);
      registro.motivoCancelamento = escolher(MOTIVOS_CANCELAMENTO);
    }
    dados.push(registro);
  }

  await prisma.consulta.createMany({ data: dados });
  const criadas = await prisma.consulta.findMany({
    where: { id: { gt: maxId } },
    select: { id: true, petId: true, veterinarioId: true, dataHora: true },
    orderBy: { id: 'asc' },
  });
  if (criadas.length !== 600) {
    throw new Error(`Esperadas 600 consultas, encontradas ${criadas.length} após a inserção.`);
  }
  registrar('Consultas', criadas.length, '18 meses, 4 statuses, sem conflito de agenda');
  return criadas as ConsultaSeed[];
}

async function inserirVacinas(
  consultas: ConsultaSeed[],
  admin: UsuarioSeed
): Promise<void> {
  const concluidas = consultas.filter((consulta) => {
    return consulta.dataHora.getTime() <= Date.now();
  });
  const maxId = (await prisma.registroVacina.aggregate({ _max: { id: true } }))._max.id ?? 0;
  const dados: Prisma.RegistroVacinaCreateManyInput[] = [];

  for (let indice = 0; indice < 400; indice += 1) {
    const base = concluidas[(indice * 7) % concluidas.length] as ConsultaSeed;
    const aplicadaEm = new Date(base.dataHora.getTime() + (5 + (indice % 40)) * 60_000);
    const aplicadaCivil = aplicadaEm.toISOString().slice(0, 10);
    const idadeAplicacao = diasEntre(aplicadaCivil, HOJE);
    const dadosVacina = escolher(VACINAS);

    let proximaCivil: string | null = null;
    switch (indice % 6) {
      case 0:
      case 5:
        break;
      case 1:
        proximaCivil = idadeAplicacao > 90
          ? somarDias(HOJE, -inteiro(1, 60))
          : somarDias(aplicadaCivil, 180);
        break;
      case 2:
        proximaCivil = maximoCivil(somarDias(aplicadaCivil, 1), somarDias(HOJE, inteiro(0, 25)));
        break;
      case 3:
        proximaCivil = maximoCivil(somarDias(aplicadaCivil, 1), somarDias(HOJE, inteiro(31, 150)));
        break;
      default:
        proximaCivil = idadeAplicacao > 150
          ? somarDias(HOJE, -inteiro(1, 90))
          : somarDias(aplicadaCivil, 365);
    }

    const estornado = indice % 37 === 0;
    const avisoAnterior = indice % 11 === 0 && proximaCivil !== null && proximaCivil < HOJE;

    const registro: Prisma.RegistroVacinaCreateManyInput = {
      petId: base.petId,
      veterinarioId: base.veterinarioId,
      consultaId: indice % 9 === 0 ? null : base.id,
      vacina: dadosVacina.nome,
      fabricante: dadosVacina.fabricante,
      lote: `VAC-${zeroEsquerda(indice + 1, 4)}-${inteiro(1000, 9999)}`,
      validade: dataCivil(somarDias(aplicadaCivil, 365 + inteiro(0, 365))),
      aplicadaEm,
      dose: dadosVacina.dose,
      proximaDose: proximaCivil === null ? null : dataCivil(proximaCivil),
      reacao: indice % 17 === 0 ? 'Leve vermelhidão no local da aplicação.' : null,
      observacoes: `Registro fictício nº ${indice + 1} da carga determinística PetHealthPD.`,
      registradoPorId: base.veterinarioId,
      registradoEm: dataHoraUtc(aplicadaCivil, inteiro(9, 18)),
      estornado,
      estornadoPorId: estornado ? admin.id : null,
      estornadoEm: estornado ? dataHoraUtc(somarDias(aplicadaCivil, 2), 14) : null,
      motivoEstorno: estornado ? 'Estorno fictício para exercitar auditoria.' : null,
      ultimoAvisoEm: avisoAnterior ? dataHoraUtc(somarDias(HOJE, -3), 10) : null,
      ultimoAvisoProximaDose: avisoAnterior ? dataCivil(proximaCivil as string) : null,
    };
    dados.push(registro);
  }

  await prisma.registroVacina.createMany({ data: dados });
  const total = (await prisma.registroVacina.aggregate({ _max: { id: true } }))._max.id ?? 0;
  if (total - maxId !== 400) {
    throw new Error(`Esperados 400 registros de vacina, encontrados ${total - maxId}.`);
  }
  registrar('Registros de vacina', 400, 'próximas doses passadas e futuras');
}

async function inserirProdutos(admin: UsuarioSeed): Promise<ProdutoSeed[]> {
  const maxId = (await prisma.produto.aggregate({ _max: { id: true } }))._max.id ?? 0;
  const dados: Prisma.ProdutoCreateManyInput[] = [];

  for (let indice = 0; indice < 50; indice += 1) {
    const grupo = CATEGORIAS_PRODUTO[indice % CATEGORIAS_PRODUTO.length] as {
      categoria: string; itens: string[];
    };
    const ativo = indice % 13 !== 0;
    const inativadoEm = ativo ? null : dataHoraUtc(somarDias(HOJE, -inteiro(1, 120)), 11);
    dados.push({
      nome: grupo.itens[Math.floor(indice / CATEGORIAS_PRODUTO.length)] as string,
      categoria: grupo.categoria,
      estoqueMinimo: inteiro(0, 30),
      alertaEstoque: indice % 7 !== 0,
      precoBrl: new Prisma.Decimal(decimal(4.9, 899.9, 2)),
      ativo,
      inativadoPorId: ativo ? null : admin.id,
      inativadoEm,
      motivoInativacao: ativo ? null : 'Produto descontinuado (dados fictícios).',
    });
  }

  await prisma.produto.createMany({ data: dados });
  const criados = await prisma.produto.findMany({
    where: { id: { gt: maxId } },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  if (criados.length !== 50) {
    throw new Error(`Esperados 50 produtos, encontrados ${criados.length} após a inserção.`);
  }
  registrar('Produtos', criados.length, 'categorias, Decimal(10,2), alertaEstoque');
  return criados as ProdutoSeed[];
}

async function inserirLotes(produtos: ProdutoSeed[], admin: UsuarioSeed): Promise<void> {
  const codigosExistentes = new Set(
    (await prisma.lote.findMany({ select: { codigo: true } })).map((lote) => lote.codigo)
  );
  const maxId = (await prisma.lote.aggregate({ _max: { id: true } }))._max.id ?? 0;
  const dados: Prisma.LoteCreateManyInput[] = [];

  for (let indice = 0; indice < 150; indice += 1) {
    const base = `LOTE-SEED-${zeroEsquerda(indice + 1, 4)}`;
    let codigo = base;
    let sufixo = 2;
    while (codigosExistentes.has(codigo)) {
      codigo = `${base}-S${sufixo}`;
      sufixo += 1;
    }
    codigosExistentes.add(codigo);

    const classe = indice % 5;
    const validadeCivil = classe === 0
      ? somarDias(HOJE, -inteiro(1, 180))
      : classe === 1 || classe === 2
        ? somarDias(HOJE, inteiro(1, 90))
        : somarDias(HOJE, inteiro(91, 540));
    const vencido = classe === 0;
    const produto = produtos[indice % produtos.length] as ProdutoSeed;

    dados.push({
      codigo,
      validade: dataCivil(validadeCivil),
      quantidade: inteiro(1, 300),
      produtoId: produto.id,
      ativo: !vencido,
      baixadoPorId: vencido ? admin.id : null,
      baixadoEm: vencido ? dataHoraUtc(somarDias(validadeCivil, 1), 9) : null,
      motivoBaixa: vencido ? 'Lote vencido (dados fictícios).' : null,
      criadoEm: dataHoraUtc(somarDias(HOJE, -inteiro(60, 500)), 10),
    });
  }

  await prisma.lote.createMany({ data: dados });
  const total = (await prisma.lote.aggregate({ _max: { id: true } }))._max.id ?? 0;
  if (total - maxId !== 150) {
    throw new Error(`Esperados 150 lotes, encontrados ${total - maxId}.`);
  }
  registrar('Lotes', 150, 'vencidos, próximos e códigos únicos');
}

async function inserirAnexos(
  consultas: ConsultaSeed[],
  veterinarios: UsuarioSeed[],
  atendentes: UsuarioSeed[]
): Promise<string> {
  const diretorio = diretorioAnexos();
  await fs.mkdir(diretorio, { recursive: true });

  const nomesExistentes = new Set(
    (await prisma.anexoClinico.findMany({ select: { nomeArquivoGerado: true } }))
      .map((anexo) => anexo.nomeArquivoGerado)
  );
  const dados: Prisma.AnexoClinicoCreateManyInput[] = [];

  for (let indice = 0; indice < 100; indice += 1) {
    const consulta = consultas[(indice * 13) % consultas.length] as ConsultaSeed;
    const categoria = ANEXO_CATEGORIAS[indice % ANEXO_CATEGORIAS.length] as string;
    const ehPdf = indice % 2 === 0;
    const extensao = ehPdf ? '.pdf' : '.png';
    const mimeType = ehPdf ? 'application/pdf' : 'image/png';
    const conteudo = ehPdf
      ? pdfSimples(`Anexo clinico ficticio ${indice + 1} - ${slug(categoria)}`)
      : pngSimples([inteiro(60, 220), inteiro(60, 220), inteiro(60, 220)]);

    let nomeArquivoGerado = `${uuidV4()}${extensao}`;
    for (;;) {
      if (!nomesExistentes.has(nomeArquivoGerado)) {
        try {
          await fs.access(path.join(diretorio, nomeArquivoGerado));
        } catch {
          break; // arquivo ainda não existe no disco
        }
      }
      nomeArquivoGerado = `${uuidV4()}${extensao}`;
    }
    nomesExistentes.add(nomeArquivoGerado);

    const caminho = path.join(diretorio, nomeArquivoGerado);
    await fs.writeFile(caminho, conteudo, { flag: 'wx' });
    ARQUIVOS_CRIADOS.push(caminho);

    const responsavel = veterinarios[indice % veterinarios.length] as UsuarioSeed;
    const registrador = atendentes[indice % atendentes.length] as UsuarioSeed;
    const dataDocumento = consulta.dataHora.toISOString().slice(0, 10);
    const nomeOriginal = `${slug(categoria)}-${zeroEsquerda(indice + 1, 3)}${extensao}`;

    dados.push({
      petId: consulta.petId,
      consultaId: indice % 5 === 0 ? null : consulta.id,
      responsavelId: responsavel.id,
      descricao: `Documento clinico ficticio ${indice + 1}: ${slug(categoria).toUpperCase()}.`.slice(0, 200),
      categoria,
      dataDocumento: dataCivil(dataDocumento),
      nomeOriginal,
      nomeArquivoGerado,
      mimeType,
      tamanhoBytes: conteudo.length,
      checksumSha256: createHash('sha256').update(conteudo).digest('hex'),
      registradoPorId: registrador.id,
      registradoEm: dataHoraUtc(dataDocumento, inteiro(9, 17)),
      inativo: false,
    });
  }

  await prisma.anexoClinico.createMany({ data: dados });
  registrar('Anexos clínicos', dados.length, `${diretorio}`);
  return diretorio;
}

async function inserirCotacoes(): Promise<void> {
  const datas = Array.from({ length: 30 }, (_, indice) => somarDias(HOJE, indice - 29));
  const existentes = new Set(
    (await prisma.cotacaoDolar.findMany({
      where: { dataReferencia: { in: datas.map(dataCivil) } },
      select: { dataReferencia: true },
    })).map((cotacao) => cotacao.dataReferencia.toISOString().slice(0, 10))
  );

  const dados: Prisma.CotacaoDolarCreateManyInput[] = [];
  for (const data of datas) {
    if (existentes.has(data)) continue; // preserva cotação real já persistida
    dados.push({
      dataReferencia: dataCivil(data),
      valor: new Prisma.Decimal(decimal(4.8, 6.4, 4)),
      fonte: 'AwesomeAPI (carga fictícia)',
      consultadoEm: dataHoraUtc(data, 12),
    });
  }

  if (dados.length > 0) await prisma.cotacaoDolar.createMany({ data: dados });
  registrar('Cotações do dólar', dados.length,
    existentes.size > 0 ? `${existentes.size} data(s) já existente(s) preservada(s)` : '30 dias consecutivos');
}

async function executar(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL não configurada. Verifique o .env na raiz do projeto.');
  }

  console.log('[seed:dados] Iniciando carga determinística (semente 0x50484450).');
  // A checagem de idempotência acontece ANTES de qualquer inserção.
  const cpfsReservados = await gerarCpfsReservados();

  const { admin, veterinarios, atendentes } = await inserirUsuarios();
  const clientes = await inserirClientes(cpfsReservados, atendentes);
  const pets = await inserirPets(clientes, atendentes);
  const consultas = await inserirConsultas(pets, veterinarios, atendentes);
  await inserirVacinas(consultas, admin);
  const produtos = await inserirProdutos(admin);
  await inserirLotes(produtos, admin);
  await inserirAnexos(consultas, veterinarios, atendentes);
  await inserirCotacoes();

  const segundos = ((Date.now() - INICIO) / 1000).toFixed(1).replace('.', ',');
  console.log(`[seed:dados] Carga concluída em ${segundos}s. Nenhuma tabela foi apagada.`);
}

async function main(): Promise<void> {
  try {
    await executar();
  } catch (erro) {
    if (erro instanceof Error && erro.message === 'SEED_JA_EXECUTADO') return;

    console.error('[seed:dados] Falha:', erro instanceof Error ? erro.message : erro);
    for (const caminho of ARQUIVOS_CRIADOS) {
      await fs.unlink(caminho).catch(() => undefined);
    }
    if (ARQUIVOS_CRIADOS.length > 0) {
      console.error(`[seed:dados] ${ARQUIVOS_CRIADOS.length} arquivo(s) físico(s) criado(s) nesta execução foram removidos.`);
    }
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => {
      console.error('[seed:dados] Aviso: não foi possível encerrar a conexão com o banco.');
    });
  }
}

void main();
