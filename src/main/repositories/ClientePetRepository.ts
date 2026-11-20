import type { Prisma } from '@prisma/client';
import { LGPD_FINALIDADE_CADASTRO, LGPD_VERSAO_TERMO } from '../../shared/constants';
import type { Cliente, DadosCliente, DadosPet, Pet } from '../../shared/types';
import { Database } from '../database/PrismaClient';

/**
 * Projeções explícitas: evitam trazer colunas de auditoria/sensíveis que o
 * renderer não consome e mantêm o contrato de `src/shared/types.ts`.
 * Consultas de listagem não usam `SELECT *`; paginação ficou pendente para a
 * Etapa 5 porque alteraria a superfície IPC já existente.
 */
const selecaoPet: Prisma.PetSelect = {
  id: true,
  nome: true,
  especie: true,
  raca: true,
  peso: true,
  nascimento: true,
  clienteId: true,
};

const selecaoCliente: Prisma.ClienteSelect = {
  id: true,
  nome: true,
  cpf: true,
  telefone: true,
  email: true,
  cep: true,
  logradouro: true,
  bairro: true,
  cidade: true,
  uf: true,
  aceiteLgpd: true,
  criadoEm: true,
};

export class ClientePetRepository {
  private prisma = Database.getInstance();

  async listarClientes(): Promise<Cliente[]> {
    return this.prisma.cliente.findMany({
      select: {
        ...selecaoCliente,
        pets: { select: selecaoPet, orderBy: { id: 'desc' } },
      },
      orderBy: { id: 'desc' },
    });
  }

  async criarCliente(dados: DadosCliente): Promise<Cliente> {
    const agora = new Date();
    // O renderer aplica máscara e o validador aceita pontuação. No MySQL as
    // colunas são VARCHAR(11)/VARCHAR(11)/VARCHAR(8): persistimos só dígitos.
    const cpf = dados.cpf.replace(/\D/g, '');
    const telefone = dados.telefone.replace(/\D/g, '');
    const cep = dados.cep.replace(/\D/g, '');
    return this.prisma.cliente.create({
      data: {
        nome: dados.nome,
        cpf,
        telefone,
        cep,
        logradouro: dados.logradouro,
        bairro: dados.bairro,
        cidade: dados.cidade,
        uf: dados.uf,
        aceiteLgpd: dados.aceiteLgpd,
        lgpdAceiteEm: dados.aceiteLgpd ? agora : null,
        lgpdFinalidade: dados.aceiteLgpd ? LGPD_FINALIDADE_CADASTRO : null,
        lgpdVersaoTermo: dados.aceiteLgpd ? LGPD_VERSAO_TERMO : null,
        // A sessão não chega ao service nesta etapa (contrato IPC inalterado).
        // Etapa 5: propagar o usuário autenticado para preencher criadoPorId.
        criadoPorId: null,
      },
      select: selecaoCliente,
    });
  }

  async atualizarCliente(
    id: number,
    dados: Partial<Pick<Cliente, 'nome' | 'telefone' | 'email'>>
  ): Promise<Cliente> {
    return this.prisma.cliente.update({ where: { id }, data: dados, select: selecaoCliente });
  }

  contarPetsDoCliente(clienteId: number): Promise<number> {
    return this.prisma.pet.count({ where: { clienteId } });
  }

  async deletarCliente(id: number): Promise<Cliente> {
    return this.prisma.cliente.delete({ where: { id }, select: selecaoCliente });
  }

  async listarPets(): Promise<Pet[]> {
    return this.prisma.pet.findMany({
      select: {
        ...selecaoPet,
        cliente: { select: selecaoCliente },
      },
      orderBy: { id: 'desc' },
    });
  }

  async criarPet(dados: DadosPet): Promise<Pet> {
    return this.prisma.pet.create({
      data: {
        clienteId: dados.clienteId,
        nome: dados.nome,
        especie: dados.especie,
        raca: dados.raca,
        peso: dados.peso,
        nascimento: dados.nascimento,
        // Mesma pendência de rastreabilidade de criador de Cliente.
        criadoPorId: null,
      },
      select: selecaoPet,
    });
  }

  async atualizarPet(id: number, dados: Partial<Pick<Pet, 'nome' | 'peso' | 'raca'>>): Promise<Pet> {
    return this.prisma.pet.update({ where: { id }, data: dados, select: selecaoPet });
  }

  contarConsultasDoPet(petId: number): Promise<number> {
    return this.prisma.consulta.count({ where: { petId } });
  }

  contarAnexosDoPet(petId: number): Promise<number> {
    return this.prisma.anexoClinico.count({ where: { petId } });
  }

  async deletarPet(id: number): Promise<Pet> {
    return this.prisma.pet.delete({ where: { id }, select: selecaoPet });
  }
}
