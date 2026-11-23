import { dialog, type SaveDialogReturnValue } from 'electron';
import { writeFile } from 'fs/promises';
import {
  ESTOQUE_ALERTA_VALIDADE_DIAS,
  RELATORIO_PERIODO_MAXIMO_MESES,
} from '../../shared/constants';
import { dataCivilClinica, FUSO_CLINICA } from '../../shared/datas';
import { ErroAplicacao } from '../../shared/errors';
import type {
  AlertaEstoqueRelatorio,
  ContadorGrupo,
  FiltroRelatorio,
  RelatorioDados,
  ResultadoExportacaoCsv,
  SerieMensal,
  Usuario,
} from '../../shared/types';
import { ehDataCivil, ehObjeto } from '../../shared/validators';
import { Database } from '../database/PrismaClient';
import type { AlertaVacinaService } from './AlertaVacinaService';
import { calcularInadimplencia } from './MovimentacaoFinanceiraService';
import type { ResumoMovimentacao } from '../repositories/MovimentacaoFinanceiraRepository';
import { arredondar2 } from './valoresFase2';

const formatadorHoraClinica = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO_CLINICA,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const ROTULOS_KPI: Record<keyof RelatorioDados['kpis'], string> = {
  clientesAtivos: 'Clientes ativos',
  clientesNovosPeriodo: 'Clientes novos no período',
  petsAtivos: 'Pets ativos',
  consultasPeriodo: 'Consultas no período',
  consultasConcluidas: 'Consultas concluídas',
  consultasCanceladas: 'Consultas canceladas',
  vacinasPeriodo: 'Vacinas aplicadas',
  alertasVacina: 'Alertas de vacina',
  alertasEstoque: 'Alertas de estoque',
  faturamento: 'Faturamento (receitas pagas)',
  despesas: 'Despesas pagas',
  saldo: 'Saldo',
  ticketMedio: 'Ticket médio',
  inadimplencia: 'Inadimplência (razão 0 a 1)',
};

export function ehFiltroRelatorio(valor: unknown): valor is FiltroRelatorio {
  return ehObjeto(valor) && ehDataCivil(valor.de) && ehDataCivil(valor.ate);
}

function validarPeriodo(valor: unknown): FiltroRelatorio {
  if (!ehFiltroRelatorio(valor)) {
    throw new ErroAplicacao(
      'Informe um período válido para o relatório, no formato DD/MM/AAAA inicial e final.'
    );
  }
  if (valor.de > valor.ate) {
    throw new ErroAplicacao('A data inicial do relatório não pode ser posterior à data final.');
  }
  const meses =
    (Number(valor.ate.slice(0, 4)) - Number(valor.de.slice(0, 4))) * 12 +
    (Number(valor.ate.slice(5, 7)) - Number(valor.de.slice(5, 7)));
  if (
    meses > RELATORIO_PERIODO_MAXIMO_MESES ||
    (meses === RELATORIO_PERIODO_MAXIMO_MESES && valor.ate.slice(8) < valor.de.slice(8))
  ) {
    throw new ErroAplicacao(
      `O período do relatório não pode ultrapassar ${RELATORIO_PERIODO_MAXIMO_MESES} meses.`
    );
  }
  return { de: valor.de, ate: valor.ate };
}

/**
 * Início do dia civil da clínica em UTC. Não usar `new Date('YYYY-MM-DD')`:
 * o construtor interpreta o texto como UTC meia-noite e desloca o dia no fuso
 * de São Paulo após as 21h.
 */
function inicioUtc(dataCivil: string): Date {
  const base = new Date(`${dataCivil}T00:00:00.000Z`);
  const partes = formatadorHoraClinica.formatToParts(base);
  const hora = Number(partes.find((parte) => parte.type === 'hour')?.value ?? '0');
  const minuto = Number(partes.find((parte) => parte.type === 'minute')?.value ?? '0');
  const minutosLocais = hora * 60 + minuto;
  const deslocamentoMinutos =
    dataCivilClinica(base) === dataCivil ? -minutosLocais : 1440 - minutosLocais;
  return new Date(base.getTime() + deslocamentoMinutos * 60_000);
}

function fimUtcExclusivo(dataCivil: string): Date {
  return new Date(inicioUtc(dataCivil).getTime() + 86_400_000);
}

/** Limites de colunas `@db.Date`, gravadas como meia-noite UTC. */
function dataCivilBanco(valor: string): Date {
  return new Date(`${valor}T00:00:00.000Z`);
}

function chaveMes(data: Date): string {
  return dataCivilClinica(data).slice(0, 7);
}

function mesesDoPeriodo(de: string, ate: string): string[] {
  const meses: string[] = [];
  let [ano, mes] = de.slice(0, 7).split('-').map(Number);
  const [anoFim, mesFim] = ate.slice(0, 7).split('-').map(Number);
  while (ano < anoFim || (ano === anoFim && mes <= mesFim)) {
    meses.push(`${ano}-${String(mes).padStart(2, '0')}`);
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }
  return meses;
}

function contarRotulos(valores: string[]): ContadorGrupo[] {
  const contagem = new Map<string, number>();
  for (const valor of valores) {
    contagem.set(valor, (contagem.get(valor) ?? 0) + 1);
  }
  return [...contagem.entries()]
    .map(([rotulo, total]) => ({ rotulo, total }))
    .sort((a, b) => b.total - a.total || a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
}

function celulaCsv(valor: unknown): string {
  let texto = valor === null || valor === undefined ? '' : String(valor);
  if (/^[=+\-@]/.test(texto)) texto = `'${texto}`;
  if (/[";\r\n]/.test(texto)) texto = `"${texto.replace(/"/g, '""')}"`;
  return texto;
}

function linhaCsv(celulas: readonly unknown[]): string {
  return celulas.map(celulaCsv).join(';');
}

/** Relatórios operacionais: agregação direta no Prisma, sem tetos de listagem. */
export class RelatorioService {
  private prisma = Database.getInstance();

  constructor(
    private readonly alertas: AlertaVacinaService,
    private readonly agora: () => Date = () => new Date()
  ) {}

  async gerar(filtro: FiltroRelatorio, usuario: Usuario): Promise<RelatorioDados> {
    const periodo = validarPeriodo(filtro);
    this.exigirAcesso(usuario);

    // Mesma regra de perfil do serviço de alertas (ATENDENTE já é barrado acima).
    const alertasVacinas = await this.alertas.listarAlertas(usuario);
    const veterinarioId = usuario.role === 'VETERINARIO' ? usuario.id : undefined;
    const inicio = inicioUtc(periodo.de);
    const fim = fimUtcExclusivo(periodo.ate);
    const hoje = dataCivilClinica(this.agora());

    const inicioCivil = dataCivilBanco(periodo.de);
    const fimCivil = dataCivilBanco(periodo.ate);
    const [
      clientesAtivos,
      petsAtivos,
      clientes,
      consultas,
      vacinas,
      produtos,
      veterinarios,
      movimentacoesPagas,
      movimentacoesVencidas,
    ] = await Promise.all([
      this.prisma.cliente.count({ where: { ativo: true } }),
      this.prisma.pet.count({ where: { ativo: true } }),
      this.prisma.cliente.findMany({
        where: { criadoEm: { gte: inicio, lt: fim } },
        select: { criadoEm: true, cidade: true },
      }),
      this.prisma.consulta.findMany({
        where: { dataHora: { gte: inicio, lt: fim } },
        select: { dataHora: true, status: true, veterinarioId: true },
      }),
      this.prisma.registroVacina.findMany({
        where: {
          aplicadaEm: { gte: inicio, lt: fim },
          estornado: false,
          ...(veterinarioId === undefined ? {} : { veterinarioId }),
        },
        select: { aplicadaEm: true, vacina: true },
      }),
      this.prisma.produto.findMany({
        where: { ativo: true },
        select: {
          id: true,
          nome: true,
          estoqueMinimo: true,
          alertaEstoque: true,
          lotes: {
            where: { ativo: true },
            select: { quantidade: true, validade: true },
          },
        },
        orderBy: { nome: 'asc' },
      }),
      this.prisma.usuario.findMany({
        where: { role: 'VETERINARIO' },
        select: { id: true, nome: true },
      }),
      this.prisma.movimentacaoFinanceira.findMany({
        where: {
          status: 'PAGO',
          pagamento: { gte: inicioCivil, lte: fimCivil },
        },
        select: { tipo: true, valor: true, pagamento: true },
      }),
      this.prisma.movimentacaoFinanceira.findMany({
        where: {
          tipo: 'RECEITA',
          vencimento: { gte: inicioCivil, lte: fimCivil },
          status: { not: 'CANCELADO' },
        },
        select: { tipo: true, status: true, valor: true, vencimento: true },
      }),
    ]);

    const pagas = movimentacoesPagas.map((movimentacao) => ({
      tipo: movimentacao.tipo,
      valor: movimentacao.valor.toNumber(),
      pagamento: movimentacao.pagamento,
    }));
    const faturamento = arredondar2(
      pagas.filter((movimentacao) => movimentacao.tipo === 'RECEITA')
        .reduce((total, movimentacao) => total + movimentacao.valor, 0)
    );
    const despesas = arredondar2(
      pagas.filter((movimentacao) => movimentacao.tipo === 'DESPESA')
        .reduce((total, movimentacao) => total + movimentacao.valor, 0)
    );
    const receitasVencidas: ResumoMovimentacao[] = movimentacoesVencidas.map((movimentacao) => ({
      tipo: movimentacao.tipo,
      status: movimentacao.status,
      valor: movimentacao.valor.toNumber(),
      vencimento: movimentacao.vencimento.toISOString().slice(0, 10),
    }));

    const serie = this.montarSerie(periodo, clientes, consultas, vacinas, pagas);
    const nomesVeterinarios = new Map(veterinarios.map((veterinario) => [veterinario.id, veterinario.nome]));
    const alertasEstoque = this.montarAlertasEstoque(produtos, hoje);
    const concluidas = consultas.filter((consulta) => consulta.status === 'CONCLUIDA').length;
    const canceladas = consultas.filter((consulta) => consulta.status === 'CANCELADA').length;

    return {
      periodo,
      geradoEm: this.agora().toISOString(),
      kpis: {
        clientesAtivos,
        clientesNovosPeriodo: clientes.length,
        petsAtivos,
        consultasPeriodo: consultas.length,
        consultasConcluidas: concluidas,
        consultasCanceladas: canceladas,
        vacinasPeriodo: vacinas.length,
        alertasVacina: alertasVacinas.length,
        alertasEstoque: alertasEstoque.length,
        faturamento,
        despesas,
        saldo: arredondar2(faturamento - despesas),
        ticketMedio: concluidas > 0 ? arredondar2(faturamento / concluidas) : 0,
        inadimplencia: calcularInadimplencia(receitasVencidas, hoje),
      },
      serie,
      statusConsultas: contarRotulos(consultas.map((consulta) => consulta.status)),
      clientesPorCidade: contarRotulos(
        clientes.map((cliente) => cliente.cidade.trim() || 'Não informada')
      ),
      consultasPorVeterinario: contarRotulos(
        consultas.map(
          (consulta) => nomesVeterinarios.get(consulta.veterinarioId) ?? `Veterinário #${consulta.veterinarioId}`
        )
      ),
      produtosMaisUsados: contarRotulos(vacinas.map((vacina) => vacina.vacina)),
      alertasEstoque,
      alertasVacinas,
    };
  }

  async exportarCsv(
    filtro: FiltroRelatorio,
    usuario: Usuario
  ): Promise<ResultadoExportacaoCsv | null> {
    const dados = await this.gerar(filtro, usuario);
    const linhas = this.montarCsv(dados);

    let resultado: SaveDialogReturnValue;
    try {
      resultado = await dialog.showSaveDialog({
        title: 'Exportar relatório PetHealthPD',
        defaultPath: `relatorio-${dados.periodo.de}-a-${dados.periodo.ate}.csv`,
        filters: [{ name: 'CSV (separador ;)', extensions: ['csv'] }],
      });
    } catch (erro) {
      console.error('[Relatórios] Falha ao abrir a janela de salvamento:', erro);
      throw new ErroAplicacao('Não foi possível abrir a janela para escolher o arquivo CSV.');
    }
    if (resultado.canceled || !resultado.filePath) return null;

    const conteudo = `\uFEFF${linhas.map(linhaCsv).join('\r\n')}\r\n`;
    try {
      await writeFile(resultado.filePath, conteudo, 'utf8');
    } catch (erro) {
      console.error('[Relatórios] Falha ao gravar o CSV:', erro);
      throw new ErroAplicacao('Não foi possível salvar o arquivo CSV no local escolhido.');
    }
    return { caminho: resultado.filePath, linhas: linhas.length };
  }

  /** ATENDENTE não recebe relatório algum com dados clínicos ou de vacinação. */
  private exigirAcesso(usuario: Usuario): void {
    if (usuario.role === 'ADMIN' || usuario.role === 'VETERINARIO') return;
    if (usuario.role === 'ATENDENTE') {
      throw new ErroAplicacao(
        'Relatórios com dados de vacinação são restritos a veterinários e administradores.'
      );
    }
    throw new ErroAplicacao('Perfil de acesso inválido. Procure o administrador.');
  }

  private montarSerie(
    periodo: FiltroRelatorio,
    clientes: Array<{ criadoEm: Date }>,
    consultas: Array<{ dataHora: Date }>,
    vacinas: Array<{ aplicadaEm: Date }>,
    pagas: Array<{ tipo: string; valor: number; pagamento: Date | null }>
  ): SerieMensal[] {
    const contagem = new Map<
      string,
      { clientesNovos: number; consultas: number; vacinas: number; faturamento: number; despesas: number }
    >();
    for (const mes of mesesDoPeriodo(periodo.de, periodo.ate)) {
      contagem.set(mes, {
        clientesNovos: 0,
        consultas: 0,
        vacinas: 0,
        faturamento: 0,
        despesas: 0,
      });
    }
    for (const cliente of clientes) {
      const entrada = contagem.get(chaveMes(cliente.criadoEm));
      if (entrada) entrada.clientesNovos += 1;
    }
    for (const consulta of consultas) {
      const entrada = contagem.get(chaveMes(consulta.dataHora));
      if (entrada) entrada.consultas += 1;
    }
    for (const vacina of vacinas) {
      const entrada = contagem.get(chaveMes(vacina.aplicadaEm));
      if (entrada) entrada.vacinas += 1;
    }
    for (const movimentacao of pagas) {
      if (movimentacao.pagamento === null) continue;
      const entrada = contagem.get(movimentacao.pagamento.toISOString().slice(0, 7));
      if (!entrada) continue;
      if (movimentacao.tipo === 'RECEITA') entrada.faturamento += movimentacao.valor;
      if (movimentacao.tipo === 'DESPESA') entrada.despesas += movimentacao.valor;
    }
    return [...contagem.entries()].map(([mes, valores]) => ({
      mes,
      ...valores,
      faturamento: arredondar2(valores.faturamento),
      despesas: arredondar2(valores.despesas),
    }));
  }

  private montarAlertasEstoque(
    produtos: Array<{
      id: number;
      nome: string;
      estoqueMinimo: number;
      alertaEstoque: boolean;
      lotes: Array<{ quantidade: number; validade: Date }>;
    }>,
    hoje: string
  ): AlertaEstoqueRelatorio[] {
    const hojeMs = Date.parse(`${hoje}T00:00:00.000Z`);
    const alertas: AlertaEstoqueRelatorio[] = [];

    for (const produto of produtos) {
      const quantidade = produto.lotes.reduce((total, lote) => total + lote.quantidade, 0);
      const motivos: string[] = [];
      if (produto.alertaEstoque && quantidade < produto.estoqueMinimo) {
        motivos.push(`Quantidade (${quantidade}) abaixo do mínimo (${produto.estoqueMinimo}).`);
      }

      let vencidos = 0;
      let proximos = 0;
      for (const lote of produto.lotes) {
        const validade = lote.validade.toISOString().slice(0, 10);
        const dias = Math.round(
          (Date.parse(`${validade}T00:00:00.000Z`) - hojeMs) / 86_400_000
        );
        if (dias < 0) vencidos += 1;
        else if (dias <= ESTOQUE_ALERTA_VALIDADE_DIAS) proximos += 1;
      }
      if (vencidos > 0) motivos.push(`${vencidos} lote(s) com validade vencida.`);
      if (proximos > 0) {
        motivos.push(`${proximos} lote(s) com validade próxima (até ${ESTOQUE_ALERTA_VALIDADE_DIAS} dias).`);
      }
      if (motivos.length === 0) continue;

      alertas.push({
        produtoId: produto.id,
        produtoNome: produto.nome,
        quantidade,
        estoqueMinimo: produto.estoqueMinimo,
        alertaHabilitado: produto.alertaEstoque,
        motivos,
      });
    }
    return alertas;
  }

  private montarCsv(dados: RelatorioDados): unknown[][] {
    const linhas: unknown[][] = [
      ['Relatório PetHealthPD'],
      ['Período', `${dados.periodo.de} a ${dados.periodo.ate}`],
      ['Gerado em', dados.geradoEm],
      [],
      ['KPIs'],
      ['Indicador', 'Valor'],
    ];
    for (const [chave, rotulo] of Object.entries(ROTULOS_KPI) as Array<[keyof RelatorioDados['kpis'], string]>) {
      linhas.push([rotulo, dados.kpis[chave]]);
    }

    linhas.push(
      [],
      ['Financeiro'],
      ['Indicador', 'Valor'],
      ['Faturamento (receitas pagas)', dados.kpis.faturamento],
      ['Despesas pagas', dados.kpis.despesas],
      ['Saldo', dados.kpis.saldo],
      ['Ticket médio', dados.kpis.ticketMedio],
      ['Inadimplência', `${(dados.kpis.inadimplencia * 100).toFixed(2)}%`]
    );

    linhas.push(
      [],
      ['Série mensal'],
      ['Mês', 'Clientes novos', 'Consultas', 'Vacinas', 'Faturamento', 'Despesas', 'Saldo']
    );
    for (const mes of dados.serie) {
      linhas.push([
        mes.mes,
        mes.clientesNovos,
        mes.consultas,
        mes.vacinas,
        mes.faturamento,
        mes.despesas,
        arredondar2(mes.faturamento - mes.despesas),
      ]);
    }

    const secoes: Array<[string, ContadorGrupo[]]> = [
      ['Status das consultas', dados.statusConsultas],
      ['Clientes por cidade', dados.clientesPorCidade],
      ['Consultas por veterinário', dados.consultasPorVeterinario],
      ['Produtos mais usados', dados.produtosMaisUsados],
    ];
    for (const [titulo, grupos] of secoes) {
      linhas.push([], [titulo], ['Grupo', 'Total']);
      for (const grupo of grupos) linhas.push([grupo.rotulo, grupo.total]);
    }

    linhas.push([], ['Alertas de estoque'], [
      'Produto',
      'Quantidade',
      'Mínimo',
      'Alerta habilitado',
      'Motivos',
    ]);
    for (const alerta of dados.alertasEstoque) {
      linhas.push([
        alerta.produtoNome,
        alerta.quantidade,
        alerta.estoqueMinimo,
        alerta.alertaHabilitado ? 'Sim' : 'Não',
        alerta.motivos.join(' '),
      ]);
    }

    linhas.push([], ['Alertas de vacina'], [
      'Pet',
      'Tutor',
      'Vacina',
      'Dose',
      'Próxima dose',
      'Dias',
      'Nível',
      'Último aviso',
    ]);
    for (const alerta of dados.alertasVacinas) {
      linhas.push([
        alerta.petNome,
        alerta.tutorNome,
        alerta.vacina,
        alerta.dose,
        alerta.proximaDose,
        alerta.diasParaProximaDose,
        alerta.nivel,
        alerta.ultimoAvisoEm,
      ]);
    }
    return linhas;
  }
}
