/** Ponto de entrada do renderer: liga os módulos e delega os eventos. */

import { carregarAgenda, iniciarAgenda, limparAgenda } from './agenda';
import {
  carregarAnexosPet,
  iniciarAnexos,
  limparAnexos,
  preencherSelectPetsAnexos,
} from './anexos';
import { aplicarPermissoes, iniciarAuth, isAdmin } from './auth';
import { carregarClientes, iniciarClientes, renderizarClientes } from './clientes';
import { carregarEstoque, iniciarEstoque, limparEstoque } from './estoque';
import { carregarPets, iniciarPets, preencherSelectClientes, renderizarPets } from './pets';
import {
  carregarProntuarioPet,
  iniciarProntuario,
  limparProntuario,
  preencherSelectPetsProntuario,
} from './prontuario';
import {
  carregarVacinasPet,
  iniciarVacinas,
  limparVacinas,
  preencherSelectPetsVacinas,
} from './vacinas';
import {
  confirmarExclusao,
  limparInvalido,
  mensagemErro,
  mostrarToast,
  setCarregando,
} from './ui';

export async function carregarTudo(): Promise<void> {
  try {
    const [clientes, pets] = await Promise.all([carregarClientes(), carregarPets()]);
    preencherSelectClientes(clientes);
    renderizarClientes(clientes);
    renderizarPets(pets);
    preencherSelectPetsProntuario(pets);
    preencherSelectPetsVacinas(pets);
    preencherSelectPetsAnexos(pets);
    await Promise.all([carregarAgenda(), carregarProntuarioPet(), carregarVacinasPet(), carregarAnexosPet()]);
    await carregarEstoque();
    aplicarPermissoes();
  } catch (erro) {
    mostrarToast(`Não foi possível carregar os dados: ${mensagemErro(erro)}`, 'erro');
  }
}

function limparEstadoAoSair(): void {
  renderizarClientes([]);
  renderizarPets([]);
  preencherSelectClientes([]);
  limparAgenda();
  limparEstoque();
  limparProntuario();
  limparVacinas();
  limparAnexos();
}

function configurarValidacaoDinamica(): void {
  const limpar = (evento: Event): void => {
    const alvo = evento.target;
    if (alvo instanceof HTMLInputElement || alvo instanceof HTMLSelectElement || alvo instanceof HTMLTextAreaElement) {
      if (alvo.classList.contains('is-invalid')) limparInvalido(alvo);
    }
  };
  document.addEventListener('input', limpar);
  document.addEventListener('change', limpar);
}

function configurarExclusao(): void {
  document.addEventListener('click', async (evento) => {
    const alvo = evento.target;
    if (!(alvo instanceof Element)) return;
    const botao = alvo.closest<HTMLButtonElement>('[data-excluir]');
    if (!botao || botao.hidden || !isAdmin()) return;

    const tipo = botao.dataset.excluir;
    const id = Number(botao.dataset.id);
    if ((tipo !== 'cliente' && tipo !== 'pet') || !Number.isInteger(id)) return;

    const nome = botao.dataset.nome ?? 'o registro';
    const confirmado = await confirmarExclusao(nome);
    if (!confirmado) return;

    setCarregando(botao, true, 'Excluindo…');
    try {
      if (tipo === 'cliente') {
        await window.api.deletarCliente(id);
      } else {
        await window.api.deletarPet(id);
      }
      mostrarToast(`${tipo === 'cliente' ? 'Cliente' : 'Pet'} excluído com sucesso.`, 'sucesso');
    } catch (erro) {
      mostrarToast(mensagemErro(erro), 'erro');
    } finally {
      setCarregando(botao, false);
      await carregarTudo();
    }
  });
}

function iniciar(): void {
  configurarValidacaoDinamica();
  configurarExclusao();
  void iniciarAgenda();
  void iniciarAnexos();
  void iniciarEstoque();
  void iniciarProntuario();
  void iniciarVacinas();
  iniciarAuth({
    aoAutenticar: () => void carregarTudo(),
    aoSair: limparEstadoAoSair,
  });
  iniciarClientes({ aoSalvar: () => void carregarTudo() });
  iniciarPets({ aoSalvar: () => void carregarTudo() });
}

iniciar();
