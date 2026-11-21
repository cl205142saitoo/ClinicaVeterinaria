import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { ehAno, ehNomeMunicipio, exigir } from '../../shared/validators';
import type { IntegracoesService } from '../services/IntegracoesService';
import type { PolicyService } from '../services/PolicyService';
import type { HandlerIpc } from './tipos';

type CanaisIntegracoes =
  | typeof IPC_CHANNELS.API_IBGE_MUNICIPIO
  | typeof IPC_CHANNELS.API_FERIADOS_ANO
  | typeof IPC_CHANNELS.API_RESUMO_DASHBOARD;

function ehUf(valor: unknown): valor is string {
  return typeof valor === 'string' && /^[A-Za-z]{2}$/.test(valor.trim());
}

export function criarHandlersIntegracoes(
  integracoes: IntegracoesService,
  policy: PolicyService
): Record<CanaisIntegracoes, HandlerIpc> {
  return {
    [IPC_CHANNELS.API_IBGE_MUNICIPIO]: async (args) => {
      await policy.exigirAutenticadoVerificado();
      const nome = exigir(
        args[0],
        ehNomeMunicipio,
        'Informe o nome do município com pelo menos 2 caracteres.'
      );
      const uf = exigir(args[1], ehUf, 'Informe a UF com 2 letras.');
      return integracoes.buscarMunicipioIbge(nome, uf);
    },

    [IPC_CHANNELS.API_FERIADOS_ANO]: async (args) => {
      await policy.exigirAutenticadoVerificado();
      const ano = exigir(args[0], ehAno, 'Informe um ano entre 2020 e 2100.');
      return integracoes.listarFeriados(ano);
    },

    [IPC_CHANNELS.API_RESUMO_DASHBOARD]: async () => {
      await policy.exigirAutenticadoVerificado();
      return integracoes.resumoDashboard();
    },
  };
}
