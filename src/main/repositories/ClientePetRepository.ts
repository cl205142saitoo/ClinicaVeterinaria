import { Database } from '../database/PrismaClient';

export class ClientePetRepository {
  private prisma = Database.getInstance();

  // --- CRUD CLIENTE ---
  async listarClientes() {
    return this.prisma.cliente.findMany({
      include: { pets: true },
      orderBy: { id: 'desc' },
    });
  }

  async criarCliente(dados: {
    nome: string;
    cpf: string;
    telefone: string;
    email?: string;
    cep: string;
    logradouro: string;
    bairro: string;
    cidade: string;
    uf: string;
    aceiteLgpd: boolean;
  }) {
    return this.prisma.cliente.create({ data: dados });
  }

  async atualizarCliente(id: number, dados: Partial<{ nome: string; telefone: string; email: string }>) {
    return this.prisma.cliente.update({ where: { id }, data: dados });
  }

  async deletarCliente(id: number) {
    return this.prisma.cliente.delete({ where: { id } });
  }

  // --- CRUD PET ---
  async listarPets() {
    return this.prisma.pet.findMany({
      include: { cliente: true },
      orderBy: { id: 'desc' },
    });
  }

  async criarPet(dados: {
    nome: string;
    especie: string;
    raca: string;
    peso: number;
    nascimento?: string;
    clienteId: number;
  }) {
    return this.prisma.pet.create({ data: dados });
  }

  async atualizarPet(id: number, dados: Partial<{ nome: string; peso: number; raca: string }>) {
    return this.prisma.pet.update({ where: { id }, data: dados });
  }

  async deletarPet(id: number) {
    return this.prisma.pet.delete({ where: { id } });
  }
}