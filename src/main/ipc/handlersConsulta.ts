import { IPC_CHANNELS } from '../../shared/ipc-channels';
import {
  ehDadosAtualizacaoConsulta,
  ehDadosConsulta,
  ehDadosInativacao,
  ehFiltroAgenda,
  ehIdPositivo,
  ehMotivoCancelamento,
  exigir,
} from '../../shared/validators';
import { PolicyService } from '../services/PolicyService';
import type { ConsultaService } from '../services/ConsultaService';
import type { SessaoService } from '../services/SessaoService';
import type { HandlerIpc } from './tipos';

type CanaisConsulta =
  | typeof IPC_CHANNELS.CONSULTAS_LISTAR
  | typeof IPC_CHANNELS.CONSULTAS_CRIAR
  | typeof IPC_CHANNELS.CONSULTAS_CANCELAR
  | typeof IPC_CHANNELS.CONSULTAS_CONCLUIR
  | typeof IPC_CHANNELS.CONSULTAS_ATUALIZAR
  | typeof IPC_CHANNELS.CONSULTAS_EXCLUIR
  | typeof IPC_CHANNELS.VETERINARIOS_LISTAR;

export function criarHandlersConsulta(
  consultaService: ConsultaService,
  sessaoService: SessaoService,
  policy: PolicyService = new PolicyService(sessaoService)
): Record<CanaisConsulta, HandlerIpc> {
  return {
    [IPC_CHANNELS.CONSULTAS_LISTAR]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      policy.exigirPerfilConhecido(usuario);
      const filtro =
        args[0] === undefined
          ? {}
          : exigir(args[0], ehFiltroAgenda, 'Filtro de agenda inválido. Confira as datas.');
      return consultaService.listar(filtro, usuario);
    },

    [IPC_CHANNELS.CONSULTAS_CRIAR]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      policy.exigirPerfilConhecido(usuario);
      const dados = exigir(
        args[0],
        ehDadosConsulta,
        'Dados da consulta inválidos. Confira os campos e tente novamente.'
      );
      return consultaService.criar(dados, usuario);
    },

    [IPC_CHANNELS.CONSULTAS_CANCELAR]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      const id = exigir(args[0], ehIdPositivo, 'Informe uma consulta válida.');
      const motivo = exigir(
        args[1],
        ehMotivoCancelamento,
        'Informe o motivo do cancelamento (de 3 a 500 caracteres).'
      );
      return consultaService.cancelar(id, motivo, usuario);
    },

    [IPC_CHANNELS.CONSULTAS_CONCLUIR]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      const id = exigir(args[0], ehIdPositivo, 'Informe uma consulta válida.');
      return consultaService.concluir(id, usuario);
    },

    [IPC_CHANNELS.CONSULTAS_ATUALIZAR]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      const dados = exigir(
        args[0],
        ehDadosAtualizacaoConsulta,
        'Dados da consulta inválidos. Confira a data, o motivo e o veterinário.'
      );
      return consultaService.atualizar(dados, usuario);
    },

    [IPC_CHANNELS.CONSULTAS_EXCLUIR]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      const dados = exigir(
        args[0],
        ehDadosInativacao,
        'Informe a consulta e o motivo do cancelamento do registro (de 3 a 500 caracteres).'
      );
      return consultaService.cancelarRegistro(dados, usuario);
    },

    [IPC_CHANNELS.VETERINARIOS_LISTAR]: async () => {
      await policy.exigirAutenticadoVerificado();
      return consultaService.listarVeterinarios();
    },
  };
}
