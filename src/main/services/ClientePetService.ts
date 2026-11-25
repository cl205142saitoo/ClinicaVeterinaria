import axios from 'axios';
import { ErroAplicacao } from '../../shared/errors';
import type {
  Cliente,
  DadosAtualizacaoCliente,
  DadosAtualizacaoPet,
  DadosCliente,
  DadosInativacao,
  DadosPet,
  Endereco,
  Pet,
  Usuario,
} from '../../shared/types';
import { ClientePetRepository } from '../repositories/ClientePetRepository';

interface ViaCepResponse {
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
}

const MENSAGEM_FALHA_CEP = 'Não foi possível consultar o CEP. Verifique a conexão e tente novamente.';

export class ClientePetService {
  private repo = new ClientePetRepository();

  async buscarEnderecoPorCep(cep: string): Promise<Endereco> {
    const cepLimpo = cep.replace(/\D/g, '');
    if (cepLimpo.length !== 8) {
      throw new ErroAplicacao('CEP inválido. Digite 8 números.');
    }

    let resposta: ViaCepResponse | null = null;
    try {
      const resultado = await axios.get<ViaCepResponse>(
        `https://viacep.com.br/ws/${cepLimpo}/json/`,
        { timeout: 5000 }
      );
      resposta = resultado.data;
    } catch {
      throw new ErroAplicacao(MENSAGEM_FALHA_CEP);
    }

    if (resposta === null || typeof resposta !== 'object' || Array.isArray(resposta)) {
      throw new ErroAplicacao(MENSAGEM_FALHA_CEP);
    }
    if (resposta.erro) {
      throw new ErroAplicacao('CEP não encontrado.');
    }

    return {
      logradouro: typeof resposta.logradouro === 'string' ? resposta.logradouro : '',
      bairro: typeof resposta.bairro === 'string' ? resposta.bairro : '',
      cidade: typeof resposta.localidade === 'string' ? resposta.localidade : '',
      uf: typeof resposta.uf === 'string' ? resposta.uf : '',
    };
  }

  listarClientes(): Promise<Cliente[]> {
    return this.repo.listarClientes();
  }

  criarCliente(dados: DadosCliente): Promise<Cliente> {
    // Decisão mantida: o cadastro exige consentimento. Quando aceiteLgpd é
    // true, o repositório registra data, finalidade e versão do termo.
    if (!dados.aceiteLgpd) {
      throw new ErroAplicacao('É necessário aceitar os termos da LGPD.');
    }
    return this.repo.criarCliente(dados);
  }

  atualizarCliente(
    id: number,
    dados: Partial<Pick<Cliente, 'nome' | 'telefone' | 'email'>>
  ): Promise<Cliente> {
    return this.repo.atualizarCliente(id, dados);
  }

  async atualizarClienteCompleto(dados: DadosAtualizacaoCliente): Promise<Cliente> {
    if (!dados.aceiteLgpd) {
      throw new ErroAplicacao('É necessário aceitar os termos da LGPD.');
    }
    const atual = await this.repo.buscarClientePorId(dados.id);
    if (atual === null) {
      throw new ErroAplicacao('Cliente não encontrado.');
    }
    if (!atual.ativo) {
      throw new ErroAplicacao('Não é possível editar um cliente inativado.');
    }
    if (await this.repo.clienteComCpf(dados.cpf.replace(/\D/g, ''), dados.id)) {
      throw new ErroAplicacao('Já existe outro cliente com este CPF. Confira o número digitado.');
    }
    return this.repo.atualizarClienteDados(dados);
  }

  async inativarCliente(dados: DadosInativacao, usuario: Usuario): Promise<Cliente> {
    const atual = await this.repo.buscarClientePorId(dados.id);
    if (atual === null) {
      throw new ErroAplicacao('Cliente não encontrado.');
    }
    if (!atual.ativo) {
      throw new ErroAplicacao('Este cliente já está inativado.');
    }
    const atualizado = await this.repo.inativarCliente(
      dados.id,
      dados.motivo,
      usuario.id,
      new Date()
    );
    if (atualizado === null) {
      throw new ErroAplicacao('Não foi possível inativar o cliente. Tente novamente.');
    }
    return atualizado;
  }

  async reativarCliente(id: number, usuario: Usuario): Promise<Cliente> {
    const atual = await this.repo.buscarClientePorId(id);
    if (atual === null) {
      throw new ErroAplicacao('Cliente não encontrado.');
    }
    if (atual.ativo !== false) {
      throw new ErroAplicacao('Este cliente já está ativo.');
    }
    const atualizado = await this.repo.reativarCliente(id);
    if (atualizado === null) {
      throw new ErroAplicacao('Não foi possível reativar o cliente. Tente novamente.');
    }
    // `usuario` permanece no contrato para simetria com inativarCliente e
    // futura rastreabilidade da reativação (a autorização já está no handler).
    void usuario;
    return atualizado;
  }

  async deletarCliente(id: number): Promise<Cliente> {
    const quantidadePets = await this.repo.contarPetsDoCliente(id);
    if (quantidadePets > 0) {
      throw new ErroAplicacao(
        'Não é possível excluir este cliente porque ele possui pets cadastrados. Exclua ou arquive os pets antes de continuar.'
      );
    }
    return this.repo.deletarCliente(id);
  }

  listarPets(): Promise<Pet[]> {
    return this.repo.listarPets();
  }

  criarPet(dados: DadosPet): Promise<Pet> {
    return this.repo.criarPet(dados);
  }

  atualizarPet(id: number, dados: Partial<Pick<Pet, 'nome' | 'peso' | 'raca'>>): Promise<Pet> {
    return this.repo.atualizarPet(id, dados);
  }

  async atualizarPetCompleto(dados: DadosAtualizacaoPet): Promise<Pet> {
    const atual = await this.repo.buscarPetPorId(dados.id);
    if (atual === null) {
      throw new ErroAplicacao('Pet não encontrado.');
    }
    if (!atual.ativo) {
      throw new ErroAplicacao('Não é possível editar um pet inativado.');
    }
    if (await this.repo.petComConsultaAgendada(dados.id)) {
      throw new ErroAplicacao(
        'Não é possível editar este pet enquanto houver consulta agendada ou confirmada. Cancele ou conclua a consulta antes de alterar os dados.'
      );
    }

    const cliente = await this.repo.buscarClientePorId(dados.clienteId);
    if (cliente === null) {
      throw new ErroAplicacao('Cliente não encontrado. Confira o tutor selecionado.');
    }
    if (!cliente.ativo) {
      throw new ErroAplicacao('Não é possível vincular o pet a um cliente inativado.');
    }
    if (atual.clienteId !== dados.clienteId && (await this.repo.petComHistorico(dados.id))) {
      throw new ErroAplicacao(
        'Não é possível transferir um pet com consultas, vacinas ou anexos registrados.'
      );
    }
    return this.repo.atualizarPetDados(dados);
  }

  async inativarPet(dados: DadosInativacao, usuario: Usuario): Promise<Pet> {
    const atual = await this.repo.buscarPetPorId(dados.id);
    if (atual === null) {
      throw new ErroAplicacao('Pet não encontrado.');
    }
    if (!atual.ativo) {
      throw new ErroAplicacao('Este pet já está inativado.');
    }
    const atualizado = await this.repo.inativarPet(dados.id, dados.motivo, usuario.id, new Date());
    if (atualizado === null) {
      throw new ErroAplicacao('Não foi possível inativar o pet. Tente novamente.');
    }
    return atualizado;
  }

  async reativarPet(id: number, usuario: Usuario): Promise<Pet> {
    const atual = await this.repo.buscarPetPorId(id);
    if (atual === null) {
      throw new ErroAplicacao('Pet não encontrado.');
    }
    if (atual.ativo !== false) {
      throw new ErroAplicacao('Este pet já está ativo.');
    }
    const atualizado = await this.repo.reativarPet(id);
    if (atualizado === null) {
      throw new ErroAplicacao('Não foi possível reativar o pet. Tente novamente.');
    }
    // Autorização feita no handler; `usuario` fica no contrato por simetria.
    void usuario;
    return atualizado;
  }

  async deletarPet(id: number): Promise<Pet> {
    const [quantidadeConsultas, quantidadeAnexos] = await Promise.all([
      this.repo.contarConsultasDoPet(id),
      this.repo.contarAnexosDoPet(id),
    ]);
    if (quantidadeConsultas > 0 || quantidadeAnexos > 0) {
      throw new ErroAplicacao(
        'Não é possível excluir este pet porque ele possui consultas ou anexos. O prontuário deve ser preservado.'
      );
    }
    return this.repo.deletarPet(id);
  }
}
