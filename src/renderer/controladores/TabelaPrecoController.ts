/** Tabelas de preço: leitura para todos os perfis; escrita exclusiva de ADMIN. */

import type {
  DadosAtualizacaoTabelaPreco,
  DadosTabelaPreco,
  HistoricoPreco,
  OrigemHistoricoPreco,
  TabelaPreco,
} from '../types';
import {
  aplicarMascaraPreco,
  criarBadge,
  criarBotaoAcao,
  criarCelula,
  exigir,
  focarPrimeiroInvalido,
  formatarDataHora,
  formatarMoeda,
  linhaMensagem,
  limparValidacao,
  mensagemErro,
  mostrarToast,
  obrigatorio,
  pedirMotivo,
  precoOuNull,
  setCarregando,
  textoOuTraco,
  textoPreco,
} from '../ui';
import type { ContextoApp } from './contexto';

const COLUNAS_TABELAS = 6;
const COLUNAS_HISTORICO = 7;

const ROTULOS_ORIGEM: Readonly<Record<OrigemHistoricoPreco, string>> = {
  PRODUTO: 'Produto',
  TABELA_PRECO: 'Tabela de preço',
};

export class TabelaPrecoController {
  private tabelasVisiveis = new Map<number, TabelaPreco>();
  private historicoVisivel: HistoricoPreco[] = [];
  private idEdicao: number | null = null;
  private sequenciaCarregamento = 0;
  private eventosLigados = false;

  constructor(private readonly contexto: ContextoApp) {}

  iniciar(): void {
    if (!this.eventosLigados) {
      this.eventosLigados = true;
      aplicarMascaraPreco(obrigatorio<HTMLInputElement>('#tpPreco'));
      this.configurarEventos();
    }
    this.aplicarPermissoes();
    this.sairDaEdicao(false);
    this.renderizarVazio();
  }

  /** Recarrega tabelas e histórico; ignora respostas de cargas anteriores. */
  async carregar(): Promise<void> {
    this.aplicarPermissoes();
    const sequencia = this.sequenciaCarregamento + 1;
    this.sequenciaCarregamento = sequencia;
    const corpoTabelas = obrigatorio<HTMLTableSectionElement>('#tbTabelasPreco');
    const corpoHistorico = obrigatorio<HTMLTableSectionElement>('#tbHistoricoPreco');

    corpoTabelas.setAttribute('aria-busy', 'true');
    corpoHistorico.setAttribute('aria-busy', 'true');
    corpoTabelas.replaceChildren(linhaMensagem('Carregando tabelas de preço…', COLUNAS_TABELAS));
    corpoHistorico.replaceChildren(linhaMensagem('Carregando histórico de preços…', COLUNAS_HISTORICO));

    try {
      const [tabelas, historico] = await Promise.all([
        window.api.tabelaPrecoListar(),
        window.api.historicoPrecoListar(),
      ]);
      if (sequencia !== this.sequenciaCarregamento) return;
      this.renderizarTabelas(tabelas);
      this.renderizarHistorico(historico);
    } catch (erro) {
      if (sequencia !== this.sequenciaCarregamento) return;
      corpoTabelas.replaceChildren(
        linhaMensagem(
          'Não foi possível carregar as tabelas de preço.',
          COLUNAS_TABELAS,
          'text-center text-danger py-4'
        )
      );
      corpoHistorico.replaceChildren(
        linhaMensagem(
          'Não foi possível carregar o histórico de preços.',
          COLUNAS_HISTORICO,
          'text-center text-danger py-4'
        )
      );
      obrigatorio<HTMLElement>('#tpResumo').hidden = true;
      mostrarToast(mensagemErro(erro), 'erro');
    } finally {
      if (sequencia === this.sequenciaCarregamento) {
        corpoTabelas.setAttribute('aria-busy', 'false');
        corpoHistorico.setAttribute('aria-busy', 'false');
      }
    }
  }

  /** Zera seleção, formulários e mensagens ao encerrar a sessão. */
  limpar(): void {
    this.sequenciaCarregamento += 1;
    this.idEdicao = null;
    this.tabelasVisiveis = new Map();
    this.historicoVisivel = [];
    setCarregando(obrigatorio<HTMLButtonElement>('#btnSalvarTabela'), false);
    this.sairDaEdicao(false);
    this.renderizarVazio();
    obrigatorio<HTMLElement>('#tpAvisoLeitura').hidden = true;
    obrigatorio<HTMLElement>('#tpAreaEdicao').hidden = true;
  }

  /** Autoridade de escrita é o backend; aqui apenas escondemos os controles. */
  private aplicarPermissoes(): void {
    const usuario = this.contexto.auth.obterUsuario();
    const podeEditar = usuario !== null && this.contexto.auth.isAdmin();
    obrigatorio<HTMLElement>('#tpAvisoLeitura').hidden = usuario === null || podeEditar;
    obrigatorio<HTMLElement>('#tpAreaEdicao').hidden = !podeEditar;
    if (!podeEditar && this.idEdicao !== null) this.sairDaEdicao(false);
  }

  private renderizarVazio(): void {
    this.renderizarTabelas([]);
    this.renderizarHistorico([]);
    obrigatorio<HTMLTableSectionElement>('#tbTabelasPreco').setAttribute('aria-busy', 'false');
    obrigatorio<HTMLTableSectionElement>('#tbHistoricoPreco').setAttribute('aria-busy', 'false');
  }

  private renderizarTabelas(tabelas: TabelaPreco[]): void {
    const corpo = obrigatorio<HTMLTableSectionElement>('#tbTabelasPreco');
    const resumo = obrigatorio<HTMLElement>('#tpResumo');
    corpo.replaceChildren();
    this.tabelasVisiveis = new Map(tabelas.map((tabela) => [tabela.id, tabela]));
    resumo.hidden = tabelas.length === 0;
    resumo.textContent =
      tabelas.length === 0 ? '' : `${tabelas.length} ${tabelas.length === 1 ? 'tabela' : 'tabelas'}`;

    if (tabelas.length === 0) {
      corpo.append(linhaMensagem('Nenhuma tabela de preço cadastrada.', COLUNAS_TABELAS));
      return;
    }

    const podeEditar = this.contexto.auth.isAdmin();
    for (const tabela of tabelas) {
      const linha = document.createElement('tr');
      linha.append(
        criarCelula(textoOuTraco(tabela.codigo), 'small text-nowrap'),
        criarCelula(textoOuTraco(tabela.descricao), 'small text-break'),
        criarCelula(textoOuTraco(tabela.categoria), 'small'),
        criarCelula(formatarMoeda(tabela.preco), 'small text-nowrap text-end'),
        this.celulaSituacao(tabela.ativo !== false)
      );

      const celulaAcoes = document.createElement('td');
      if (podeEditar && tabela.ativo !== false) {
        const grupo = document.createElement('div');
        grupo.className = 'd-flex flex-wrap gap-1';
        grupo.setAttribute('role', 'group');
        grupo.setAttribute('aria-label', `Ações da tabela ${tabela.codigo}`);
        grupo.append(
          criarBotaoAcao('editar-tabela', tabela.id, 'Editar', `Editar a tabela ${tabela.codigo}`),
          criarBotaoAcao(
            'inativar-tabela',
            tabela.id,
            'Inativar',
            `Inativar a tabela ${tabela.codigo}`,
            'btn-outline-warning'
          )
        );
        celulaAcoes.append(grupo);
      } else {
        celulaAcoes.textContent = '—';
      }
      linha.append(celulaAcoes);
      corpo.append(linha);
    }
  }

  private renderizarHistorico(historico: HistoricoPreco[]): void {
    const corpo = obrigatorio<HTMLTableSectionElement>('#tbHistoricoPreco');
    corpo.replaceChildren();
    this.historicoVisivel = historico;

    if (historico.length === 0) {
      corpo.append(linhaMensagem('Nenhuma alteração de preço registrada.', COLUNAS_HISTORICO));
      return;
    }

    for (const item of historico) {
      const origem =
        item.origem === 'PRODUTO' || item.origem === 'TABELA_PRECO'
          ? ROTULOS_ORIGEM[item.origem]
          : item.origem;
      const linha = document.createElement('tr');
      linha.append(
        criarCelula(formatarDataHora(item.criadoEm), 'small text-nowrap'),
        criarCelula(origem, 'small'),
        criarCelula(`#${item.origemId}`, 'small text-nowrap'),
        criarCelula(formatarMoeda(item.anterior), 'small text-nowrap text-end'),
        criarCelula(formatarMoeda(item.novo), 'small text-nowrap text-end'),
        criarCelula(textoOuTraco(item.responsavelNome), 'small text-break'),
        criarCelula(textoOuTraco(item.motivo), 'small text-break')
      );
      corpo.append(linha);
    }
  }

  private celulaSituacao(ativo: boolean): HTMLTableCellElement {
    const celula = document.createElement('td');
    celula.append(
      criarBadge(
        ativo ? 'Ativa' : 'Inativa',
        ativo ? 'text-bg-success' : 'text-bg-secondary'
      )
    );
    return celula;
  }

  private preencherFormulario(tabela: TabelaPreco): void {
    this.idEdicao = tabela.id;
    obrigatorio<HTMLInputElement>('#tpCodigo').value = tabela.codigo;
    obrigatorio<HTMLInputElement>('#tpDescricao').value = tabela.descricao;
    obrigatorio<HTMLInputElement>('#tpCategoria').value = tabela.categoria;
    obrigatorio<HTMLInputElement>('#tpPreco').value = textoPreco(tabela.preco);
    obrigatorio<HTMLElement>('#tpTituloForm').textContent = `Editar tabela — ${tabela.codigo}`;
    obrigatorio<HTMLButtonElement>('#btnSalvarTabela').textContent = 'Salvar alterações';
    obrigatorio<HTMLButtonElement>('#btnCancelarTabela').hidden = false;
    limparValidacao(obrigatorio<HTMLFormElement>('#formTabelaPreco'));
    obrigatorio<HTMLInputElement>('#tpCodigo').focus();
  }

  private sairDaEdicao(focar = true): void {
    this.idEdicao = null;
    const formulario = obrigatorio<HTMLFormElement>('#formTabelaPreco');
    formulario.reset();
    limparValidacao(formulario);
    obrigatorio<HTMLElement>('#tpTituloForm').textContent = 'Nova tabela de preço';
    obrigatorio<HTMLButtonElement>('#btnSalvarTabela').textContent = 'Salvar tabela';
    obrigatorio<HTMLButtonElement>('#btnCancelarTabela').hidden = true;
    if (focar) obrigatorio<HTMLInputElement>('#tpCodigo').focus();
  }

  private async salvar(evento: Event, botao: HTMLButtonElement): Promise<void> {
    evento.preventDefault();
    const formulario = obrigatorio<HTMLFormElement>('#formTabelaPreco');
    limparValidacao(formulario);

    if (!this.contexto.auth.isAdmin()) {
      mostrarToast('Somente um administrador pode alterar tabelas de preço.', 'erro');
      return;
    }

    const codigo = obrigatorio<HTMLInputElement>('#tpCodigo');
    const descricao = obrigatorio<HTMLInputElement>('#tpDescricao');
    const categoria = obrigatorio<HTMLInputElement>('#tpCategoria');
    const precoCampo = obrigatorio<HTMLInputElement>('#tpPreco');

    const codigoValido = exigir(
      codigo,
      codigo.value.trim().length >= 1 && codigo.value.trim().length <= 40,
      'Informe o código da tabela (até 40 caracteres).'
    );
    const descricaoValida = exigir(
      descricao,
      descricao.value.trim().length >= 2 && descricao.value.trim().length <= 160,
      'Informe a descrição (de 2 a 160 caracteres).'
    );
    const categoriaValida = exigir(
      categoria,
      categoria.value.trim().length >= 1 && categoria.value.trim().length <= 80,
      'Informe a categoria (até 80 caracteres).'
    );
    const preco = precoOuNull(precoCampo.value);
    const precoValido = exigir(
      precoCampo,
      preco !== null,
      'Informe um preço válido, com até duas casas decimais.'
    );

    if (!codigoValido || !descricaoValida || !categoriaValida || !precoValido || preco === null) {
      focarPrimeiroInvalido(formulario);
      return;
    }

    const dados: DadosTabelaPreco = {
      codigo: codigo.value.trim(),
      descricao: descricao.value.trim(),
      categoria: categoria.value.trim(),
      preco,
    };
    const id = this.idEdicao;

    setCarregando(botao, true, 'Salvando…');
    let salvoComSucesso = false;
    try {
      if (id === null) {
        await window.api.tabelaPrecoCriar(dados);
        mostrarToast('Tabela de preço cadastrada com sucesso.', 'sucesso');
      } else {
        const atualizacao: DadosAtualizacaoTabelaPreco = { ...dados, id };
        await window.api.tabelaPrecoAtualizar(atualizacao);
        mostrarToast('Tabela de preço atualizada; a alteração foi registrada no histórico.', 'sucesso');
      }
      salvoComSucesso = true;
      await this.carregar();
    } catch (erro) {
      mostrarToast(mensagemErro(erro), 'erro');
    } finally {
      // Restaura o texto do botão antes de limpar o modo de edição.
      setCarregando(botao, false);
      if (salvoComSucesso) this.sairDaEdicao(false);
    }
  }

  private async inativar(tabela: TabelaPreco, botao: HTMLButtonElement): Promise<void> {
    if (!this.contexto.auth.isAdmin()) return;
    const motivo = await pedirMotivo({
      titulo: 'Inativar tabela de preço',
      descricao:
        `A tabela "${tabela.codigo}" deixará de ser sugerida em orçamentos. ` +
        'O histórico é preservado e o motivo fica registrado na auditoria.',
      rotuloConfirmar: 'Inativar tabela',
    });
    if (motivo === null) return;

    setCarregando(botao, true, 'Inativando…');
    try {
      await window.api.tabelaPrecoInativar({ id: tabela.id, motivo });
      if (this.idEdicao === tabela.id) this.sairDaEdicao(false);
      mostrarToast('Tabela inativada. O motivo foi registrado na auditoria.', 'sucesso');
      await this.carregar();
    } catch (erro) {
      mostrarToast(mensagemErro(erro), 'erro');
    } finally {
      setCarregando(botao, false);
    }
  }

  private configurarEventos(): void {
    obrigatorio<HTMLFormElement>('#formTabelaPreco').addEventListener('submit', (evento) => {
      void this.salvar(evento, obrigatorio<HTMLButtonElement>('#btnSalvarTabela'));
    });
    obrigatorio<HTMLButtonElement>('#btnCancelarTabela').addEventListener('click', () => {
      this.sairDaEdicao();
    });

    obrigatorio<HTMLTableSectionElement>('#tbTabelasPreco').addEventListener('click', (evento) => {
      const alvo = evento.target;
      if (!(alvo instanceof Element)) return;
      const botao = alvo.closest<HTMLButtonElement>('button[data-acao][data-id]');
      if (!botao || botao.disabled || !this.contexto.auth.isAdmin()) return;
      const id = Number(botao.dataset.id);
      if (!Number.isInteger(id) || id <= 0) return;
      const tabela = this.tabelasVisiveis.get(id);
      if (tabela === undefined) return;
      if (botao.dataset.acao === 'editar-tabela') this.preencherFormulario(tabela);
      else if (botao.dataset.acao === 'inativar-tabela') void this.inativar(tabela, botao);
    });
  }
}
