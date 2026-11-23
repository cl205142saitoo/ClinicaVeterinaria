/** Domínio de clientes: formulário, ViaCEP e listagem. */

import { dataCivilClinica, formatarDataCivil } from '../shared/datas';
import type { Cliente } from './types';
import {
  aplicarMascara,
  cepValido,
  criarBotaoExcluir,
  criarCelula,
  cpfValido,
  exigir,
  focarPrimeiroInvalido,
  formatarCep,
  formatarCpf,
  formatarTelefone,
  limparInvalido,
  limparValidacao,
  marcarInvalido,
  mensagemErro,
  mostrarToast,
  obrigatorio,
  setCarregando,
  telefoneValido,
} from './ui';

export function carregarClientes(): Promise<Cliente[]> {
  return window.api.listarClientes();
}

export function renderizarClientes(clientes: Cliente[]): void {
  const corpo = obrigatorio<HTMLTableSectionElement>('#tbClientes');
  corpo.replaceChildren();

  if (clientes.length === 0) {
    const linha = document.createElement('tr');
    const celula = document.createElement('td');
    celula.colSpan = 7;
    celula.className = 'text-center text-muted fst-italic py-4';
    celula.textContent = 'Nenhum cliente cadastrado.';
    linha.append(celula);
    corpo.append(linha);
    return;
  }

  for (const cliente of clientes) {
    const linha = document.createElement('tr');
    linha.append(
      criarCelula(cliente.nome),
      criarCelula(cliente.cpf, 'text-nowrap small'),
      criarCelula(cliente.rg ?? '—', 'small'),
      criarCelula(formatarDataCivil(cliente.dataNascimento), 'text-nowrap small'),
      criarCelula(`${cliente.cidade} - ${cliente.uf}`),
      criarCelula(String(cliente.pets?.length ?? 0), 'text-center'),
    );
    const acao = document.createElement('td');
    acao.append(criarBotaoExcluir('cliente', cliente.id, cliente.nome));
    linha.append(acao);
    corpo.append(linha);
  }
}

export function iniciarClientes(opcoes: { aoSalvar: () => void }): void {
  const formulario = obrigatorio<HTMLFormElement>('#formCliente');
  const botaoCep = obrigatorio<HTMLButtonElement>('#btnBuscarCep');
  const botaoSalvar = obrigatorio<HTMLButtonElement>('#btnSalvarCliente');

  const cpf = obrigatorio<HTMLInputElement>('#cCpf');
  const rg = obrigatorio<HTMLInputElement>('#cRg');
  const nascimento = obrigatorio<HTMLInputElement>('#cNascimento');
  const telefone = obrigatorio<HTMLInputElement>('#cTel');
  const cep = obrigatorio<HTMLInputElement>('#cCep');

  aplicarMascara(cpf, formatarCpf);
  aplicarMascara(telefone, formatarTelefone);
  aplicarMascara(cep, formatarCep);

  botaoCep.addEventListener('click', async () => {
    limparInvalido(cep);
    if (!cepValido(cep.value)) {
      marcarInvalido(cep, 'Digite os 8 números do CEP.');
      cep.focus();
      return;
    }

    setCarregando(botaoCep, true, 'Buscando…');
    try {
      const endereco = await window.api.buscarCep(cep.value);
      obrigatorio<HTMLInputElement>('#cRua').value = endereco.logradouro;
      obrigatorio<HTMLInputElement>('#cBairro').value = endereco.bairro;
      obrigatorio<HTMLInputElement>('#cCidade').value = endereco.cidade;
      obrigatorio<HTMLInputElement>('#cUf').value = endereco.uf;
      mostrarToast('Endereço encontrado. Confira os dados antes de salvar.', 'sucesso');
    } catch (erro) {
      const mensagem = mensagemErro(erro);
      marcarInvalido(cep, mensagem);
      mostrarToast(mensagem, 'erro');
      cep.focus();
    } finally {
      setCarregando(botaoCep, false);
    }
  });

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const nome = obrigatorio<HTMLInputElement>('#cNome');
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

    setCarregando(botaoSalvar, true, 'Salvando…');
    try {
      await window.api.criarCliente({
        nome: nome.value.trim(),
        cpf: cpf.value,
        rg: rg.value.trim(),
        dataNascimento: nascimento.value,
        telefone: telefone.value,
        cep: cep.value,
        logradouro: logradouro.value.trim(),
        bairro: bairro.value.trim(),
        cidade: cidade.value.trim(),
        uf: uf.value.trim().toUpperCase(),
        aceiteLgpd: lgpd.checked,
      });
      formulario.reset();
      limparValidacao(formulario);
      mostrarToast('Cliente cadastrado com sucesso.', 'sucesso');
      nome.focus();
      opcoes.aoSalvar();
    } catch (erro) {
      const mensagem = mensagemErro(erro);
      marcarInvalido(cpf, mensagem);
      mostrarToast(mensagem, 'erro');
      cpf.focus();
    } finally {
      setCarregando(botaoSalvar, false);
    }
  });
}
