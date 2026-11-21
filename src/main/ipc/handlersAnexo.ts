import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { ErroAplicacao } from '../../shared/errors';
import {
  ehDadosAtualizacaoAnexo,
  ehDadosRegistroAnexo,
  ehIdPositivo,
  ehMotivoCancelamento,
  exigir,
} from '../../shared/validators';
import { AnexoArquivoService } from '../services/AnexoArquivoService';
import { AnexoService } from '../services/AnexoService';
import { PolicyService } from '../services/PolicyService';
import type { SessaoService } from '../services/SessaoService';
import type { HandlerIpc } from './tipos';

type CanaisAnexo =
  | typeof IPC_CHANNELS.ANEXOS_LISTAR_PET
  | typeof IPC_CHANNELS.ANEXOS_ESCOLHER_ARQUIVO
  | typeof IPC_CHANNELS.ANEXOS_REGISTRAR
  | typeof IPC_CHANNELS.ANEXOS_ABRIR
  | typeof IPC_CHANNELS.ANEXOS_INATIVAR
  | typeof IPC_CHANNELS.ANEXOS_CANCELAR
  | typeof IPC_CHANNELS.ANEXOS_ATUALIZAR;

function ehToken(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.trim().length > 0;
}

export function criarHandlersAnexo(
  anexoService: AnexoService,
  arquivoService: AnexoArquivoService,
  sessaoService: SessaoService,
  policy: PolicyService = new PolicyService(sessaoService)
): Record<CanaisAnexo, HandlerIpc> {
  return {
    [IPC_CHANNELS.ANEXOS_LISTAR_PET]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      policy.exigirAcessoAnexos(usuario);
      const petId = exigir(args[0], ehIdPositivo, 'Informe um pet válido.');
      return anexoService.listarPet(petId, usuario);
    },

    [IPC_CHANNELS.ANEXOS_ESCOLHER_ARQUIVO]: async () => {
      const usuario = await policy.exigirAutenticadoVerificado();
      policy.exigirAcessoAnexos(usuario);
      return arquivoService.escolher();
    },

    [IPC_CHANNELS.ANEXOS_REGISTRAR]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      // Autoridade antes de mover qualquer arquivo do staging.
      policy.exigirAcessoAnexos(usuario);
      const dados = exigir(
        args[0],
        ehDadosRegistroAnexo,
        'Dados do anexo inválidos. Confira os campos e tente novamente.'
      );
      if ((await arquivoService.obter(dados.token)) === null) {
        throw new ErroAplicacao('Selecione o arquivo novamente.');
      }

      const metadados = await arquivoService.confirmar(dados.token);
      try {
        return await anexoService.registrar(dados, usuario, metadados);
      } catch (erro) {
        try {
          await arquivoService.removerPorNome(metadados.nomeArquivoGerado);
        } catch (erroLimpeza) {
          console.error('[Anexos] Falha ao remover arquivo após falha no registro:', erroLimpeza);
        }
        throw erro;
      }
    },

    [IPC_CHANNELS.ANEXOS_ABRIR]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      policy.exigirAcessoAnexos(usuario);
      const id = exigir(args[0], ehIdPositivo, 'Informe um anexo válido.');
      const registro = await anexoService.buscarParaAbertura(id, usuario);
      return arquivoService.abrir(registro.nomeArquivoGerado);
    },

    [IPC_CHANNELS.ANEXOS_INATIVAR]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      policy.exigirAcessoAnexos(usuario);
      const id = exigir(args[0], ehIdPositivo, 'Informe um anexo válido.');
      const motivo = exigir(
        args[1],
        ehMotivoCancelamento,
        'Informe o motivo da inativação (de 3 a 500 caracteres).'
      );
      return anexoService.inativar(id, motivo, usuario);
    },

    [IPC_CHANNELS.ANEXOS_CANCELAR]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      policy.exigirAcessoAnexos(usuario);
      const token = exigir(args[0], ehToken, 'Informe o arquivo a ser cancelado.');
      return arquivoService.cancelar(token);
    },

    [IPC_CHANNELS.ANEXOS_ATUALIZAR]: async (args) => {
      const usuario = await policy.exigirAutenticadoVerificado();
      policy.exigirAcessoAnexos(usuario);
      const dados = exigir(
        args[0],
        ehDadosAtualizacaoAnexo,
        'Dados do anexo inválidos. Confira a descrição, a categoria e a data do documento.'
      );
      return anexoService.atualizarMetadados(dados, usuario);
    },
  };
}
