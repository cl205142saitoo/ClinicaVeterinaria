/**
 * Carga complementar de preços, orçamentos e financeiro do PetHealthPD (Fase 2).
 *
 * Uso (PowerShell, na raiz do projeto):
 *   npm run seed:financeiro
 *
 * IDEMPOTENTE POR SEGURANÇA: antes de qualquer gravação a carga confere se já
 * existe TabelaPreco com código no prefixo reservado `SEED-F2-`. Se existir,
 * avisa e termina sem apagar, alterar ou inserir nada. Nunca emite
 * DELETE/TRUNCATE. Todas as gravações acontecem em UMA transação: qualquer
 * falha desfaz a carga inteira, deixando o banco como estava.
 *
 * A carga NÃO substitui a Fase 1: apenas complementa clientes, pets, produtos e
 * usuários já existentes, todos lidos do banco para manter as FKs válidas.
 *
 * PRNG determinístico (mulberry32, semente 0x46325044 — diferente do
 * seed:dados), datas relativas ao dia civil da clínica (America/Sao_Paulo) e
 * horários convertidos para UTC. Colunas @db.Date usam
 * `YYYY-MM-DDT00:00:00.000Z`; DATETIME(6) recebe instantes em UTC; valores
 * monetários usam Prisma.Decimal com duas casas. Todos os CHECKs das
 * migrations e os limites de VARCHAR são respeitados.
 *
 * Variáveis lidas do .env (mesmo padrão do seed da Fase 1):
 *   DATABASE_URL, PHD_ADMIN_NOME, PHD_ADMIN_EMAIL, PHD_ADMIN_SENHA,
 *   PHD_ANEXOS_DIR.
 */
/** Primeiro import: o Prisma Client não carrega .env sozinho fora do CLI. */
import { carregarEnv } from '../src/main/config/carregarEnv';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  FORMA_PAGAMENTO_MAXIMA,
  ITEM_QUANTIDADE_MAXIMA,
  MOVIMENTACAO_STATUS,
  MOVIMENTACAO_TIPOS,
  ORCAMENTO_STATUS,
  ORIGEM_HISTORICO_PRECO,
  PRECO_ITEM_TIPOS,
} from '../src/shared/constants';
import { dataCivilClinica } from '../src/shared/datas';
import { ehCpf, ehDataCivil } from '../src/shared/validators';

carregarEnv([
  'DATABASE_URL',
  'PHD_ADMIN_NOME',
  'PHD_ADMIN_EMAIL',
  'PHD_ADMIN_SENHA',
  'PHD_ANEXOS_DIR',
]);

const prisma = new PrismaClient();
const INICIO = Date.now();

const PREFIXO_RESERVADO = 'SEED-F2-';
const SEMENTE_FIXA = 0x46325044; // "F2PD" — distinto de 0x50484450 (seed:dados)
const TOTAL_TABELAS = 30;
const TOTAL_HISTORICO = 40;
const TOTAL_ORCAMENTOS = 80;
const TOTAL_MOVIMENTACOES = 200;

type StatusOrcamento = (typeof ORCAMENTO_STATUS)[number];
type StatusMovimentacao = (typeof MOVIMENTACAO_STATUS)[number];
type TipoMovimentacao = (typeof MOVIMENTACAO_TIPOS)[number];
type OrigemPreco = (typeof ORIGEM_HISTORICO_PRECO)[number];
type TipoItem = (typeof PRECO_ITEM_TIPOS)[number];

interface UsuarioSeed {
  id: number;
  role: string;
}

interface ClienteSeed {
  id: number;
  nome: string;
  cpf: string;
  telefone: string;
}

interface PetSeed {
  id: number;
  clienteId: number;
  nome: string;
}

interface ProdutoSeed {
  id: number;
  nome: string;
  precoBrl: Prisma.Decimal;
}

interface TabelaSeed {
  id: number;
  codigo: string;
  descricao: string;
  preco: Prisma.Decimal;
}

interface OrcamentoAprovado {
  id: number;
  total: Prisma.Decimal;
}

interface PerfilMovimentacao {
  tipo: TipoMovimentacao;
  status: StatusMovimentacao;
  vencimento: string;
  pagamento: string | null;
  formaPagamento: string | null;
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
  if (itens.length === 0) throw new Error('Lista vazia: não é possível escolher um item.');
  return itens[inteiro(0, itens.length - 1)] as T;
}

function embaralhar<T>(itens: T[]): T[] {
  for (let indice = itens.length - 1; indice > 0; indice -= 1) {
    const outro = inteiro(0, indice);
    const temporario = itens[indice] as T;
    itens[indice] = itens[outro] as T;
    itens[outro] = temporario;
  }
  return itens;
}

function decimal(minimo: number, maximo: number): string {
  return (minimo + aleatorio() * (maximo - minimo)).toFixed(2);
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
    .slice(0, 20);
}

function garantir(condicao: boolean, mensagem: string): void {
  if (!condicao) throw new Error(mensagem);
}

/** Decimal com exatamente duas casas, pronto para colunas DECIMAL(10,2). */
function dinheiro(valor: string | number | Prisma.Decimal): Prisma.Decimal {
  const bruto = valor instanceof Prisma.Decimal ? valor : new Prisma.Decimal(valor);
  return new Prisma.Decimal(bruto.toFixed(2));
}

/* ------------------------------- Datas ---------------------------------- */

const HOJE = dataCivilClinica(new Date());

/** Construtor único de @db.Date exigido pelo projeto. */
function dataCivil(civil: string): Date {
  garantir(ehDataCivil(civil), `Data civil inválida: ${civil}`);
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

/** Horário local de São Paulo (UTC-3, sem DST desde 2019) convertido para UTC. */
function dataHoraUtc(civil: string, horaLocal: number, minuto = 0): Date {
  const [ano, mes, dia] = partesCivil(civil);
  return new Date(Date.UTC(ano, mes - 1, dia, horaLocal + 3, minuto, 0, 0));
}

/* --------------------------- Listas fictícias ---------------------------- */

interface ServicoSeed {
  descricao: string;
  categoria: string;
  preco: string;
}

const SERVICOS: readonly ServicoSeed[] = [
  { descricao: 'Consulta clínica geral com avaliação completa e orientações ao tutor.', categoria: 'Clínica geral', preco: '180.00' },
  { descricao: 'Consulta de emergência com atendimento imediato e estabilização.', categoria: 'Emergência', preco: '280.00' },
  { descricao: 'Consulta geriátrica com avaliação de qualidade de vida e dor.', categoria: 'Clínica geral', preco: '220.00' },
  { descricao: 'Vacina V8 para cães, dose de reforço anual.', categoria: 'Vacinação', preco: '160.00' },
  { descricao: 'Vacina V10 para cães, dose de reforço anual.', categoria: 'Vacinação', preco: '175.00' },
  { descricao: 'Vacina antirrábica para cães, dose única.', categoria: 'Vacinação', preco: '90.00' },
  { descricao: 'Vacina quádrupla felina, dose de reforço anual.', categoria: 'Vacinação', preco: '165.00' },
  { descricao: 'Vacina tríplice felina, primeira dose.', categoria: 'Vacinação', preco: '150.00' },
  { descricao: 'Vacina antirrábica para gatos, dose única.', categoria: 'Vacinação', preco: '95.00' },
  { descricao: 'Hemograma completo com contagem de células e plaquetas.', categoria: 'Diagnóstico', preco: '140.00' },
  { descricao: 'Perfil bioquímico sanguíneo ampliado.', categoria: 'Diagnóstico', preco: '210.00' },
  { descricao: 'Urina tipo I com análise física, química e microscópica.', categoria: 'Diagnóstico', preco: '95.00' },
  { descricao: 'Exame parasitológico de fezes por método de flutuação.', categoria: 'Diagnóstico', preco: '85.00' },
  { descricao: 'Teste rápido para FIV e FeLV em felinos.', categoria: 'Diagnóstico', preco: '130.00' },
  { descricao: 'Teste rápido para parvovirose canina.', categoria: 'Diagnóstico', preco: '125.00' },
  { descricao: 'Radiografia simples, uma incidência, com laudo.', categoria: 'Imagem', preco: '190.00' },
  { descricao: 'Ultrassonografia abdominal com laudo especializado.', categoria: 'Imagem', preco: '320.00' },
  { descricao: 'Eletrocardiograma (ECG) com traçado e interpretação.', categoria: 'Diagnóstico', preco: '240.00' },
  { descricao: 'Banho e tosa para animais de pequeno porte.', categoria: 'Banho e tosa', preco: '120.00' },
  { descricao: 'Banho e tosa para animais de médio porte.', categoria: 'Banho e tosa', preco: '160.00' },
  { descricao: 'Banho e tosa para animais de grande porte.', categoria: 'Banho e tosa', preco: '220.00' },
  { descricao: 'Corte e limpeza de unhas com lixamento final.', categoria: 'Banho e tosa', preco: '55.00' },
  { descricao: 'Limpeza dentária com ultrassom e polimento.', categoria: 'Odontologia', preco: '480.00' },
  { descricao: 'Extração dentária simples com anestesia local.', categoria: 'Odontologia', preco: '350.00' },
  { descricao: 'Castração de macho de pequeno porte, incluindo anestesia.', categoria: 'Cirurgia', preco: '620.00' },
  { descricao: 'Castração de fêmea de pequeno porte, incluindo anestesia.', categoria: 'Cirurgia', preco: '890.00' },
  { descricao: 'Castração de macho de médio ou grande porte.', categoria: 'Cirurgia', preco: '850.00' },
  { descricao: 'Curativo e troca de bandagem com avaliação da ferida.', categoria: 'Enfermagem', preco: '90.00' },
  { descricao: 'Aplicação de medicamento injetável prescrito.', categoria: 'Enfermagem', preco: '65.00' },
  { descricao: 'Internamento em gaiola, diária com monitoramento.', categoria: 'Internamento', preco: '260.00' },
];

const MOTIVOS_HISTORICO = [
  'Reajuste anual de preço registrado na carga Fase 2.',
  'Alinhamento de valor com a tabela vigente (carga Fase 2).',
  'Correção de valor após revisão administrativa (carga Fase 2).',
  'Atualização de tabela de serviços veterinários (carga Fase 2).',
] as const;

const MOTIVOS_CANCELAMENTO_ORCAMENTO = [
  'Tutor solicitou cancelamento da proposta (carga Fase 2).',
  'Proposta substituída por orçamento revisado (carga Fase 2).',
  'Procedimento descontinuado pela clínica (carga Fase 2).',
] as const;

const MOTIVOS_CANCELAMENTO_MOVIMENTACAO = [
  'Cancelamento solicitado pela administração (carga Fase 2).',
  'Duplicidade identificada na conferência financeira (carga Fase 2).',
  'Serviço cancelado pelo tutor (carga Fase 2).',
] as const;

const CATEGORIAS_RECEITA = [
  'Honorários veterinários', 'Vacinação', 'Exames e diagnóstico', 'Cirurgias',
  'Banho e tosa', 'Medicamentos e insumos', 'Consultas de emergência', 'Internamento',
] as const;

const CATEGORIAS_DESPESA = [
  'Folha de pagamento', 'Aluguel da clínica', 'Insumos clínicos', 'Energia elétrica',
  'Água e saneamento', 'Internet e telefonia', 'Manutenção de equipamentos',
  'Marketing e publicidade', 'Fornecedores', 'Limpeza e conservação',
] as const;

const FORMAS_PAGAMENTO = [
  'DINHEIRO', 'PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'BOLETO', 'TRANSFERENCIA',
] as const;

/* ------------------------------- Saída ---------------------------------- */

function registrar(entidade: string, quantidade: number, detalhe = ''): void {
  const sufixo = detalhe ? ` — ${detalhe}` : '';
  console.log(`[seed:financeiro] ${entidade.padEnd(24)} ${zeroEsquerda(quantidade, 4)}${sufixo}`);
}

/* ---------------------------- Base do banco ------------------------------ */

async function carregarBase(): Promise<{
  responsaveis: UsuarioSeed[];
  criadores: UsuarioSeed[];
  clientes: ClienteSeed[];
  petsPorCliente: Map<number, PetSeed[]>;
  produtos: ProdutoSeed[];
}> {
  const [usuarios, clientes, pets, produtos] = await Promise.all([
    prisma.usuario.findMany({
      where: { ativo: true },
      select: { id: true, role: true },
      orderBy: { id: 'asc' },
    }),
    prisma.cliente.findMany({
      where: { ativo: true },
      select: { id: true, nome: true, cpf: true, telefone: true },
      orderBy: { id: 'asc' },
    }),
    prisma.pet.findMany({
      where: { ativo: true },
      select: { id: true, clienteId: true, nome: true },
      orderBy: { id: 'asc' },
    }),
    prisma.produto.findMany({
      where: { ativo: true },
      select: { id: true, nome: true, precoBrl: true },
      orderBy: { id: 'asc' },
    }),
  ]);

  const usuariosSeed: UsuarioSeed[] = usuarios.map((usuario) => ({
    id: usuario.id,
    role: usuario.role,
  }));
  const aptos = usuariosSeed.filter(
    (usuario) => usuario.role === 'ADMIN' || usuario.role === 'VETERINARIO'
  );
  const responsaveis = aptos.length > 0 ? aptos : usuariosSeed;
  const criadores = responsaveis; // ADMIN/VET podem criar orçamentos e movimentações

  garantir(responsaveis.length > 0, 'Nenhum usuário ativo encontrado para a auditoria.');
  garantir(clientes.length > 0, 'Nenhum cliente ativo encontrado; rode npm run seed:dados primeiro.');
  garantir(produtos.length > 0, 'Nenhum produto ativo encontrado; rode npm run seed:dados primeiro.');

  const petsPorCliente = new Map<number, PetSeed[]>();
  for (const pet of pets) {
    const lista = petsPorCliente.get(pet.clienteId) ?? [];
    lista.push(pet);
    petsPorCliente.set(pet.clienteId, lista);
  }

  console.log(
    `[seed:financeiro] Base lida: ${usuariosSeed.length} usuário(s), ${clientes.length} cliente(s), ` +
      `${pets.length} pet(s), ${produtos.length} produto(s).`
  );

  return {
    responsaveis,
    criadores,
    clientes: clientes as ClienteSeed[],
    petsPorCliente,
    produtos: produtos as ProdutoSeed[],
  };
}

/* --------------------------- Idempotência -------------------------------- */

async function verificarIdempotencia(): Promise<void> {
  const existentes = await prisma.tabelaPreco.count({
    where: { codigo: { startsWith: PREFIXO_RESERVADO } },
  });
  if (existentes === 0) return;

  console.warn('[seed:financeiro] ----------------------------------------------------------------');
  console.warn(
    `[seed:financeiro] ABORTADO: já existem ${existentes} tabela(s) de preço com o código reservado ` +
      `'${PREFIXO_RESERVADO}'.`
  );
  console.warn(
    '[seed:financeiro] A carga é idempotente por segurança: nada foi apagado, alterado ou inserido.'
  );
  console.warn('[seed:financeiro] Para refazer, use um banco com outro schema — nunca delete tabelas.');
  console.warn('[seed:financeiro] ----------------------------------------------------------------');
  throw new Error('SEED_JA_EXECUTADO');
}

/* ----------------------------- Gravações -------------------------------- */

function montarPerfisMovimentacao(): PerfilMovimentacao[] {
  const perfis: PerfilMovimentacao[] = [];

  // 60 receitas pagas: alimentam faturamento, saldo, ticket médio e série mensal.
  for (let indice = 0; indice < 60; indice += 1) {
    const vencimento = somarDias(HOJE, -(indice * 6 + inteiro(1, 5)));
    const pagamento = somarDias(vencimento, inteiro(0, 6));
    perfis.push({
      tipo: MOVIMENTACAO_TIPOS[0],
      status: MOVIMENTACAO_STATUS[1],
      vencimento,
      pagamento: pagamento <= HOJE ? pagamento : HOJE,
      formaPagamento: escolher(FORMAS_PAGAMENTO),
    });
  }

  // 40 receitas pendentes VENCIDAS: base da KPI de inadimplência.
  for (let indice = 0; indice < 40; indice += 1) {
    perfis.push({
      tipo: MOVIMENTACAO_TIPOS[0],
      status: MOVIMENTACAO_STATUS[0],
      vencimento: somarDias(HOJE, -inteiro(1, 240)),
      pagamento: null,
      formaPagamento: null,
    });
  }

  // 8 receitas pendentes a vencer (não entram na inadimplência).
  for (let indice = 0; indice < 8; indice += 1) {
    perfis.push({
      tipo: MOVIMENTACAO_TIPOS[0],
      status: MOVIMENTACAO_STATUS[0],
      vencimento: somarDias(HOJE, inteiro(1, 60)),
      pagamento: null,
      formaPagamento: null,
    });
  }

  // 12 receitas canceladas.
  for (let indice = 0; indice < 12; indice += 1) {
    perfis.push({
      tipo: MOVIMENTACAO_TIPOS[0],
      status: MOVIMENTACAO_STATUS[2],
      vencimento: somarDias(HOJE, -inteiro(3, 300)),
      pagamento: null,
      formaPagamento: null,
    });
  }

  // 45 despesas pagas: alimentam despesas pagas e saldo dos relatórios.
  for (let indice = 0; indice < 45; indice += 1) {
    const vencimento = somarDias(HOJE, -(indice * 7 + inteiro(1, 6)));
    const pagamento = somarDias(vencimento, inteiro(0, 7));
    perfis.push({
      tipo: MOVIMENTACAO_TIPOS[1],
      status: MOVIMENTACAO_STATUS[1],
      vencimento,
      pagamento: pagamento <= HOJE ? pagamento : HOJE,
      formaPagamento: escolher(FORMAS_PAGAMENTO),
    });
  }

  // 20 despesas pendentes: 10 vencidas e 10 a vencer.
  for (let indice = 0; indice < 20; indice += 1) {
    perfis.push({
      tipo: MOVIMENTACAO_TIPOS[1],
      status: MOVIMENTACAO_STATUS[0],
      vencimento: indice < 10
        ? somarDias(HOJE, -inteiro(1, 150))
        : somarDias(HOJE, inteiro(1, 45)),
      pagamento: null,
      formaPagamento: null,
    });
  }

  // 15 despesas canceladas.
  for (let indice = 0; indice < 15; indice += 1) {
    perfis.push({
      tipo: MOVIMENTACAO_TIPOS[1],
      status: MOVIMENTACAO_STATUS[2],
      vencimento: somarDias(HOJE, -inteiro(3, 280)),
      pagamento: null,
      formaPagamento: null,
    });
  }

  garantir(perfis.length === TOTAL_MOVIMENTACOES, 'Quantidade de perfis financeiros inconsistente.');
  return embaralhar(perfis);
}

async function executar(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL não configurada. Verifique o .env na raiz do projeto.');
  }

  console.log(`[seed:financeiro] Iniciando carga determinística (semente 0x${SEMENTE_FIXA.toString(16).toUpperCase()}).`);
  // Checagem de idempotência ANTES de qualquer escrita.
  await verificarIdempotencia();

  const base = await carregarBase();

  const resultado = await prisma.$transaction(
    async (tx) => {
      /* --------------------------- Tabelas de preço ------------------------ */
      const codigos = SERVICOS.map((servico, indice) => {
        const codigo = `${PREFIXO_RESERVADO}${zeroEsquerda(indice + 1, 2)}-${slug(servico.descricao)}`;
        garantir(codigo.length <= 40, `Código de tabela acima de 40 caracteres: ${codigo}`);
        garantir(servico.descricao.length <= 160, 'Descrição de tabela acima de 160 caracteres.');
        garantir(servico.categoria.length <= 80, 'Categoria de tabela acima de 80 caracteres.');
        return codigo;
      });
      garantir(new Set(codigos).size === TOTAL_TABELAS, 'Códigos de tabela repetidos.');

      await tx.tabelaPreco.createMany({
        data: SERVICOS.map((servico, indice) => ({
          codigo: codigos[indice] as string,
          descricao: servico.descricao,
          categoria: servico.categoria,
          preco: dinheiro(servico.preco),
          ativo: true,
          criadoEm: dataHoraUtc(somarDias(HOJE, -inteiro(30, 400)), inteiro(8, 17)),
        })),
      });

      const tabelasCriadas = await tx.tabelaPreco.findMany({
        where: { codigo: { in: codigos } },
        select: { id: true, codigo: true, descricao: true, preco: true },
      });
      garantir(
        tabelasCriadas.length === TOTAL_TABELAS,
        `Esperadas ${TOTAL_TABELAS} tabelas, encontradas ${tabelasCriadas.length} após a inserção.`
      );
      const tabelas: TabelaSeed[] = tabelasCriadas;

      /* --------------------------- Histórico de preço ---------------------- */
      const historico: Prisma.HistoricoPrecoCreateManyInput[] = [];

      // 20 registros de PRODUTO usando preços reais do banco como referência.
      for (let indice = 0; indice < TOTAL_HISTORICO / 2; indice += 1) {
        const produto = base.produtos[(indice * 7) % base.produtos.length] as ProdutoSeed;
        const anterior = dinheiro(produto.precoBrl);
        const fator = escolher([0.9, 0.95, 1.05, 1.1, 1.15]);
        const novo = dinheiro(anterior.mul(fator));
        const motivo = escolher(MOTIVOS_HISTORICO);
        garantir(motivo.length <= 255, 'Motivo do histórico acima de 255 caracteres.');
        historico.push({
          origem: ORIGEM_HISTORICO_PRECO[0] as OrigemPreco,
          origemId: produto.id,
          anterior,
          novo,
          responsavelId: escolher(base.responsaveis).id,
          motivo,
          criadoEm: dataHoraUtc(somarDias(HOJE, -inteiro(1, 300)), inteiro(8, 18), inteiro(0, 59)),
        });
      }

      // 20 registros de TABELA_PRECO entre os 30 serviços criados.
      for (const tabela of embaralhar([...tabelas]).slice(0, TOTAL_HISTORICO / 2)) {
        const anterior = dinheiro(tabela.preco);
        const fator = escolher([0.9, 0.95, 1.05, 1.1, 1.15]);
        const novo = dinheiro(anterior.mul(fator));
        const motivo = escolher(MOTIVOS_HISTORICO);
        historico.push({
          origem: ORIGEM_HISTORICO_PRECO[1] as OrigemPreco,
          origemId: tabela.id,
          anterior,
          novo,
          responsavelId: escolher(base.responsaveis).id,
          motivo,
          criadoEm: dataHoraUtc(somarDias(HOJE, -inteiro(1, 300)), inteiro(8, 18), inteiro(0, 59)),
        });
      }
      garantir(historico.length === TOTAL_HISTORICO, 'Quantidade de histórico inconsistente.');
      await tx.historicoPreco.createMany({ data: historico });

      /* ----------------------------- Orçamentos ---------------------------- */
      const statusOrcamentos: StatusOrcamento[] = embaralhar([
        ...Array<StatusOrcamento>(30).fill(ORCAMENTO_STATUS[0]),
        ...Array<StatusOrcamento>(24).fill(ORCAMENTO_STATUS[1]),
        ...Array<StatusOrcamento>(14).fill(ORCAMENTO_STATUS[2]),
        ...Array<StatusOrcamento>(12).fill(ORCAMENTO_STATUS[3]),
      ]);

      // Reserva os números já usados no banco para não violar o UNIQUE.
      const numerosExistentes = new Set(
        (await tx.orcamento.findMany({ select: { numero: true } })).map((item) => item.numero)
      );
      const sequenciasPorMes = new Map<string, number>();

      const aprovados: OrcamentoAprovado[] = [];
      let totalItens = 0;

      for (let indice = 0; indice < TOTAL_ORCAMENTOS; indice += 1) {
        const cliente = escolher(base.clientes);
        const petsDoCliente = base.petsPorCliente.get(cliente.id) ?? [];
        const pet = petsDoCliente.length > 0 && indice % 9 !== 0 ? escolher(petsDoCliente) : null;
        const civilCriacao = somarDias(HOJE, -inteiro(0, 400));
        const chaveMes = civilCriacao.slice(0, 7).replace('-', '');
        const criadoEm = dataHoraUtc(civilCriacao, inteiro(8, 17), escolher([0, 15, 30, 45]));

        let sequencia = sequenciasPorMes.get(chaveMes) ?? 0;
        let numero = '';
        do {
          sequencia += 1;
          numero = `ORC-${chaveMes}-${zeroEsquerda(sequencia, 4)}`;
        } while (numerosExistentes.has(numero));
        numerosExistentes.add(numero);
        sequenciasPorMes.set(chaveMes, sequencia);
        garantir(numero.length <= 30, `Número de orçamento acima de 30 caracteres: ${numero}`);

        const itens: Prisma.OrcamentoItemUncheckedCreateWithoutOrcamentoInput[] = [];
        let somaItens = new Prisma.Decimal(0);
        const quantidadeItens = inteiro(2, 5);

        for (let posicao = 0; posicao < quantidadeItens; posicao += 1) {
          const tipo: TipoItem = aleatorio() < 0.55 ? PRECO_ITEM_TIPOS[1] : PRECO_ITEM_TIPOS[0];
          let produtoId: number | null = null;
          let tabelaPrecoId: number | null = null;
          let descricao: string;
          let precoUnitario: Prisma.Decimal;

          if (tipo === PRECO_ITEM_TIPOS[1]) {
            const tabela = escolher(tabelas);
            tabelaPrecoId = tabela.id;
            precoUnitario = dinheiro(tabela.preco);
            descricao = `Serviço: ${tabela.descricao}`.slice(0, 200);
          } else {
            const produto = escolher(base.produtos);
            produtoId = produto.id;
            precoUnitario = dinheiro(produto.precoBrl);
            descricao = `Produto: ${produto.nome}`.slice(0, 200);
          }

          const quantidade = inteiro(1, 6);
          garantir(quantidade > 0 && quantidade <= ITEM_QUANTIDADE_MAXIMA, 'Quantidade de item inválida.');
          const subtotal = dinheiro(precoUnitario.mul(quantidade));
          somaItens = somaItens.add(subtotal);

          itens.push({
            tipo,
            produtoId,
            tabelaPrecoId,
            descricao,
            quantidade,
            precoUnitario,
            subtotal,
            criadoEm,
          });
        }

        const fatorDesconto = escolher([0, 0, 0.05, 0.1, 0.15]);
        let desconto = dinheiro(somaItens.mul(fatorDesconto));
        if (desconto.gt(somaItens)) desconto = somaItens;

        const status = statusOrcamentos[indice] as StatusOrcamento;
        const cancelado = status === ORCAMENTO_STATUS[3];
        const canceladoCivil = somarDias(civilCriacao, inteiro(1, 10));
        const canceladoEm = dataHoraUtc(canceladoCivil <= HOJE ? canceladoCivil : HOJE, 10);
        const cpfFormatado = ehCpf(cliente.cpf)
          ? `${cliente.cpf.slice(0, 3)}.${cliente.cpf.slice(3, 6)}.${cliente.cpf.slice(6, 9)}-${cliente.cpf.slice(9)}`
          : 'não informado';

        const orcamento = await tx.orcamento.create({
          data: {
            numero,
            clienteId: cliente.id,
            petId: pet?.id ?? null,
            status,
            validade: dataCivil(somarDias(civilCriacao, inteiro(15, 60))),
            desconto,
            observacoes:
              `Proposta fictícia da carga Fase 2. Tutor: ${cliente.nome} (${cpfFormatado}, ` +
              `${cliente.telefone}). Pet: ${pet?.nome ?? 'não vinculado'}.`,
            criadoPorId: escolher(base.criadores).id,
            canceladoPorId: cancelado ? escolher(base.criadores).id : null,
            canceladoEm: cancelado ? canceladoEm : null,
            motivoCancelamento: cancelado ? escolher(MOTIVOS_CANCELAMENTO_ORCAMENTO) : null,
            criadoEm,
            atualizadoEm: cancelado ? canceladoEm : criadoEm,
            itens: { create: itens },
          },
          select: { id: true },
        });

        totalItens += itens.length;
        if (status === ORCAMENTO_STATUS[1]) {
          aprovados.push({ id: orcamento.id, total: dinheiro(somaItens.sub(desconto)) });
        }
      }
      garantir(aprovados.length > 0, 'Nenhum orçamento aprovado foi criado.');

      /* -------------------------- Movimentações ---------------------------- */
      const perfis = montarPerfisMovimentacao();
      const movimentacoes: Prisma.MovimentacaoFinanceiraCreateManyInput[] = [];

      for (const [indice, perfil] of perfis.entries()) {
        const ehReceita = perfil.tipo === MOVIMENTACAO_TIPOS[0];
        const pago = perfil.status === MOVIMENTACAO_STATUS[1];
        const cancelado = perfil.status === MOVIMENTACAO_STATUS[2];

        const categoria = ehReceita ? escolher(CATEGORIAS_RECEITA) : escolher(CATEGORIAS_DESPESA);
        garantir(categoria.length >= 2 && categoria.length <= 80, 'Categoria financeira fora do limite.');

        const cliente = escolher(base.clientes);
        const descricao = (
          ehReceita
            ? `Recebimento de ${categoria.toLowerCase()} — ${cliente.nome}.`
            : `Pagamento de ${categoria.toLowerCase()} a fornecedor credenciado.`
        ).slice(0, 200);
        garantir(descricao.length >= 3, 'Descrição financeira muito curta.');

        let orcamentoId: number | null = null;
        let valor = dinheiro(decimal(40, 2200));
        if (ehReceita && !cancelado && indice % 2 === 0) {
          const aprovado = escolher(aprovados);
          orcamentoId = aprovado.id;
          if (aprovado.total.gt(0)) valor = aprovado.total;
        }

        const formaPagamento = pago ? perfil.formaPagamento : null;
        garantir(
          formaPagamento === null || (formaPagamento.length >= 1 && formaPagamento.length <= FORMA_PAGAMENTO_MAXIMA),
          'Forma de pagamento fora do limite.'
        );
        garantir(valor.gt(0), 'Valor de movimentação deve ser positivo.');

        const pagamentoCivil = perfil.pagamento;
        const baseCriacao = pagamentoCivil ?? perfil.vencimento;
        const criadoEm = dataHoraUtc(somarDias(baseCriacao, -inteiro(1, 15)), inteiro(8, 17), inteiro(0, 59));
        const baixadoEm = pago && pagamentoCivil !== null
          ? dataHoraUtc(pagamentoCivil, inteiro(9, 17), inteiro(0, 59))
          : null;
        const canceladoEm = cancelado
          ? dataHoraUtc(somarDias(perfil.vencimento, -inteiro(1, 5)) <= HOJE
            ? somarDias(perfil.vencimento, -inteiro(1, 5))
            : HOJE, 11)
          : null;
        const motivoCancelamento = cancelado ? escolher(MOTIVOS_CANCELAMENTO_MOVIMENTACAO) : null;

        movimentacoes.push({
          tipo: perfil.tipo,
          categoria,
          descricao,
          valor,
          vencimento: dataCivil(perfil.vencimento),
          pagamento: pagamentoCivil === null ? null : dataCivil(pagamentoCivil),
          status: perfil.status,
          formaPagamento,
          orcamentoId,
          criadoPorId: escolher(base.criadores).id,
          baixadoPorId: pago ? escolher(base.criadores).id : null,
          baixadoEm,
          canceladoPorId: cancelado ? escolher(base.criadores).id : null,
          canceladoEm,
          motivoCancelamento,
          criadoEm,
          atualizadoEm: baixadoEm ?? canceladoEm ?? criadoEm,
        });
      }
      garantir(movimentacoes.length === TOTAL_MOVIMENTACOES, 'Quantidade de movimentações inconsistente.');
      await tx.movimentacaoFinanceira.createMany({ data: movimentacoes });

      /* --------------------------- Conferência ----------------------------- */
      const [tabelasPrefixo, historicoTotal, orcamentosTotal, itensTotal, movimentacoesTotal] =
        await Promise.all([
          tx.tabelaPreco.count({ where: { codigo: { startsWith: PREFIXO_RESERVADO } } }),
          tx.historicoPreco.count(),
          tx.orcamento.count(),
          tx.orcamentoItem.count(),
          tx.movimentacaoFinanceira.count(),
        ]);

      return {
        tabelas: tabelasPrefixo,
        historico: historicoTotal,
        orcamentos: orcamentosTotal,
        itens: itensTotal,
        movimentacoes: movimentacoesTotal,
        itensCriados: totalItens,
        aprovados: aprovados.length,
      };
    },
    { maxWait: 15_000, timeout: 180_000 }
  );

  /* ------------------------------- Resumo -------------------------------- */
  registrar('Tabelas de preço', resultado.tabelas, `${TOTAL_TABELAS} serviços em pt-BR`);
  registrar('Histórico de preço', resultado.historico, '20 PRODUTO + 20 TABELA_PRECO');
  registrar('Orçamentos', resultado.orcamentos, '4 statuses, numeração ORC-YYYYMM-####');
  registrar('Itens de orçamento', resultado.itens, `${resultado.itensCriados} novos (2 a 5 por orçamento)`);
  registrar('Movimentações', resultado.movimentacoes, `${resultado.aprovados} orçamentos aprovados vinculáveis`);

  const [receitasPagas, receitasPendentesVencidas] = await Promise.all([
    prisma.movimentacaoFinanceira.count({
      where: { tipo: MOVIMENTACAO_TIPOS[0], status: MOVIMENTACAO_STATUS[1] },
    }),
    prisma.movimentacaoFinanceira.count({
      where: {
        tipo: MOVIMENTACAO_TIPOS[0],
        status: MOVIMENTACAO_STATUS[0],
        vencimento: { lt: dataCivil(HOJE) },
      },
    }),
  ]);
  console.log(
    `[seed:financeiro] KPIs preparados: ${receitasPagas} receita(s) paga(s), ` +
      `${receitasPendentesVencidas} receita(s) pendente(s) vencida(s).`
  );

  const segundos = ((Date.now() - INICIO) / 1000).toFixed(1).replace('.', ',');
  console.log(`[seed:financeiro] Carga concluída em ${segundos}s. Nenhuma tabela foi apagada.`);
}

async function main(): Promise<void> {
  try {
    await executar();
  } catch (erro) {
    if (erro instanceof Error && erro.message === 'SEED_JA_EXECUTADO') return;
    console.error('[seed:financeiro] Falha:', erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => {
      console.error('[seed:financeiro] Aviso: não foi possível encerrar a conexão com o banco.');
    });
  }
}

void main();
