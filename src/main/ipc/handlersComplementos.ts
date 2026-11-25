import { IPC_CHANNELS } from '../../shared/ipc-channels';
import type { FiltroRelatorio } from '../../shared/types';
import { exigir } from '../../shared/validators';
import type { AlertaVacinaService } from '../services/AlertaVacinaService';
import type { CotacaoService } from '../services/CotacaoService';
import { ehFiltroRelatorio } from '../services/RelatorioService';
import type { RelatorioService } from '../services/RelatorioService';
import { PolicyService } from '../services/PolicyService';
import type { SessaoService } from '../services/SessaoService';
import type { HandlerIpc } from './tipos';

type CanaisComplementos =
  | typeof IPC_CHANNELS.VACINAS_ALERTAS
  | typeof IPC_CHANNELS.VACINAS_ENVIAR_AVISOS
  | typeof IPC_CHANNELS.API_COTACAO_DOLAR
  | typeof IPC_CHANNELS.RELATORIOS_GERAR
  | typeof IPC_CHANNELS.RELATORIOS_EXPORTAR_CSV;

const MENSAGEM_PERIODO =
  'Informe um período válido para o relatório (data inicial e final no formato AAAA-MM-DD).';

export function criarHandlersComplementos(
  alertaVacinaService: AlertaVacinaService,
  cotacaoService: CotacaoService,
  relatorioService: RelatorioService,
  sessaoService: SessaoService,
  policy: PolicyService = new PolicyService(sessaoService)
): Record<CanaisComplementos, HandlerIpc> {
  return {
    [IPC_CHANNELS.VACINAS_ALERTAS]: async () => {
      const usuario = await policy.exigirAutenticadoVerificado();
      return alertaVacinaService.listarAlertas(usuario);
    },

    [IPC_CHANNELS.VACINAS_ENVIAR_AVISOS]: async () => {
      const usuario = await policy.exigirAutenticadoVerificado();
      return alertaVacinaService.enviarAvisos(usuario);
    },

    [IPC_CHANNELS.API_COTACAO_DOLAR]: async () => {
      await policy.exigirAutenticadoVerificado();
      return cotacaoService.obter();
    },

    [IPC_CHANNELS.RELATORIOS_GERAR]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      const filtro = exigir<FiltroRelatorio>(args[0], ehFiltroRelatorio, MENSAGEM_PERIODO);
      return relatorioService.gerar(filtro, usuario);
    },

    [IPC_CHANNELS.RELATORIOS_EXPORTAR_CSV]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      const filtro = exigir<FiltroRelatorio>(args[0], ehFiltroRelatorio, MENSAGEM_PERIODO);
      return relatorioService.exportarCsv(filtro, usuario);
    },
  };
}
