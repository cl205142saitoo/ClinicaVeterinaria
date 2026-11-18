import axios from 'axios';
import { ClientePetRepository } from '../repositories/ClientePetRepository';

export class ClientePetService {
  private repo = new ClientePetRepository();

  async buscarEnderecoPorCep(cep: string) {
    const cepLimpo = cep.replace(/\D/g, '');
    if (cepLimpo.length !== 8) {
      throw new Error('CEP inválido. Digite 8 números.');
    }
    const { data } = await axios.get(`https://viacep.com.br/ws/${cepLimpo}/json/`);
    if (data.erro) {
      throw new Error('CEP não encontrado.');
    }
    return {
      logradouro: data.logradouro || '',
      bairro: data.bairro || '',
      cidade: data.localidade || '',
      uf: data.uf || '',
    };
  }

  listarClientes() { return this.repo.listarClientes(); }
  criarCliente(dados: any) { return this.repo.criarCliente(dados); }
  atualizarCliente(id: number, dados: any) { return this.repo.atualizarCliente(id, dados); }
  deletarCliente(id: number) { return this.repo.deletarCliente(id); }

  listarPets() { return this.repo.listarPets(); }
  criarPet(dados: any) { return this.repo.criarPet({ ...dados, peso: Number(dados.peso), clienteId: Number(dados.clienteId) }); }
  atualizarPet(id: number, dados: any) { return this.repo.atualizarPet(id, dados); }
  deletarPet(id: number) { return this.repo.deletarPet(id); }
}