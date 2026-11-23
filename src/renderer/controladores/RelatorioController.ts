/** Relatórios agregados: filtros, KPIs, gráficos leves, tabelas, CSV e impressão. */

import { RELATORIO_PERIODO_MAXIMO_MESES } from '../../shared/constants';
import { dataCivilClinica } from '../../shared/datas';
import type {
  AlertaEstoqueRelatorio,
  AlertaVacina,
  ContadorGrupo,
  FiltroRelatorio,
  RelatorioDados,
  ResultadoExportacaoCsv,
  SerieMensal,
} from '../types';
import {
  criarBadge,
  criarCelula,
  exigir,
  focarPrimeiroInvalido,
  formatarDataCivil,
  formatarDataHora,
  linhaMensagem,
  limparValidacao,
  mensagemErro,
  mostrarToast,
  obrigatorio,
  setCarregando,
  textoOuTraco,
} from '../ui';
import type { ContextoApp } from './contexto';

const FORMATO_DATA_CIVIL = /^\d{4}-\d{2}-\d{2}$/;
const SVG_NS = 'http://www.w3.org/2000/svg';
const COLUNAS_CLIENTES = 2;
const COLUNAS_SERVICOS = 3;
const COLUNAS_ESTOQUE = 5;
const COLUNAS_VACINAS = 6;
const GRAFICOS: readonly string[] = ['#relGraficoClientes', '#relGraficoConsultas', '#relGraficoStatus'];
const TABELAS: readonly string[] = [
  '#tbRelatorioClientes',
  '#tbRelatorioServicos',
  '#tbRelatorioAlertasEstoque',
  '#tbRelatorioAlertasVacinas',
];
const ROTULOS_STATUS: Readonly<Record<string, string>> = {
  AGENDADA: 'Agendada',
  CONFIRMADA: 'Confirmada',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
};

interface CartaoKpi {
  readonly rotulo: string;
  readonly valor: string;
  readonly ajuda?: string;
}

export class RelatorioController {
  private dados: RelatorioDados | null = null;
  private sequenciaCarregamento = 0;
  private eventosLigados = false;

  constructor(private readonly contexto: ContextoApp) {}

  iniciar(): void {
    if (!this.eventosLigados) {
      this.eventosLigados = true;
      this.configurarEventos();
    }
    this.limpar();
  }

  /** Carregado junto com as demais telas após a autenticação. */
  carregar(): Promise<void> {
    // O backend bloqueia relatórios com dados clínicos para atendentes; não
    // dispare a consulta automaticamente nesse perfil para não gerar erro.
    if (this.contexto.auth.obterUsuario()?.role === 'ATENDENTE') return Promise.resolve();
    return this.gerar();
  }

  /** Zera filtros, resultados e estados de carregamento ao sair. */
  limpar(): void {
    this.sequenciaCarregamento += 1;
    this.dados = null;
    this.definirPeriodoPadrao();
    limparValidacao(obrigatorio<HTMLFormElement>('#formRelatorio'));
    setCarregando(obrigatorio<HTMLButtonElement>('#btnGerarRelatorio'), false);
    setCarregando(obrigatorio<HTMLButtonElement>('#btnExportarRelatorio'), false);
    obrigatorio<HTMLButtonElement>('#btnExportarRelatorio').disabled = false;
    obrigatorio<HTMLButtonElement>('#btnImprimirRelatorio').disabled = false;
    this.definirStatusPadrao();
    this.renderizarVazio();
  }

  private definirStatus(texto: string, erro = false): void {
    const status = obrigatorio<HTMLElement>('#relStatus');
    status.textContent = texto;
    status.classList.toggle('text-danger', erro);
    status.classList.toggle('text-muted', !erro);
  }

  private definirStatusPadrao(): void {
    this.definirStatus('Escolha o período e selecione “Gerar relatório”.');
  }

  private definirCarregando(ativo: boolean): void {
    const seletores = ['#relKpis', ...GRAFICOS, ...TABELAS];
    for (const seletor of seletores) {
      obrigatorio<HTMLElement>(seletor).setAttribute('aria-busy', ativo ? 'true' : 'false');
    }
  }

  private periodoPadrao(): FiltroRelatorio {
    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1);
    return { de: dataCivilClinica(inicio), ate: dataCivilClinica(hoje) };
  }

  private definirPeriodoPadrao(): void {
    const periodo = this.periodoPadrao();
    obrigatorio<HTMLInputElement>('#relDe').value = periodo.de;
    obrigatorio<HTMLInputElement>('#relAte').value = periodo.ate;
  }

  private dataCivilValida(valor: string): boolean {
    if (!FORMATO_DATA_CIVIL.test(valor)) return false;
    const [ano, mes, dia] = valor.split('-').map(Number);
    const data = new Date(Date.UTC(ano, mes - 1, dia));
    return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
  }

  private filtroValido(): FiltroRelatorio | null {
    const formulario = obrigatorio<HTMLFormElement>('#formRelatorio');
    limparValidacao(formulario);
    const deCampo = obrigatorio<HTMLInputElement>('#relDe');
    const ateCampo = obrigatorio<HTMLInputElement>('#relAte');
    const de = deCampo.value.trim();
    const ate = ateCampo.value.trim();

    const deValido = exigir(deCampo, this.dataCivilValida(de), 'Informe a data inicial (AAAA-MM-DD).');
    const ateValido = exigir(ateCampo, this.dataCivilValida(ate), 'Informe a data final (AAAA-MM-DD).');
    let ordemValida = true;
    let intervaloValido = true;

    if (deValido && ateValido) {
      ordemValida = exigir(deCampo, de <= ate, 'A data inicial não pode ser posterior à data final.');
      if (ordemValida) {
        const meses =
          (Number(ate.slice(0, 4)) - Number(de.slice(0, 4))) * 12 +
          (Number(ate.slice(5, 7)) - Number(de.slice(5, 7)));
        const dentroDoLimite =
          meses < RELATORIO_PERIODO_MAXIMO_MESES ||
          (meses === RELATORIO_PERIODO_MAXIMO_MESES && de.slice(8, 10) <= ate.slice(8, 10));
        intervaloValido = exigir(
          ateCampo,
          dentroDoLimite,
          `O período não pode ultrapassar ${RELATORIO_PERIODO_MAXIMO_MESES} meses.`
        );
      }
    }

    if (!deValido || !ateValido || !ordemValida || !intervaloValido) {
      focarPrimeiroInvalido(formulario);
      return null;
    }
    return { de, ate };
  }

  private formatarNumero(valor: number): string {
    return valor.toLocaleString('pt-BR');
  }

  private async gerar(manual = false): Promise<void> {
    const filtro = this.filtroValido();
    if (filtro === null) return;

    const botao = obrigatorio<HTMLButtonElement>('#btnGerarRelatorio');
    const exportar = obrigatorio<HTMLButtonElement>('#btnExportarRelatorio');
    const imprimir = obrigatorio<HTMLButtonElement>('#btnImprimirRelatorio');
    const sequencia = this.sequenciaCarregamento + 1;
    this.sequenciaCarregamento = sequencia;

    this.definirStatus(`Gerando relatório de ${formatarDataCivil(filtro.de)} a ${formatarDataCivil(filtro.ate)}…`);
    this.definirCarregando(true);
    setCarregando(botao, true, 'Gerando…');
    exportar.disabled = true;
    imprimir.disabled = true;

    try {
      const dados: RelatorioDados = await window.api.relatorioGerar(filtro);
      if (sequencia !== this.sequenciaCarregamento) return;
      this.dados = dados;
      this.renderizar(dados);
      this.definirStatus(
        `Relatório de ${formatarDataCivil(dados.periodo.de)} a ${formatarDataCivil(dados.periodo.ate)} ` +
          `gerado em ${formatarDataHora(dados.geradoEm)}.`
      );
      if (manual) mostrarToast('Relatório gerado com sucesso.', 'sucesso');
    } catch (erro) {
      if (sequencia !== this.sequenciaCarregamento) return;
      this.dados = null;
      this.renderizarVazio();
      this.definirStatus('Não foi possível gerar o relatório. Tente novamente mais tarde.', true);
      mostrarToast(mensagemErro(erro), 'erro');
    } finally {
      if (sequencia === this.sequenciaCarregamento) {
        setCarregando(botao, false);
        exportar.disabled = false;
        imprimir.disabled = false;
        this.definirCarregando(false);
      }
    }
  }

  private renderizar(dados: RelatorioDados): void {
    this.renderizarKpis(dados);
    this.renderizarSerie('#relGraficoClientes', dados.serie, 'clientesNovos', 'Clientes novos por mês');
    this.renderizarSerie('#relGraficoConsultas', dados.serie, 'consultas', 'Consultas por mês');
    this.renderizarStatus(dados.statusConsultas);
    this.renderizarClientes(dados.clientesPorCidade);
    this.renderizarServicos(dados);
    this.renderizarAlertasEstoque(dados.alertasEstoque);
    this.renderizarAlertasVacinas(dados.alertasVacinas);
  }

  private renderizarVazio(): void {
    const kpis = obrigatorio<HTMLElement>('#relKpis');
    kpis.replaceChildren();
    const aviso = document.createElement('p');
    aviso.className = 'small text-muted fst-italic mb-0';
    aviso.textContent = 'Gere um relatório para visualizar os indicadores do período.';
    kpis.append(aviso);

    for (const seletor of GRAFICOS) {
      this.renderizarMensagemGrafico(seletor, 'Gere um relatório para visualizar este gráfico.');
    }
    this.renderizarTabela('#tbRelatorioClientes', COLUNAS_CLIENTES, [], 'Nenhum dado carregado.');
    this.renderizarTabela('#tbRelatorioServicos', COLUNAS_SERVICOS, [], 'Nenhum dado carregado.');
    this.renderizarTabela('#tbRelatorioAlertasEstoque', COLUNAS_ESTOQUE, [], 'Nenhum dado carregado.');
    this.renderizarTabela('#tbRelatorioAlertasVacinas', COLUNAS_VACINAS, [], 'Nenhum dado carregado.');
    this.definirCarregando(false);
  }

  private renderizarKpis(dados: RelatorioDados): void {
    const container = obrigatorio<HTMLElement>('#relKpis');
    container.replaceChildren();
    const k = dados.kpis;
    const cartoes: CartaoKpi[] = [
      { rotulo: 'Clientes ativos', valor: this.formatarNumero(k.clientesAtivos) },
      { rotulo: 'Clientes novos no período', valor: this.formatarNumero(k.clientesNovosPeriodo) },
      { rotulo: 'Pets ativos', valor: this.formatarNumero(k.petsAtivos) },
      { rotulo: 'Consultas no período', valor: this.formatarNumero(k.consultasPeriodo) },
      { rotulo: 'Consultas concluídas', valor: this.formatarNumero(k.consultasConcluidas) },
      { rotulo: 'Consultas canceladas', valor: this.formatarNumero(k.consultasCanceladas) },
      { rotulo: 'Vacinas no período', valor: this.formatarNumero(k.vacinasPeriodo) },
      { rotulo: 'Alertas de vacina', valor: this.formatarNumero(k.alertasVacina) },
      { rotulo: 'Alertas de estoque', valor: this.formatarNumero(k.alertasEstoque) },
      {
        rotulo: 'Faturamento',
        valor: 'Fase 2',
        ajuda: 'Disponível com o módulo financeiro.',
      },
      { rotulo: 'Despesas', valor: 'Fase 2', ajuda: 'Disponível com o módulo financeiro.' },
      { rotulo: 'Saldo', valor: 'Fase 2', ajuda: 'Disponível com o módulo financeiro.' },
      { rotulo: 'Ticket médio', valor: 'Fase 2', ajuda: 'Disponível com o módulo financeiro.' },
    ];

    for (const cartao of cartoes) {
      const coluna = document.createElement('div');
      coluna.className = 'col-6 col-md-4 col-xl-2';
      const cartaoElemento = document.createElement('div');
      cartaoElemento.className = 'card h-100';
      const corpo = document.createElement('div');
      corpo.className = 'card-body p-3';
      const rotulo = document.createElement('div');
      rotulo.className = 'small text-muted text-uppercase';
      rotulo.textContent = cartao.rotulo;
      const valor = document.createElement('div');
      valor.className = 'fs-5 fw-semibold';
      valor.textContent = cartao.valor;
      corpo.append(rotulo, valor);
      if (cartao.ajuda) {
        const ajuda = document.createElement('div');
        ajuda.className = 'small text-muted';
        ajuda.textContent = cartao.ajuda;
        corpo.append(ajuda);
      }
      cartaoElemento.append(corpo);
      coluna.append(cartaoElemento);
      container.append(coluna);
    }
    container.setAttribute('aria-busy', 'false');
  }

  private svgElemento(tag: 'svg' | 'line' | 'rect' | 'text'): SVGElement {
    return document.createElementNS(SVG_NS, tag) as SVGElement;
  }

  private renderizarMensagemGrafico(seletor: string, texto: string): void {
    const container = obrigatorio<HTMLElement>(seletor);
    container.replaceChildren();
    const mensagem = document.createElement('p');
    mensagem.className = 'small text-muted fst-italic mb-0';
    mensagem.textContent = texto;
    container.append(mensagem);
    container.setAttribute('aria-busy', 'false');
  }

  /** Barras verticais em SVG para uma das séries mensais. */
  private renderizarSerie(
    seletor: string,
    serie: SerieMensal[],
    campo: 'clientesNovos' | 'consultas',
    descricao: string
  ): void {
    const container = obrigatorio<HTMLElement>(seletor);
    if (serie.length === 0) {
      this.renderizarMensagemGrafico(seletor, 'Nenhum dado mensal no período selecionado.');
      return;
    }

    const largura = 320;
    const altura = 160;
    const esquerda = 28;
    const direita = 8;
    const topo = 12;
    const base = altura - 28;
    const maximo = Math.max(1, ...serie.map((ponto) => ponto[campo]));
    const espaco = (largura - esquerda - direita) / serie.length;
    const larguraBarra = Math.max(2, Math.min(24, espaco * 0.65));
    const passaoRotulo = Math.max(1, Math.ceil(serie.length / 8));

    const svg = this.svgElemento('svg');
    svg.setAttribute('viewBox', `0 0 ${largura} ${altura}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', descricao);

    for (let indice = 0; indice <= 3; indice += 1) {
      const y = topo + ((base - topo) * indice) / 3;
      const linha = this.svgElemento('line');
      linha.setAttribute('x1', String(esquerda));
      linha.setAttribute('x2', String(largura - direita));
      linha.setAttribute('y1', String(y));
      linha.setAttribute('y2', String(y));
      linha.setAttribute('class', 'grafico-eixo');
      svg.append(linha);

      const rotulo = this.svgElemento('text');
      rotulo.setAttribute('x', String(esquerda - 4));
      rotulo.setAttribute('y', String(y + 3));
      rotulo.setAttribute('text-anchor', 'end');
      rotulo.setAttribute('class', 'grafico-texto');
      rotulo.textContent = this.formatarNumero(Math.round((maximo * (3 - indice)) / 3));
      svg.append(rotulo);
    }

    serie.forEach((ponto, indice) => {
      const valor = ponto[campo];
      const alturaBarra = (valor / maximo) * (base - topo);
      const x = esquerda + indice * espaco + (espaco - larguraBarra) / 2;
      const barra = this.svgElemento('rect');
      barra.setAttribute('x', String(x));
      barra.setAttribute('y', String(base - alturaBarra));
      barra.setAttribute('width', String(larguraBarra));
      barra.setAttribute('height', String(Math.max(valor > 0 ? 1 : 0, alturaBarra)));
      barra.setAttribute('rx', '2');
      barra.setAttribute('class', 'grafico-barra');
      svg.append(barra);

      if (valor > 0 && serie.length <= 12) {
        const total = this.svgElemento('text');
        total.setAttribute('x', String(x + larguraBarra / 2));
        total.setAttribute('y', String(base - alturaBarra - 3));
        total.setAttribute('text-anchor', 'middle');
        total.setAttribute('class', 'grafico-valor');
        total.textContent = this.formatarNumero(valor);
        svg.append(total);
      }

      if (indice % passaoRotulo === 0 || indice === serie.length - 1) {
        const mes = this.svgElemento('text');
        mes.setAttribute('x', String(x + larguraBarra / 2));
        mes.setAttribute('y', String(altura - 8));
        mes.setAttribute('text-anchor', 'middle');
        mes.setAttribute('class', 'grafico-texto');
        mes.textContent = ponto.mes.slice(2).replace('-', '/');
        svg.append(mes);
      }
    });

    container.replaceChildren(svg);
    container.setAttribute('aria-busy', 'false');
  }

  /** Barras horizontais com o componente de progresso do Bootstrap. */
  private renderizarStatus(grupos: ContadorGrupo[]): void {
    const container = obrigatorio<HTMLElement>('#relGraficoStatus');
    container.replaceChildren();
    if (grupos.length === 0) {
      this.renderizarMensagemGrafico('#relGraficoStatus', 'Nenhuma consulta no período selecionado.');
      return;
    }

    const maximo = Math.max(1, ...grupos.map((grupo) => grupo.total));
    for (const grupo of grupos) {
      const titulo = ROTULOS_STATUS[grupo.rotulo] ?? grupo.rotulo;
      const linha = document.createElement('div');
      linha.className = 'mb-2';
      const cabecalho = document.createElement('div');
      cabecalho.className = 'd-flex justify-content-between gap-2 small';
      const rotulo = document.createElement('span');
      rotulo.textContent = titulo;
      const total = document.createElement('span');
      total.className = 'fw-semibold';
      total.textContent = this.formatarNumero(grupo.total);
      cabecalho.append(rotulo, total);

      const progresso = document.createElement('div');
      progresso.className = 'progress';
      progresso.setAttribute('role', 'img');
      progresso.setAttribute('aria-label', `${titulo}: ${total.textContent}`);
      const barra = document.createElement('div');
      barra.className = 'progress-bar';
      barra.style.width = `${Math.max(2, (grupo.total / maximo) * 100)}%`;
      barra.setAttribute('role', 'progressbar');
      barra.setAttribute('aria-valuemin', '0');
      barra.setAttribute('aria-valuemax', String(maximo));
      barra.setAttribute('aria-valuenow', String(grupo.total));
      progresso.append(barra);
      linha.append(cabecalho, progresso);
      container.append(linha);
    }
    container.setAttribute('aria-busy', 'false');
  }

  private renderizarTabela(
    seletor: string,
    colunas: number,
    linhas: HTMLTableRowElement[],
    mensagemVazia: string
  ): void {
    const corpo = obrigatorio<HTMLTableSectionElement>(seletor);
    if (linhas.length === 0) {
      corpo.replaceChildren(linhaMensagem(mensagemVazia, colunas));
    } else {
      corpo.replaceChildren(...linhas);
    }
    corpo.setAttribute('aria-busy', 'false');
  }

  private renderizarClientes(clientes: ContadorGrupo[]): void {
    const linhas = clientes.map((grupo) => {
      const linha = document.createElement('tr');
      linha.append(
        criarCelula(textoOuTraco(grupo.rotulo), 'small text-break'),
        criarCelula(this.formatarNumero(grupo.total), 'small text-end')
      );
      return linha;
    });
    this.renderizarTabela(
      '#tbRelatorioClientes',
      COLUNAS_CLIENTES,
      linhas,
      'Nenhum cliente cadastrado no período.'
    );
  }

  private renderizarServicos(dados: RelatorioDados): void {
    const categorias: ReadonlyArray<{ rotulo: string; grupos: ContadorGrupo[] }> = [
      { rotulo: 'Veterinário', grupos: dados.consultasPorVeterinario },
      { rotulo: 'Produto', grupos: dados.produtosMaisUsados },
      { rotulo: 'Status', grupos: dados.statusConsultas },
    ];
    const linhas: HTMLTableRowElement[] = [];
    for (const categoria of categorias) {
      for (const grupo of categoria.grupos) {
        const linha = document.createElement('tr');
        linha.append(
          criarCelula(categoria.rotulo, 'small'),
          criarCelula(textoOuTraco(grupo.rotulo), 'small text-break'),
          criarCelula(this.formatarNumero(grupo.total), 'small text-end')
        );
        linhas.push(linha);
      }
    }
    this.renderizarTabela(
      '#tbRelatorioServicos',
      COLUNAS_SERVICOS,
      linhas,
      'Nenhum serviço ou produto registrado no período.'
    );
  }

  private renderizarAlertasEstoque(alertas: AlertaEstoqueRelatorio[]): void {
    const linhas = alertas.map((alerta) => {
      const linha = document.createElement('tr');
      const situacao = document.createElement('td');
      situacao.append(
        criarBadge(
          alerta.alertaHabilitado ? 'Ativo' : 'Desativado',
          alerta.alertaHabilitado ? 'text-bg-warning' : 'text-bg-secondary'
        )
      );
      linha.append(
        criarCelula(textoOuTraco(alerta.produtoNome), 'small text-break'),
        criarCelula(this.formatarNumero(alerta.quantidade), 'small text-end'),
        criarCelula(this.formatarNumero(alerta.estoqueMinimo), 'small text-end'),
        situacao,
        criarCelula(alerta.motivos.length > 0 ? alerta.motivos.join(', ') : '—', 'small text-break')
      );
      return linha;
    });
    this.renderizarTabela(
      '#tbRelatorioAlertasEstoque',
      COLUNAS_ESTOQUE,
      linhas,
      'Nenhum alerta de estoque no período.'
    );
  }

  private prazoAlerta(alerta: AlertaVacina): string {
    const dias = alerta.diasParaProximaDose;
    const rotulo = `${Math.abs(dias)} ${Math.abs(dias) === 1 ? 'dia' : 'dias'}`;
    if (dias < 0) return `${rotulo} em atraso`;
    if (dias === 0) return 'Vence hoje';
    return `${rotulo} para vencer`;
  }

  private renderizarAlertasVacinas(alertas: AlertaVacina[]): void {
    const linhas = alertas.map((alerta) => {
      const linha = document.createElement('tr');
      const situacao = document.createElement('td');
      situacao.append(
        criarBadge(
          alerta.nivel === 'VENCIDA' ? 'VENCIDA' : 'PROXIMA',
          alerta.nivel === 'VENCIDA' ? 'text-bg-danger' : 'text-bg-warning'
        )
      );
      linha.append(
        criarCelula(textoOuTraco(alerta.petNome), 'small text-break'),
        criarCelula(textoOuTraco(alerta.tutorNome), 'small text-break'),
        criarCelula(`${textoOuTraco(alerta.vacina)} / ${textoOuTraco(alerta.dose)}`, 'small text-break'),
        criarCelula(formatarDataCivil(alerta.proximaDose), 'small text-nowrap'),
        situacao,
        criarCelula(this.prazoAlerta(alerta), 'small text-nowrap')
      );
      return linha;
    });
    this.renderizarTabela(
      '#tbRelatorioAlertasVacinas',
      COLUNAS_VACINAS,
      linhas,
      'Nenhum alerta de vacinação no período.'
    );
  }

  private async exportar(): Promise<void> {
    const filtro = this.filtroValido();
    if (filtro === null) return;
    const botao = obrigatorio<HTMLButtonElement>('#btnExportarRelatorio');
    setCarregando(botao, true, 'Exportando…');
    try {
      const resultado: ResultadoExportacaoCsv | null = await window.api.relatorioExportarCsv(filtro);
      if (resultado === null) {
        this.definirStatus('Exportação cancelada.');
        mostrarToast('Exportação cancelada.', 'info');
        return;
      }
      const mensagem = `CSV salvo em ${resultado.caminho} (${resultado.linhas} linhas).`;
      this.definirStatus(mensagem);
      mostrarToast(`CSV exportado com ${resultado.linhas} linhas.`, 'sucesso');
    } catch (erro) {
      this.definirStatus('Não foi possível exportar o relatório.', true);
      mostrarToast(mensagemErro(erro), 'erro');
    } finally {
      setCarregando(botao, false);
    }
  }

  private imprimir(): void {
    this.definirStatus('Janela de impressão aberta. Selecione “Salvar como PDF” se desejar.');
    window.print();
  }

  private configurarEventos(): void {
    obrigatorio<HTMLFormElement>('#formRelatorio').addEventListener('submit', (evento) => {
      evento.preventDefault();
      void this.gerar(true);
    });
    obrigatorio<HTMLButtonElement>('#btnExportarRelatorio').addEventListener('click', () => {
      void this.exportar();
    });
    obrigatorio<HTMLButtonElement>('#btnImprimirRelatorio').addEventListener('click', () => {
      this.imprimir();
    });
    obrigatorio<HTMLButtonElement>('#abaRelatorios-tab').addEventListener('shown.bs.tab', () => {
      if (this.dados === null) void this.gerar();
    });
  }
}
