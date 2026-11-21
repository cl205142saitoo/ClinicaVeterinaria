import type { Prisma } from '@prisma/client';
import { LGPD_FINALIDADE_CADASTRO, LGPD_VERSAO_TERMO } from '../../shared/constants';
import type {
  Cliente,
  DadosAtualizacaoCliente,
  DadosAtualizacaoPet,
  DadosCliente,
  DadosPet,
  Pet,
} from '../../shared/types';
import { Database } from '../database/PrismaClient';

/**
 * Projeções explícitas: evitam trazer colunas de auditoria/sensíveis que o
 * renderer não consome e mantêm o contrato de `src/shared/types.ts`.
 * Consultas de listagem não usam `SELECT *`; paginação ficou pendente para a
 * Etapa 5 porque alteraria a superfície IPC já existente.
 */
const selecaoPet = {
  id: true,
  nome: true,
  especie: true,
  raca: true,
  peso: true,
  nascimento: true,
  clienteId: true,
  ativo: true,
  inativadoEm: true,
  motivoInativacao: true,
} satisfies Prisma.PetSelect;

const selecaoCliente = {
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
  ativo: true,
  inativadoEm: true,
  motivoInativacao: true,
} satisfies Prisma.ClienteSelect;

const selecaoClienteComPets = {
  ...selecaoCliente,
  pets: { select: selecaoPet, orderBy: { id: 'desc' } },
} satisfies Prisma.ClienteSelect;

const selecaoPetComCliente = {
  ...selecaoPet,
  cliente: { select: selecaoCliente },
} satisfies Prisma.PetSelect;

type RegistroPet = Prisma.PetGetPayload<{ select: typeof selecaoPet }>;
type RegistroPetComCliente = Prisma.PetGetPayload<{ select: typeof selecaoPetComCliente }>;
type RegistroCliente = Prisma.ClienteGetPayload<{ select: typeof selecaoCliente }>;
type RegistroClienteComPets = Prisma.ClienteGetPayload<{ select: typeof selecaoClienteComPets }>;

function dataOpcional(valor: Date | null): string | null {
  return valor === null ? null : valor.toISOString();
}

function paraPet(registro: RegistroPet): Pet {
  return {
    id: registro.id,
    nome: registro.nome,
    especie: registro.especie,
    raca: registro.raca,
    peso: registro.peso,
    nascimento: registro.nascimento,
    clienteId: registro.clienteId,
    ativo: registro.ativo,
    inativadoEm: dataOpcional(registro.inativadoEm),
    motivoInativacao: registro.motivoInativacao,
  };
}

function paraCliente(registro: RegistroCliente): Cliente {
  return {
    id: registro.id,
    nome: registro.nome,
    cpf: registro.cpf,
    telefone: registro.telefone,
    email: registro.email,
    cep: registro.cep,
    logradouro: registro.logradouro,
    bairro: registro.bairro,
    cidade: registro.cidade,
    uf: registro.uf,
    aceiteLgpd: registro.aceiteLgpd,
    criadoEm: registro.criadoEm,
    ativo: registro.ativo,
    inativadoEm: dataOpcional(registro.inativadoEm),
    motivoInativacao: registro.motivoInativacao,
  };
}

function paraClienteComPets(registro: RegistroClienteComPets): Cliente {
  return {
    ...paraCliente(registro),
    pets: registro.pets.map(paraPet),
  };
}

function paraPetComCliente(registro: RegistroPetComCliente): Pet {
  return {
    ...paraPet(registro),
    cliente: paraCliente(registro.cliente),
  };
}

export class ClientePetRepository {
  private prisma = Database.getInstance();

  async listarClientes(): Promise<Cliente[]> {
    const registros = await this.prisma.cliente.findMany({
      select: selecaoClienteComPets,
      orderBy: { id: 'desc' },
    });
    return registros.map(paraClienteComPets);
  }

  async buscarClientePorId(id: number): Promise<Cliente | null> {
    const registro = await this.prisma.cliente.findUnique({ where: { id }, select: selecaoCliente });
    return registro === null ? null : paraCliente(registro);
  }

  /** CPF é único no banco; a checagem prévia evita depender do erro do driver. */
  async clienteComCpf(cpf: string, ignorarId?: number): Promise<boolean> {
    const registro = await this.prisma.cliente.findFirst({
      where: { cpf, ...(ignorarId === undefined ? {} : { id: { not: ignorarId } }) },
      select: { id: true },
    });
    return registro !== null;
  }

  async criarCliente(dados: DadosCliente): Promise<Cliente> {
    const agora = new Date();
    // O renderer aplica máscara e o validador aceita pontuação. No MySQL as
    // colunas são VARCHAR(11)/VARCHAR(11)/VARCHAR(8): persistimos só dígitos.
    const cpf = dados.cpf.replace(/\D/g, '');
    const telefone = dados.telefone.replace(/\D/g, '');
    const cep = dados.cep.replace(/\D/g, '');
    const registro = await this.prisma.cliente.create({
      data: {
        nome: dados.nome.trim(),
        cpf,
        telefone,
        cep,
        logradouro: dados.logradouro.trim(),
        bairro: dados.bairro.trim(),
        cidade: dados.cidade.trim(),
        uf: dados.uf.trim().toUpperCase(),
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
    return paraCliente(registro);
  }

  async atualizarCliente(
    id: number,
    dados: Partial<Pick<Cliente, 'nome' | 'telefone' | 'email'>>
  ): Promise<Cliente> {
    const registro = await this.prisma.cliente.update({ where: { id }, data: dados, select: selecaoCliente });
    return paraCliente(registro);
  }

  async atualizarClienteDados(dados: DadosAtualizacaoCliente): Promise<Cliente> {
    const anterior = await this.prisma.cliente.findUnique({
      where: { id: dados.id },
      select: { lgpdAceiteEm: true },
    });
    const agora = new Date();
    const registro = await this.prisma.cliente.update({
      where: { id: dados.id },
      data: {
        nome: dados.nome.trim(),
        cpf: dados.cpf.replace(/\D/g, ''),
        telefone: dados.telefone.replace(/\D/g, ''),
        cep: dados.cep.replace(/\D/g, ''),
        logradouro: dados.logradouro.trim(),
        bairro: dados.bairro.trim(),
        cidade: dados.cidade.trim(),
        uf: dados.uf.trim().toUpperCase(),
        aceiteLgpd: dados.aceiteLgpd,
        lgpdAceiteEm: dados.aceiteLgpd ? (anterior?.lgpdAceiteEm ?? agora) : null,
        lgpdFinalidade: dados.aceiteLgpd ? LGPD_FINALIDADE_CADASTRO : null,
        lgpdVersaoTermo: dados.aceiteLgpd ? LGPD_VERSAO_TERMO : null,
      },
      select: selecaoCliente,
    });
    return paraCliente(registro);
  }

  async inativarCliente(
    id: number,
    motivo: string,
    responsavelId: number,
    agora: Date
  ): Promise<Cliente | null> {
    const resultado = await this.prisma.cliente.updateMany({
      where: { id, ativo: true },
      data: {
        ativo: false,
        inativadoPorId: responsavelId,
        inativadoEm: agora,
        motivoInativacao: motivo.trim(),
      },
    });
    if (resultado.count !== 1) return null;
    return this.buscarClientePorId(id);
  }

  contarPetsDoCliente(clienteId: number): Promise<number> {
    return this.prisma.pet.count({ where: { clienteId } });
  }

  async deletarCliente(id: number): Promise<Cliente> {
    const registro = await this.prisma.cliente.delete({ where: { id }, select: selecaoCliente });
    return paraCliente(registro);
  }

  async listarPets(): Promise<Pet[]> {
    const registros = await this.prisma.pet.findMany({
      select: selecaoPetComCliente,
      orderBy: { id: 'desc' },
    });
    return registros.map(paraPetComCliente);
  }

  async buscarPetPorId(id: number): Promise<Pet | null> {
    const registro = await this.prisma.pet.findUnique({ where: { id }, select: selecaoPet });
    return registro === null ? null : paraPet(registro);
  }

  async criarPet(dados: DadosPet): Promise<Pet> {
    const registro = await this.prisma.pet.create({
      data: {
        clienteId: dados.clienteId,
        nome: dados.nome.trim(),
        especie: dados.especie.trim(),
        raca: dados.raca.trim(),
        peso: dados.peso,
        nascimento: dados.nascimento,
        // Mesma pendência de rastreabilidade de criador de Cliente.
        criadoPorId: null,
      },
      select: selecaoPet,
    });
    return paraPet(registro);
  }

  async atualizarPet(id: number, dados: Partial<Pick<Pet, 'nome' | 'peso' | 'raca'>>): Promise<Pet> {
    const registro = await this.prisma.pet.update({ where: { id }, data: dados, select: selecaoPet });
    return paraPet(registro);
  }

  async atualizarPetDados(dados: DadosAtualizacaoPet): Promise<Pet> {
    const registro = await this.prisma.pet.update({
      where: { id: dados.id },
      data: {
        clienteId: dados.clienteId,
        nome: dados.nome.trim(),
        especie: dados.especie.trim(),
        raca: dados.raca.trim(),
        peso: dados.peso,
        nascimento: dados.nascimento,
      },
      select: selecaoPet,
    });
    return paraPet(registro);
  }

  async inativarPet(
    id: number,
    motivo: string,
    responsavelId: number,
    agora: Date
  ): Promise<Pet | null> {
    const resultado = await this.prisma.pet.updateMany({
      where: { id, ativo: true },
      data: {
        ativo: false,
        inativadoPorId: responsavelId,
        inativadoEm: agora,
        motivoInativacao: motivo.trim(),
      },
    });
    if (resultado.count !== 1) return null;
    return this.buscarPetPorId(id);
  }

  contarConsultasDoPet(petId: number): Promise<number> {
    return this.prisma.consulta.count({ where: { petId } });
  }

  contarAnexosDoPet(petId: number): Promise<number> {
    return this.prisma.anexoClinico.count({ where: { petId } });
  }

  /** Impede transferir o histórico clínico de um pet para outro tutor. */
  async petComHistorico(petId: number): Promise<boolean> {
    const [consultas, anexos, vacinas] = await Promise.all([
      this.contarConsultasDoPet(petId),
      this.contarAnexosDoPet(petId),
      this.prisma.registroVacina.count({ where: { petId } }),
    ]);
    return consultas > 0 || anexos > 0 || vacinas > 0;
  }

  async deletarPet(id: number): Promise<Pet> {
    const registro = await this.prisma.pet.delete({ where: { id }, select: selecaoPet });
    return paraPet(registro);
  }
}
