/** Domínio de pets: formulário, vínculo com tutor, listagem, edição e inativação. */

import { PET_IDADE_MAXIMA_ANOS } from '../../shared/constants';
import type { Cliente, DadosPet, Pet } from '../types';
import {
  criarBotaoAcao,
  criarCelula,
  exigir,
  focarPrimeiroInvalido,
  linhaMensagem,
  limparValidacao,
  marcarInvalido,
  mascararCpf,
  mensagemErro,
  mostrarToast,
  obrigatorio,
  pedirMotivo,
  pesoValido,
  setCarregando,
} from '../ui';
import type { ContextoApp } from './contexto';

const COLUNAS = 4;

export class PetController {
  private petsVisiveis = new Map<number, Pet>();
  private idEdicao: number | null = null;

  constructor(private readonly contexto: ContextoApp) {}

  iniciar(): void {
    const formulario = obrigatorio<HTMLFormElement>('#formPet');
    const botaoSalvar = obrigatorio<HTMLButtonElement>('#btnSalvarPet');
    const botaoCancelar = obrigatorio<HTMLButtonElement>('#btnCancelarEdicaoPet');
    const corpo = obrigatorio<HTMLTableSectionElement>('#tbPets');

    formulario.addEventListener('submit', (evento) => {
      void this.salvar(evento, botaoSalvar);
    });
    botaoCancelar.addEventListener('click', () => this.sairDaEdicao());
    corpo.addEventListener('click', (evento) => {
      void this.tratarAcao(evento);
    });
    this.atualizarModoEdicao();
  }

  carregar(): Promise<Pet[]> {
    return window.api.listarPets();
  }

  /** Preenche o seletor de tutores preservando a seleção atual. */
  preencherSelectClientes(clientes: Cliente[]): void {
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

  renderizar(pets: Pet[]): void {
    const corpo = obrigatorio<HTMLTableSectionElement>('#tbPets');
    corpo.replaceChildren();
    this.petsVisiveis = new Map(pets.map((pet) => [pet.id, pet]));

    if (pets.length === 0) {
      corpo.append(linhaMensagem('Nenhum pet cadastrado.', COLUNAS));
      return;
    }

    for (const pet of pets) {
      const linha = document.createElement('tr');
      linha.append(
        criarCelula(pet.nome),
        criarCelula(`${pet.especie} / ${pet.raca} — ${pet.idade} ${pet.idade === 1 ? 'ano' : 'anos'}`),
        criarCelula(pet.cliente?.nome ?? '—')
      );

      const acao = document.createElement('td');
      const grupo = document.createElement('div');
      grupo.className = 'd-flex flex-wrap gap-1';
      grupo.setAttribute('role', 'group');
      grupo.setAttribute('aria-label', `Ações do pet ${pet.nome}`);
      grupo.append(
        criarBotaoAcao('editar-pet', pet.id, 'Editar', `Editar o pet ${pet.nome}`),
        criarBotaoAcao(
          'inativar-pet',
          pet.id,
          'Inativar',
          `Inativar o pet ${pet.nome}`,
          'btn-outline-warning danger'
        )
      );
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
    const pet = this.petsVisiveis.get(id);
    if (pet === undefined) return;

    if (botao.dataset.acao === 'editar-pet') {
      this.preencherFormulario(pet);
    } else if (botao.dataset.acao === 'inativar-pet') {
      await this.inativar(pet, botao);
    }
  }

  private preencherFormulario(pet: Pet): void {
    this.idEdicao = pet.id;
    this.definirValor('#pNome', pet.nome);
    this.definirValor('#pEspecie', pet.especie);
    this.definirValor('#pRaca', pet.raca);
    this.definirValor('#pIdade', String(pet.idade));
    this.definirValor('#pPeso', String(pet.peso));
    obrigatorio<HTMLSelectElement>('#pCliente').value = String(pet.clienteId);

    limparValidacao(obrigatorio<HTMLFormElement>('#formPet'));
    this.atualizarModoEdicao();
    obrigatorio<HTMLInputElement>('#pNome').focus();
  }

  private atualizarModoEdicao(): void {
    const editando = this.idEdicao !== null;
    obrigatorio<HTMLElement>('#tituloFormPet').textContent = editando ? 'Editar pet' : 'Novo pet';
    obrigatorio<HTMLButtonElement>('#btnSalvarPet').textContent = editando
      ? 'Salvar alterações'
      : 'Cadastrar pet';
    obrigatorio<HTMLButtonElement>('#btnCancelarEdicaoPet').hidden = !editando;
  }

  private sairDaEdicao(): void {
    this.idEdicao = null;
    const formulario = obrigatorio<HTMLFormElement>('#formPet');
    formulario.reset();
    limparValidacao(formulario);
    this.atualizarModoEdicao();
    obrigatorio<HTMLSelectElement>('#pCliente').focus();
  }

  private definirValor(seletor: string, valor: string): void {
    obrigatorio<HTMLInputElement>(seletor).value = valor;
  }

  private async salvar(evento: Event, botao: HTMLButtonElement): Promise<void> {
    evento.preventDefault();
    const formulario = obrigatorio<HTMLFormElement>('#formPet');
    const cliente = obrigatorio<HTMLSelectElement>('#pCliente');
    const nome = obrigatorio<HTMLInputElement>('#pNome');
    const especie = obrigatorio<HTMLInputElement>('#pEspecie');
    const raca = obrigatorio<HTMLInputElement>('#pRaca');
    const idade = obrigatorio<HTMLInputElement>('#pIdade');
    const peso = obrigatorio<HTMLInputElement>('#pPeso');
    limparValidacao(formulario);

    const resultados = [
      exigir(cliente, cliente.value !== '', 'Selecione o tutor do pet.'),
      exigir(nome, nome.value.trim().length >= 2, 'Informe o nome do pet.'),
      exigir(especie, especie.value.trim() !== '', 'Informe a espécie.'),
      exigir(
        idade,
        /^\d+$/.test(idade.value.trim()) &&
          Number(idade.value) >= 0 &&
          Number(idade.value) <= PET_IDADE_MAXIMA_ANOS,
        `Informe a idade em anos (de 0 a ${PET_IDADE_MAXIMA_ANOS}).`
      ),
      exigir(peso, pesoValido(peso.value), 'Informe um peso em kg maior que zero.'),
    ];
    if (!resultados.every(Boolean)) {
      focarPrimeiroInvalido(formulario);
      return;
    }

    const dados: DadosPet = {
      clienteId: Number(cliente.value),
      nome: nome.value.trim(),
      especie: especie.value.trim(),
      raca: raca.value.trim(),
      idade: Number(idade.value),
      peso: Number(peso.value.replace(',', '.')),
    };
    const id = this.idEdicao;

    setCarregando(botao, true, 'Salvando…');
    try {
      if (id === null) {
        await window.api.criarPet(dados);
        mostrarToast('Pet cadastrado com sucesso.', 'sucesso');
      } else {
        await window.api.atualizarPet({ ...dados, id });
        mostrarToast('Dados do pet atualizados com sucesso.', 'sucesso');
      }
      this.sairDaEdicao();
      await this.contexto.recarregarTudo();
    } catch (erro) {
      const mensagem = mensagemErro(erro);
      marcarInvalido(nome, mensagem);
      mostrarToast(mensagem, 'erro');
      nome.focus();
    } finally {
      setCarregando(botao, false);
    }
  }

  private async inativar(pet: Pet, botao: HTMLButtonElement): Promise<void> {
    if (!this.contexto.auth.isAdmin()) return;
    const motivo = await pedirMotivo({
      titulo: 'Inativar pet',
      descricao:
        `O pet "${pet.nome}" deixará de aparecer nas listagens. ` +
        'O histórico clínico é preservado e o motivo fica registrado na auditoria.',
      rotuloConfirmar: 'Inativar pet',
    });
    if (motivo === null) return;

    setCarregando(botao, true, 'Inativando…');
    try {
      await window.api.inativarPet({ id: pet.id, motivo });
      if (this.idEdicao === pet.id) this.sairDaEdicao();
      mostrarToast('Pet inativado. O motivo foi registrado na auditoria.', 'sucesso');
      await this.contexto.recarregarTudo();
    } catch (erro) {
      mostrarToast(mensagemErro(erro), 'erro');
    } finally {
      setCarregando(botao, false);
    }
  }

}
