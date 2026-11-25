import type { Prisma } from '@prisma/client';
import { Database } from '../database/PrismaClient';

/** Projeção mínima necessária ao aviso: nunca traz prontuário ou senha. */
const selecaoAlerta = {
  id: true,
  petId: true,
  veterinarioId: true,
  vacina: true,
  dose: true,
  proximaDose: true,
  ultimoAvisoEm: true,
  ultimoAvisoProximaDose: true,
  pet: {
    select: {
      nome: true,
      cliente: { select: { nome: true, email: true } },
    },
  },
} satisfies Prisma.RegistroVacinaSelect;

type RegistroAlerta = Prisma.RegistroVacinaGetPayload<{ select: typeof selecaoAlerta }>;

export interface RegistroAlertaVacina {
  id: number;
  petId: number;
  veterinarioId: number;
  petNome: string;
  tutorNome: string;
  tutorEmail: string | null;
  vacina: string;
  dose: string;
  proximaDose: Date;
  ultimoAvisoEm: Date | null;
  ultimoAvisoProximaDose: Date | null;
}

/** Porta de persistência dos alertas de vacina; o service não conhece Prisma. */
export interface AlertaVacinaRepositorio {
  listar(veterinarioId?: number): Promise<RegistroAlertaVacina[]>;
  marcarAvisoEnviado(id: number, proximaDose: Date, agora: Date): Promise<boolean>;
}

function paraRegistroAlerta(registro: RegistroAlerta): RegistroAlertaVacina | null {
  if (registro.proximaDose === null) return null;
  return {
    id: registro.id,
    petId: registro.petId,
    veterinarioId: registro.veterinarioId,
    petNome: registro.pet.nome,
    tutorNome: registro.pet.cliente.nome,
    tutorEmail: registro.pet.cliente.email,
    vacina: registro.vacina,
    dose: registro.dose,
    proximaDose: registro.proximaDose,
    ultimoAvisoEm: registro.ultimoAvisoEm,
    ultimoAvisoProximaDose: registro.ultimoAvisoProximaDose,
  };
}

export class AlertaVacinaRepository implements AlertaVacinaRepositorio {
  private prisma = Database.getInstance();

  listar(veterinarioId?: number): Promise<RegistroAlertaVacina[]> {
    const where: Prisma.RegistroVacinaWhereInput = {
      estornado: false,
      proximaDose: { not: null },
      ...(veterinarioId === undefined ? {} : { veterinarioId }),
    };

    return this.prisma.registroVacina
      .findMany({
        where,
        select: selecaoAlerta,
        orderBy: [{ proximaDose: 'asc' }, { id: 'asc' }],
      })
      .then((registros) => {
        console.log('[Vacinas] Query Prisma:', JSON.stringify(where), 'registros:', registros.length);
        return registros.flatMap((registro) => {
          const alerta = paraRegistroAlerta(registro);
          return alerta === null ? [] : [alerta];
        });
      });
  }

  async marcarAvisoEnviado(id: number, proximaDose: Date, agora: Date): Promise<boolean> {
    // O guarda evita que duas chamadas simultâneas reenviem para a mesma dose.
    const resultado = await this.prisma.registroVacina.updateMany({
      where: {
        id,
        OR: [{ ultimoAvisoProximaDose: null }, { ultimoAvisoProximaDose: { not: proximaDose } }],
      },
      data: {
        ultimoAvisoEm: agora,
        ultimoAvisoProximaDose: proximaDose,
      },
    });
    return resultado.count > 0;
  }
}
