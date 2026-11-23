/** Domínio de pets: formulário, vínculo com tutor e listagem. */

import type { Cliente, Pet } from './types';
import {
  criarBotaoExcluir,
  criarCelula,
  exigir,
  focarPrimeiroInvalido,
  limparValidacao,
  marcarInvalido,
  mascararCpf,
  mensagemErro,
  mostrarToast,
  obrigatorio,
  pesoValido,
  setCarregando,
} from './ui';

export function carregarPets(): Promise<Pet[]> {
  return window.api.listarPets();
}

export function preencherSelectClientes(clientes: Cliente[]): void {
  const select = obrigatorio<HTMLSelectElement>('#pCliente');
  const anterior = select.value;
  select.replaceChildren();

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = clientes.length ? 'Selecione o tutor' : 'Cadastre um cliente primeiro';
  select.append(placeholder);

  for (const cliente of clientes) {
    const opcao = document.createElement('option');
    opcao.value = String(cliente.id);
    opcao.textContent = `${cliente.nome} — ${mascararCpf(cliente.cpf)}`;
    select.append(opcao);
  }

  select.value = clientes.some((cliente) => String(cliente.id) === anterior) ? anterior : '';
}

export function renderizarPets(pets: Pet[]): void {
  const corpo = obrigatorio<HTMLTableSectionElement>('#tbPets');
  corpo.replaceChildren();

  if (pets.length === 0) {
    const linha = document.createElement('tr');
    const celula = document.createElement('td');
    celula.colSpan = 4;
    celula.className = 'text-center text-muted fst-italic py-4';
    celula.textContent = 'Nenhum pet cadastrado.';
    linha.append(celula);
    corpo.append(linha);
    return;
  }

  for (const pet of pets) {
    const linha = document.createElement('tr');
    linha.append(
      criarCelula(pet.nome),
      criarCelula(`${pet.especie} / ${pet.raca}`),
      criarCelula(pet.cliente?.nome ?? '—'),
    );
    const acao = document.createElement('td');
    acao.append(criarBotaoExcluir('pet', pet.id, pet.nome));
    linha.append(acao);
    corpo.append(linha);
  }
}

export function iniciarPets(opcoes: { aoSalvar: () => void }): void {
  const formulario = obrigatorio<HTMLFormElement>('#formPet');
  const botaoSalvar = obrigatorio<HTMLButtonElement>('#btnSalvarPet');

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const cliente = obrigatorio<HTMLSelectElement>('#pCliente');
    const nome = obrigatorio<HTMLInputElement>('#pNome');
    const especie = obrigatorio<HTMLInputElement>('#pEspecie');
    const raca = obrigatorio<HTMLInputElement>('#pRaca');
    const peso = obrigatorio<HTMLInputElement>('#pPeso');
    limparValidacao(formulario);

    const resultados = [
      exigir(cliente, cliente.value !== '', 'Selecione o tutor do pet.'),
      exigir(nome, nome.value.trim().length >= 2, 'Informe o nome do pet.'),
      exigir(especie, especie.value.trim() !== '', 'Informe a espécie.'),
      exigir(peso, pesoValido(peso.value), 'Informe um peso em kg maior que zero.'),
    ];
    if (!resultados.every(Boolean)) {
      focarPrimeiroInvalido(formulario);
      return;
    }

    setCarregando(botaoSalvar, true, 'Salvando…');
    try {
      await window.api.criarPet({
        clienteId: Number(cliente.value),
        nome: nome.value.trim(),
        especie: especie.value.trim(),
        raca: raca.value.trim(),
        peso: Number(peso.value.replace(',', '.')),
      });
      formulario.reset();
      limparValidacao(formulario);
      mostrarToast('Pet cadastrado com sucesso.', 'sucesso');
      cliente.focus();
      opcoes.aoSalvar();
    } catch (erro) {
      const mensagem = mensagemErro(erro);
      marcarInvalido(nome, mensagem);
      mostrarToast(mensagem, 'erro');
      nome.focus();
    } finally {
      setCarregando(botaoSalvar, false);
    }
  });
}
