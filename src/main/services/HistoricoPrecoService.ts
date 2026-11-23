import { ErroAplicacao } from '../../shared/errors';
import type { HistoricoPreco, OrigemHistoricoPreco, Usuario } from '../../shared/types';
import { ehIdPositivo, ehOrigemHistoricoPreco, exigir } from '../../shared/validators';
import type {
  DadosRegistroHistoricoPreco,
  HistoricoPrecoRepositorio,
} from '../repositories/HistoricoPrecoRepository';
import { exigirLeituraFase2 } from './permissoesFase2';
import { formatarBrl } from './valoresFase2';

/** Motivo padronizado e legível, limitado ao VARCHAR(255) do banco. */
export function descreverAlteracaoPreco(
  origem: OrigemHistoricoPreco,
  identificador: string,
  anterior: number,
  novo: number
): string {
  const entidade = origem === 'PRODUTO' ? 'produto' : 'tabela de preço';
  return `Alteração de preço do ${entidade} ${identificador}: de ${formatarBrl(
    anterior
  )} para ${formatarBrl(novo)}.`;
}

export class HistoricoPrecoService {
  constructor(private readonly repo: HistoricoPrecoRepositorio) {}

  async listar(
    usuario: Usuario,
    origem?: OrigemHistoricoPreco,
    origemId?: number
  ): Promise<HistoricoPreco[]> {
    exigirLeituraFase2(usuario, 'histórico de preços');
    const origemValidada =
      origem === undefined
        ? undefined
        : exigir(origem, ehOrigemHistoricoPreco, 'Origem de histórico de preço inválida.');
    const idValidado =
      origemId === undefined
        ? undefined
        : exigir(origemId, ehIdPositivo, 'Informe um identificador válido para o filtro.');

    const registros = await this.repo.listar(origemValidada, idValidado);
    return registros.map((registro) => ({
      id: registro.id,
      origem: registro.origem as OrigemHistoricoPreco,
      origemId: registro.origemId,
      anterior: registro.anterior.toNumber(),
      novo: registro.novo.toNumber(),
      responsavelId: registro.responsavelId,
      responsavelNome: registro.responsavelNome,
      motivo: registro.motivo,
      criadoEm: registro.criadoEm.toISOString(),
    }));
  }

  /** Escrita interna: chamada pelos services de preços, nunca pelo renderer. */
  async registrar(dados: DadosRegistroHistoricoPreco): Promise<void> {
    const motivo = dados.motivo.trim();
    if (motivo.length < 3) {
      throw new ErroAplicacao('Informe um motivo claro para a alteração de preço.');
    }
    await this.repo.registrar({ ...dados, motivo: motivo.slice(0, 255) });
  }
}
