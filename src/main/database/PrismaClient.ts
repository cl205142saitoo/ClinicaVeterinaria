import { PrismaClient } from '@prisma/client';
import { ErroAplicacao } from '../../shared/errors';

export class Database {
  private static instance: PrismaClient | null = null;

  public static getInstance(): PrismaClient {
    if (!Database.instance) {
      if (!process.env.DATABASE_URL) {
        throw new ErroAplicacao(
          'Banco de dados não configurado. Crie o arquivo .env na raiz do projeto com DATABASE_URL e reinicie o aplicativo.'
        );
      }
      Database.instance = new PrismaClient();
    }
    return Database.instance;
  }
}
