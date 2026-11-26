import nodemailer, { type SendMailOptions, type SentMessageInfo } from 'nodemailer';
import { SMTP_ASSUNTO_PREFIXO, VACINA_ALERTA_DIAS } from '../../shared/constants';
import { carregarEnv } from '../config/carregarEnv';
import { dataCivilClinica, formatarDataCivil } from '../../shared/datas';
import { ErroAplicacao } from '../../shared/errors';
import type { AlertaVacina, ResultadoEnvioAvisos, Usuario } from '../../shared/types';
import { ehEmail } from '../../shared/validators';
import type { AlertaVacinaRepositorio } from '../repositories/AlertaVacinaRepository';

const CHAVES_SMTP = [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_FROM',
  'PHD_CLAREZA_EMAIL',
] as const;

const TIMEOUT_SMTP_MS = 10_000;

export interface ConfiguracaoSmtp {
  host: string;
  port: number;
  usuario?: string;
  senha?: string;
  remetente: string;
  copia?: string;
}

export interface TransportadorAvisos {
  sendMail(opcoes: SendMailOptions): Promise<SentMessageInfo>;
}

function criarTransportador(config: ConfiguracaoSmtp): TransportadorAvisos {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    ...(config.usuario && config.senha
      ? { auth: { user: config.usuario, pass: config.senha } }
      : {}),
    connectionTimeout: TIMEOUT_SMTP_MS,
    greetingTimeout: TIMEOUT_SMTP_MS,
    socketTimeout: TIMEOUT_SMTP_MS,
  });
}

/** Lê o `.env` também quando a service é usada fora do processo principal. */
export function lerConfiguracaoSmtp(): ConfiguracaoSmtp | null {
  carregarEnv([...CHAVES_SMTP]);
  const host = process.env.SMTP_HOST?.trim() ?? '';
  const remetente = process.env.SMTP_FROM?.trim() ?? '';
  const portaTexto = process.env.SMTP_PORT?.trim() ?? '';
  const porta = portaTexto === '' ? 587 : Number(portaTexto);
  if (
    host === '' ||
    remetente === '' ||
    !Number.isInteger(porta) ||
    porta <= 0 ||
    porta > 65535
  ) {
    const faltantes: string[] = [];
    if (host === '') faltantes.push('SMTP_HOST');
    if (remetente === '') faltantes.push('SMTP_FROM');
    if (portaTexto !== '' && (!Number.isInteger(porta) || porta <= 0 || porta > 65535)) {
      faltantes.push('SMTP_PORT (inválida)');
    }
    console.warn(
      `[Vacinas] SMTP não configurado. Variáveis ausentes/inválidas: ${
        faltantes.join(', ') || 'nenhuma detectada'
      }`
    );
    return null;
  }

  const copia = process.env.PHD_CLAREZA_EMAIL?.trim() ?? '';
  return {
    host,
    port: porta,
    usuario: process.env.SMTP_USER?.trim() || undefined,
    senha: process.env.SMTP_PASS || undefined,
    remetente,
    copia: copia !== '' && ehEmail(copia) ? copia : undefined,
  };
}

/** `@db.Date` é gravado ancorado em UTC; o ISO preserva o dia civil. */
function diaCivilBanco(data: Date): string {
  return data.toISOString().slice(0, 10);
}

function diasAte(proximaDose: string, hoje: string): number {
  return Math.round(
    (Date.parse(`${proximaDose}T00:00:00.000Z`) - Date.parse(`${hoje}T00:00:00.000Z`)) /
      86_400_000
  );
}

function jaAvisadoNoDia(alerta: AlertaVacina, hoje: string): boolean {
  if (alerta.ultimoAvisoEm === null || alerta.ultimoAvisoProximaDose === null) return false;
  return (
    alerta.ultimoAvisoProximaDose === alerta.proximaDose &&
    dataCivilClinica(new Date(alerta.ultimoAvisoEm)) === hoje
  );
}

function mensagemEmail(alerta: AlertaVacina): string {
  const when =
    alerta.diasParaProximaDose < 0
      ? `está atrasada há ${Math.abs(alerta.diasParaProximaDose)} dia(s)`
      : alerta.diasParaProximaDose === 0
        ? 'vence hoje'
        : `vence em ${alerta.diasParaProximaDose} dia(s)`;
  return [
    `Olá, ${alerta.tutorNome}!`,
    '',
    `A próxima dose da vacina ${alerta.vacina} (${alerta.dose}) do pet ${alerta.petNome} ${when}.`,
    `Data informada pela clínica: ${formatarDataCivil(alerta.proximaDose)}.`,
    '',
    'Entre em contato para agendar a aplicação.',
    '',
    'Equipe PetHealthPD',
  ].join('\r\n');
}

/**
 * Alertas de vacina e avisos ao tutor. Dados clínicos nunca chegam a ATENDENTE.
 */
export class AlertaVacinaService {
  constructor(
    private readonly repo: AlertaVacinaRepositorio,
    private readonly agora: () => Date = () => new Date(),
    private readonly criarTransporte: (config: ConfiguracaoSmtp) => TransportadorAvisos =
      criarTransportador
  ) {}

  /** ADMIN vê todos; VETERINARIO somente os registros pelos quais é responsável. */
  async listarAlertas(usuario: Usuario): Promise<AlertaVacina[]> {
    const veterinarioId = this.perfilVisivel(usuario);
    const hoje = dataCivilClinica(this.agora());
    const registros = await this.repo.listar(veterinarioId);
    console.log('[Vacinas] listarAlertas:', {
      hoje,
      veterinarioId: veterinarioId ?? 'TODOS',
      limiteDias: VACINA_ALERTA_DIAS,
      registrosDoRepositorio: registros.length,
    });

    return registros.flatMap((registro) => {
      const proximaDose = diaCivilBanco(registro.proximaDose);
      const diasParaProximaDose = diasAte(proximaDose, hoje);
      const descartadoPorData = diasParaProximaDose > VACINA_ALERTA_DIAS;
      console.log(
        `[Vacinas] ${descartadoPorData ? 'DESCARTADO_POR_DATA' : 'INCLUIDO'} registro=${registro.id}` +
          ` pet="${registro.petNome}" tutorEmail=${JSON.stringify(registro.tutorEmail)}` +
          ` proximaDose=${proximaDose} hoje=${hoje}` +
          ` dias=${diasParaProximaDose} limite=${VACINA_ALERTA_DIAS}`
      );
      if (descartadoPorData) return [];

      const alerta: AlertaVacina = {
        registroVacinaId: registro.id,
        petId: registro.petId,
        petNome: registro.petNome,
        tutorNome: registro.tutorNome,
        tutorEmail: registro.tutorEmail,
        vacina: registro.vacina,
        dose: registro.dose,
        proximaDose,
        diasParaProximaDose,
        nivel: diasParaProximaDose < 0 ? 'VENCIDA' : 'PROXIMA',
        ultimoAvisoEm:
          registro.ultimoAvisoEm === null ? null : registro.ultimoAvisoEm.toISOString(),
        ultimoAvisoProximaDose:
          registro.ultimoAvisoProximaDose === null
            ? null
            : diaCivilBanco(registro.ultimoAvisoProximaDose),
      };
      return [alerta];
    });
  }

  async enviarAvisos(usuario: Usuario): Promise<ResultadoEnvioAvisos> {
    const alertas = await this.listarAlertas(usuario);
    const hoje = dataCivilClinica(this.agora());
    console.log('[Vacinas] enviarAvisos:', { alertas: alertas.length, hoje });

    const semEmail: AlertaVacina[] = [];
    const jaAvisados: AlertaVacina[] = [];
    const candidatos: AlertaVacina[] = [];
    for (const alerta of alertas) {
      const emailValido = ehEmail(alerta.tutorEmail);
      const jaAvisado = emailValido ? jaAvisadoNoDia(alerta, hoje) : false;
      const destino = !emailValido ? 'SEM_EMAIL' : jaAvisado ? 'JA_AVISADO_HOJE' : 'CANDIDATO';
      console.log(
        `[Vacinas] ${destino} registro=${alerta.registroVacinaId}` +
          ` pet="${alerta.petNome}" tutorEmail=${JSON.stringify(alerta.tutorEmail)}` +
          ` emailValido=${emailValido} ultimoAvisoEm=${JSON.stringify(alerta.ultimoAvisoEm)}` +
          ` ultimoAvisoProximaDose=${JSON.stringify(alerta.ultimoAvisoProximaDose)}` +
          ` proximaDose=${alerta.proximaDose} hoje=${hoje} jaAvisadoNoDia=${jaAvisado}`
      );
      if (!emailValido) {
        semEmail.push(alerta);
      } else if (jaAvisado) {
        jaAvisados.push(alerta);
      } else {
        candidatos.push(alerta);
      }
    }

    const mensagens: string[] = [];
    const ignorados = semEmail.length + jaAvisados.length;
    const config = lerConfiguracaoSmtp();
    if (config === null) {
      return {
        destinatarios: alertas.length,
        enviados: 0,
        ignorados,
        falhas: candidatos.length > 0 ? candidatos.length : 1,
        mensagens: [
          'Envio de e-mail não configurado. Defina SMTP_HOST, SMTP_PORT e SMTP_FROM no arquivo .env e reinicie o aplicativo.',
          ...mensagens,
        ],
      };
    }
    console.log('[Vacinas] Configuração SMTP:', {
      host: config.host,
      port: config.port,
      remetente: config.remetente,
      usuarioConfigurado: Boolean(config.usuario),
      senhaConfigurada: Boolean(config.senha),
      copiaValida: Boolean(config.copia),
    });

    let transportador: TransportadorAvisos;
    try {
      transportador = this.criarTransporte(config);
    } catch (erro) {
      console.error('[Vacinas] Falha ao preparar o SMTP:', erro);
      return {
        destinatarios: alertas.length,
        enviados: 0,
        ignorados,
        falhas: candidatos.length > 0 ? candidatos.length : 1,
        mensagens: ['Não foi possível iniciar a conexão com o servidor de e-mail. Verifique a configuração SMTP.'],
      };
    }

    let enviados = 0;
    let falhas = 0;
    for (const alerta of candidatos) {
      const opcoes: SendMailOptions = {
        from: config.remetente,
        to: alerta.tutorEmail ?? undefined,
        ...(config.copia ? { bcc: config.copia } : {}),
        subject: `${SMTP_ASSUNTO_PREFIXO} Aviso de vacina — ${alerta.petNome}`,
        text: mensagemEmail(alerta),
      };
      try {
        const info = await transportador.sendMail(opcoes);
        const linkEthereal = nodemailer.getTestMessageUrl(info);
        if (linkEthereal) {
          console.log('[Vacinas] Link do E-mail no Ethereal: ' + linkEthereal);
        }
        const proximaDose = new Date(`${alerta.proximaDose}T00:00:00.000Z`);
        const registrado = await this.repo.marcarAvisoEnviado(
          alerta.registroVacinaId,
          proximaDose,
          this.agora()
        );
        if (!registrado) {
          // Outra chamada já registrou a mesma dose; não reenviamos na próxima execução.
          mensagens.push(`Aviso de ${alerta.petNome} já havia sido registrado nesta dose.`);
        }
        console.log(
          `[Vacinas] ENVIADO registro=${alerta.registroVacinaId}` +
            ` para=${alerta.tutorEmail} marcadoNoBanco=${registrado}`
        );
        enviados += 1;
      } catch (erro) {
        falhas += 1;
        console.error(`[Vacinas] Falha ao enviar aviso do registro ${alerta.registroVacinaId}:`, erro);
        mensagens.push(`Não foi possível enviar o aviso de ${alerta.petNome}.`);
      }
    }

    if (semEmail.length > 0) {
      mensagens.push(`${semEmail.length} alerta(s) sem e-mail válido do tutor não foram enviados.`);
    }
    if (jaAvisados.length > 0) {
      mensagens.push(`${jaAvisados.length} aviso(s) já enviados hoje para a mesma próxima dose.`);
    }
    mensagens.push(`Avisos enviados: ${enviados}. Falhas: ${falhas}.`);
    console.log('[Vacinas] Resultado:', {
      destinatarios: alertas.length,
      semEmail: semEmail.length,
      jaAvisados: jaAvisados.length,
      candidatos: candidatos.length,
      enviados,
      falhas,
    });

    return {
      destinatarios: alertas.length,
      enviados,
      ignorados,
      falhas,
      mensagens,
    };
  }

  /** ATENDENTE não acessa nem metadados de vacinação. */
  private perfilVisivel(usuario: Usuario): number | undefined {
    if (usuario.role === 'ADMIN') return undefined;
    if (usuario.role === 'VETERINARIO') return usuario.id;
    if (usuario.role === 'ATENDENTE') {
      throw new ErroAplicacao(
        'Avisos de vacinação são restritos a veterinários e administradores. Procure um deles para consultar os alertas.'
      );
    }
    throw new ErroAplicacao('Perfil de acesso inválido. Procure o administrador.');
  }
}
