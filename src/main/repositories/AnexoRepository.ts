import type { Prisma } from '@prisma/client';
import { LIMITE_LISTAGEM_ANEXOS } from '../../shared/constants';
import type { CategoriaAnexo, VeterinarioResumo } from '../../shared/types';
import { ehCategoriaAnexo, exigir } from '../../shared/validators';
import { Database } from '../database/PrismaClient';

/** Projeção única: nunca traz e-mail, senha, papel alheio ou caminhos do disco. */
const selecaoAnexo = {
  id: true,
  petId: true,
  consultaId: true,
  responsavelId: true,
  descricao: true,
  categoria: true,
  dataDocumento: true,
  nomeOriginal: true,
  nomeArquivoGerado: true,
  mimeType: true,
  tamanhoBytes: true,
  checksumSha256: true,
  registradoPorId: true,
  registradoEm: true,
  atualizadoEm: true,
  inativo: true,
  inativadoPorId: true,
  inativadoEm: true,
  motivoInativacao: true,
  responsavel: { select: { id: true, nome: true, crmv: true } },
} satisfies Prisma.AnexoClinicoSelect;

const selecaoConsultaVinculada = {
  id: true,
  petId: true,
  veterinarioId: true,
  status: true,
} satisfies Prisma.ConsultaSelect;

type RegistroAnexoBanco = Prisma.AnexoClinicoGetPayload<{ select: typeof selecaoAnexo }>;

/** Espelho persistido do contrato: datas civis e instantes ainda como `Date`. */
export interface AnexoPersistido {
  id: number;
  petId: number;
  consultaId: number | null;
  responsavelId: number;
  descricao: string;
  categoria: CategoriaAnexo;
  dataDocumento: Date;
  nomeOriginal: string;
  nomeArquivoGerado: string;
  mimeType: string;
  tamanhoBytes: number;
  checksumSha256: string;
  registradoPorId: number;
  registradoEm: Date;
  atualizadoEm: Date;
  inativo: boolean;
  inativadoPorId: number | null;
  inativadoEm: Date | null;
  motivoInativacao: string | null;
  responsavel: { id: number; nome: string; crmv: string | null };
}

export interface ResumoConsultaVinculada {
  id: number;
  petId: number;
  veterinarioId: number;
  status: string;
}

/** Dados já validados e normalizados pelo domínio; este módulo formata para o banco. */
export interface DadosCriacaoAnexo {
  petId: number;
  consultaId: number | null;
  responsavelId: number;
  descricao: string;
  categoria: CategoriaAnexo;
  dataDocumento: string;
  nomeOriginal: string;
  nomeArquivoGerado: string;
  mimeType: string;
  tamanhoBytes: number;
  checksumSha256: string;
  registradoPorId: number;
  registradoEm: Date;
}

/** Porta de persistência: o service não conhece Prisma nem Electron. */
export interface AnexoRepositorio {
  listarPorPet(petId: number, responsavelId?: number): Promise<AnexoPersistido[]>;
  criar(dados: DadosCriacaoAnexo): Promise<AnexoPersistido>;
  buscarPorId(id: number): Promise<AnexoPersistido | null>;
  inativar(
    id: number,
    inativadoPorId: number,
    inativadoEm: Date,
    motivo: string
  ): Promise<AnexoPersistido>;
  petExiste(id: number): Promise<boolean>;
  buscarVeterinarioAtivo(id: number): Promise<VeterinarioResumo | null>;
  buscarConsulta(id: number): Promise<ResumoConsultaVinculada | null>;
}

/** O banco guarda `categoria` como texto; a fronteira garante o contrato tipado. */
function paraPersistido(registro: RegistroAnexoBanco): AnexoPersistido {
  return {
    ...registro,
    categoria: exigir(registro.categoria, ehCategoriaAnexo, 'Categoria de anexo inválida.'),
  };
}

/** `@db.Date` é uma data civil: ancorá-la em UTC evita deslocamento por fuso. */
function dataCivil(valor: string): Date {
  return new Date(`${valor}T00:00:00.000Z`);
}

export class AnexoRepository implements AnexoRepositorio {
  private prisma = Database.getInstance();

  async listarPorPet(petId: number, responsavelId?: number): Promise<AnexoPersistido[]> {
    const where: Prisma.AnexoClinicoWhereInput = {
      petId,
      inativo: false,
      ...(responsavelId !== undefined ? { responsavelId } : {}),
    };
    const registros = await this.prisma.anexoClinico.findMany({
      where,
      select: selecaoAnexo,
      orderBy: [{ registradoEm: 'desc' }, { id: 'desc' }],
      take: LIMITE_LISTAGEM_ANEXOS,
    });
    return registros.map(paraPersistido);
  }

  async criar(dados: DadosCriacaoAnexo): Promise<AnexoPersistido> {
    const registro = await this.prisma.anexoClinico.create({
      data: {
        petId: dados.petId,
        consultaId: dados.consultaId,
        responsavelId: dados.responsavelId,
        descricao: dados.descricao,
        categoria: dados.categoria,
        dataDocumento: dataCivil(dados.dataDocumento),
        nomeOriginal: dados.nomeOriginal,
        nomeArquivoGerado: dados.nomeArquivoGerado,
        mimeType: dados.mimeType,
        tamanhoBytes: dados.tamanhoBytes,
        checksumSha256: dados.checksumSha256,
        registradoPorId: dados.registradoPorId,
        registradoEm: dados.registradoEm,
        inativo: false,
      },
      select: selecaoAnexo,
    });
    return paraPersistido(registro);
  }

  async buscarPorId(id: number): Promise<AnexoPersistido | null> {
    const registro = await this.prisma.anexoClinico.findUnique({
      where: { id },
      select: selecaoAnexo,
    });
    return registro === null ? null : paraPersistido(registro);
  }

  async inativar(
    id: number,
    inativadoPorId: number,
    inativadoEm: Date,
    motivo: string
  ): Promise<AnexoPersistido> {
    const registro = await this.prisma.anexoClinico.update({
      where: { id },
      data: {
        inativo: true,
        inativadoPorId,
        inativadoEm,
        motivoInativacao: motivo,
      },
      select: selecaoAnexo,
    });
    return paraPersistido(registro);
  }

  async petExiste(id: number): Promise<boolean> {
    return (await this.prisma.pet.count({ where: { id } })) > 0;
  }

  buscarVeterinarioAtivo(id: number): Promise<VeterinarioResumo | null> {
    return this.prisma.usuario.findFirst({
      where: { id, role: 'VETERINARIO', ativo: true },
      select: { id: true, nome: true, crmv: true },
    });
  }

  buscarConsulta(id: number): Promise<ResumoConsultaVinculada | null> {
    return this.prisma.consulta.findUnique({
      where: { id },
      select: selecaoConsultaVinculada,
    });
  }
}
