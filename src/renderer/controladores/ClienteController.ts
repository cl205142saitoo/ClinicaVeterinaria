/** Domínio de clientes: formulário, ViaCEP, listagem, edição e inativação. */

import { dataCivilClinica, formatarDataCivil } from '../../shared/datas';
import type { Cliente, DadosCliente } from '../types';
import {
  aplicarMascara,
  cepValido,
  criarBotaoAcao,
  criarCelula,
  cpfValido,
  exigir,
  focarPrimeiroInvalido,
  formatarCep,
  formatarCpf,
  formatarTelefone,
  linhaMensagem,
  limparInvalido,
  limparValidacao,
  marcarInvalido,
  mensagemErro,
  mostrarToast,
  obrigatorio,
  pedirMotivo,
  setCarregando,
  telefoneValido,
  textoOuTraco,
} from '../ui';
import { ehEmail } from '../../shared/validators';
import type { ContextoApp } from './contexto';

const COLUNAS = 8;

export class ClienteController {
  private clientesVisiveis = new Map<number, Cliente>();
  private idEdicao: number | null = null;

  constructor(private readonly contexto: ContextoApp) {}

  /** Liga eventos do formulário, da tabela e das máscaras. */
  iniciar(): void {
    const formulario = obrigatorio<HTMLFormElement>('#formCliente');
    const botaoCep = obrigatorio<HTMLButtonElement>('#btnBuscarCep');
    const botaoSalvar = obrigatorio<HTMLButtonElement>('#btnSalvarCliente');
    const botaoCancelar = obrigatorio<HTMLButtonElement>('#btnCancelarEdicaoCliente');
    const corpo = obrigatorio<HTMLTableSectionElement>('#tbClientes');

    aplicarMascara(obrigatorio<HTMLInputElement>('#cCpf'), formatarCpf);
    aplicarMascara(obrigatorio<HTMLInputElement>('#cTel'), formatarTelefone);
    aplicarMascara(obrigatorio<HTMLInputElement>('#cCep'), formatarCep);

    botaoCep.addEventListener('click', () => {
      void this.buscarCep(botaoCep);
    });
    formulario.addEventListener('submit', (evento) => {
      void this.salvar(evento, botaoSalvar);
    });
    botaoCancelar.addEventListener('click', () => this.sairDaEdicao());
    corpo.addEventListener('click', (evento) => {
      void this.tratarAcao(evento);
    });
    this.atualizarModoEdicao();
  }

  carregar(): Promise<Cliente[]> {
    return window.api.listarClientes();
  }

  renderizar(clientes: Cliente[]): void {
    const corpo = obrigatorio<HTMLTableSectionElement>('#tbClientes');
    corpo.replaceChildren();
    this.clientesVisiveis = new Map(clientes.map((cliente) => [cliente.id, cliente]));

    if (clientes.length === 0) {
      corpo.append(linhaMensagem('Nenhum cliente cadastrado.', COLUNAS));
      return;
    }

    for (const cliente of clientes) {
      const linha = document.createElement('tr');
      linha.append(
        criarCelula(cliente.nome),
        criarCelula(cliente.cpf, 'text-nowrap small'),
        criarCelula(cliente.rg ?? '—', 'small'),
        criarCelula(formatarDataCivil(cliente.dataNascimento), 'text-nowrap small'),
        criarCelula(textoOuTraco(cliente.email), 'small text-break'),
        criarCelula(`${cliente.cidade} - ${cliente.uf}`),
        criarCelula(String(cliente.pets?.length ?? 0), 'text-center')
      );

      const acao = document.createElement('td');
      const grupo = document.createElement('div');
      grupo.className = 'd-flex flex-wrap gap-1';
      grupo.setAttribute('role', 'group');
      grupo.setAttribute('aria-label', `Ações do cliente ${cliente.nome}`);
      const botoes = [
        criarBotaoAcao('editar-cliente', cliente.id, 'Editar', `Editar o cliente ${cliente.nome}`),
      ];
      if (this.contexto.auth.isAdmin()) {
        botoes.push(
          cliente.ativo === false
            ? criarBotaoAcao(
                'reativar-cliente',
                cliente.id,
                'Reativar',
                `Reativar o cliente ${cliente.nome}`,
                'btn-outline-success'
              )
            : criarBotaoAcao(
                'inativar-cliente',
                cliente.id,
                'Inativar',
                `Inativar o cliente ${cliente.nome}`,
                'btn-outline-warning danger'
              )
        );
      }
      grupo.append(...botoes);
      acao.append(grupo);
      linha.append(acao);
      corpo.append(linha);
    }
  }

  private async tratarAcao(evento: Event): Promise<void> {
    const alvo = evento.target;
    if (!(alvo instanceof Element)) return;
    const botao = alvo.closest<HTMLButtonElement>('button[data-acao][data-id]');
    if (!botao || botao.disabled) return;

    const id = Number(botao.dataset.id);
    if (!Number.isInteger(id) || id <= 0) return;
    const cliente = this.clientesVisiveis.get(id);
    if (cliente === undefined) return;

    if (botao.dataset.acao === 'editar-cliente') {
      this.preencherFormulario(cliente);
    } else if (botao.dataset.acao === 'inativar-cliente') {
      await this.inativar(cliente, botao);
    } else if (botao.dataset.acao === 'reativar-cliente') {
      await this.reativar(cliente, botao);
    }
  }

  private preencherFormulario(cliente: Cliente): void {
    this.idEdicao = cliente.id;
    this.definirValor('#cNome', cliente.nome);
    this.definirValor('#cCpf', cliente.cpf);
    this.definirValor('#cRg', cliente.rg ?? '');
    this.definirValor('#cNascimento', cliente.dataNascimento ?? '');
    this.definirValor('#cTel', cliente.telefone);
    this.definirValor('#cEmail', cliente.email ?? '');
    this.definirValor('#cCep', cliente.cep);
    this.definirValor('#cRua', cliente.logradouro);
    this.definirValor('#cBairro', cliente.bairro);
    this.definirValor('#cCidade', cliente.cidade);
    this.definirValor('#cUf', cliente.uf);
    obrigatorio<HTMLInputElement>('#cLgpd').checked = cliente.aceiteLgpd;

    const formulario = obrigatorio<HTMLFormElement>('#formCliente');
    limparValidacao(formulario);
    this.atualizarModoEdicao();
    obrigatorio<HTMLInputElement>('#cNome').focus();
  }

  private atualizarModoEdicao(): void {
    const editando = this.idEdicao !== null;
    obrigatorio<HTMLElement>('#tituloFormCliente').textContent = editando
      ? 'Editar cliente'
      : 'Novo cliente (com ViaCEP)';
    obrigatorio<HTMLButtonElement>('#btnSalvarCliente').textContent = editando
      ? 'Salvar alterações'
      : 'Cadastrar cliente';
    obrigatorio<HTMLButtonElement>('#btnCancelarEdicaoCliente').hidden = !editando;
  }

  private sairDaEdicao(): void {
    this.idEdicao = null;
    const formulario = obrigatorio<HTMLFormElement>('#formCliente');
    formulario.reset();
    limparValidacao(formulario);
    this.atualizarModoEdicao();
    obrigatorio<HTMLInputElement>('#cNome').focus();
  }

  private definirValor(seletor: string, valor: string): void {
    obrigatorio<HTMLInputElement>(seletor).value = valor;
  }

  private async buscarCep(botao: HTMLButtonElement): Promise<void> {
    const cep = obrigatorio<HTMLInputElement>('#cCep');
    limparInvalido(cep);
    if (!cepValido(cep.value)) {
      marcarInvalido(cep, 'Digite os 8 números do CEP.');
      cep.focus();
      return;
    }

    setCarregando(botao, true, 'Buscando…');
    try {
      const endereco = await window.api.buscarCep(cep.value);
      this.definirValor('#cRua', endereco.logradouro);
      this.definirValor('#cBairro', endereco.bairro);
      this.definirValor('#cCidade', endereco.cidade);
      this.definirValor('#cUf', endereco.uf);
      mostrarToast('Endereço encontrado. Confira os dados antes de salvar.', 'sucesso');
    } catch (erro) {
      const mensagem = mensagemErro(erro);
      marcarInvalido(cep, mensagem);
      mostrarToast(mensagem, 'erro');
      cep.focus();
    } finally {
      setCarregando(botao, false);
    }
  }

  private async salvar(evento: Event, botao: HTMLButtonElement): Promise<void> {
    evento.preventDefault();
    const formulario = obrigatorio<HTMLFormElement>('#formCliente');
    const nome = obrigatorio<HTMLInputElement>('#cNome');
    const cpf = obrigatorio<HTMLInputElement>('#cCpf');
    const rg = obrigatorio<HTMLInputElement>('#cRg');
    const nascimento = obrigatorio<HTMLInputElement>('#cNascimento');
    const telefone = obrigatorio<HTMLInputElement>('#cTel');
    const email = obrigatorio<HTMLInputElement>('#cEmail');
    const cep = obrigatorio<HTMLInputElement>('#cCep');
    const logradouro = obrigatorio<HTMLInputElement>('#cRua');
    const bairro = obrigatorio<HTMLInputElement>('#cBairro');
    const cidade = obrigatorio<HTMLInputElement>('#cCidade');
    const uf = obrigatorio<HTMLInputElement>('#cUf');
    const lgpd = obrigatorio<HTMLInputElement>('#cLgpd');
    limparValidacao(formulario);

    const resultados = [
      exigir(nome, nome.value.trim().length >= 2, 'Informe o nome completo do cliente.'),
      exigir(cpf, cpfValido(cpf.value), 'CPF inválido. Confira os números digitados.'),
      exigir(rg, rg.value.trim().length > 0, 'Informe o RG do cliente.'),
      exigir(
        nascimento,
        nascimento.value !== '' && nascimento.value <= dataCivilClinica(new Date()),
        'Informe uma data de nascimento válida (não pode ser futura).'
      ),
      exigir(telefone, telefoneValido(telefone.value), 'Informe um telefone com DDD (10 ou 11 dígitos).'),
      exigir(
        email,
        email.value.trim() === '' || ehEmail(email.value),
        'Informe um e-mail válido ou deixe o campo em branco.'
      ),
      exigir(cep, cepValido(cep.value), 'Informe um CEP com 8 dígitos.'),
      exigir(logradouro, logradouro.value.trim() !== '', 'Informe o logradouro.'),
      exigir(cidade, cidade.value.trim() !== '', 'Informe a cidade.'),
      exigir(uf, uf.value.trim().length === 2, 'Informe a UF com 2 letras.'),
      exigir(lgpd, lgpd.checked, 'É necessário aceitar os termos da LGPD.'),
    ];
    if (!resultados.every(Boolean)) {
      focarPrimeiroInvalido(formulario);
      return;
    }

    const dados: DadosCliente = {
      nome: nome.value.trim(),
      cpf: cpf.value,
      rg: rg.value.trim(),
      dataNascimento: nascimento.value,
      telefone: telefone.value,
      email: email.value.trim() === '' ? null : email.value.trim().toLowerCase(),
      cep: cep.value,
      logradouro: logradouro.value.trim(),
      bairro: bairro.value.trim(),
      cidade: cidade.value.trim(),
      uf: uf.value.trim().toUpperCase(),
      aceiteLgpd: lgpd.checked,
    };
    const id = this.idEdicao;

    setCarregando(botao, true, 'Salvando…');
    try {
      if (id === null) {
        await window.api.criarCliente(dados);
        mostrarToast('Cliente cadastrado com sucesso.', 'sucesso');
      } else {
        await window.api.atualizarCliente({ ...dados, id });
        mostrarToast('Dados do cliente atualizados com sucesso.', 'sucesso');
      }
      this.sairDaEdicao();
      await this.contexto.recarregarTudo();
    } catch (erro) {
      const mensagem = mensagemErro(erro);
      marcarInvalido(cpf, mensagem);
      mostrarToast(mensagem, 'erro');
      cpf.focus();
    } finally {
      setCarregando(botao, false);
    }
  }

  private async inativar(cliente: Cliente, botao: HTMLButtonElement): Promise<void> {
    if (!this.contexto.auth.isAdmin()) return;
    const motivo = await pedirMotivo({
      titulo: 'Inativar cliente',
      descricao:
        `O cliente "${cliente.nome}" deixará de aparecer nas listagens. ` +
        'O histórico é preservado e o motivo fica registrado na auditoria.',
      rotuloConfirmar: 'Inativar cliente',
    });
    if (motivo === null) return;

    setCarregando(botao, true, 'Inativando…');
    try {
      await window.api.inativarCliente({ id: cliente.id, motivo });
      if (this.idEdicao === cliente.id) this.sairDaEdicao();
      mostrarToast('Cliente inativado. O motivo foi registrado na auditoria.', 'sucesso');
      await this.contexto.recarregarTudo();
    } catch (erro) {
      mostrarToast(mensagemErro(erro), 'erro');
    } finally {
      setCarregando(botao, false);
    }
  }

  private async reativar(cliente: Cliente, botao: HTMLButtonElement): Promise<void> {
    if (!this.contexto.auth.isAdmin()) return;

    setCarregando(botao, true, 'Reativando…');
    try {
      await window.api.reativarCliente(cliente.id);
      if (this.idEdicao === cliente.id) this.sairDaEdicao();
      mostrarToast('Cliente reativado com sucesso.', 'sucesso');
      await this.contexto.recarregarTudo();
    } catch (erro) {
      mostrarToast(mensagemErro(erro), 'erro');
    } finally {
      setCarregando(botao, false);
    }
  }
}
