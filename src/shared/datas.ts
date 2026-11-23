/** Datas civis no fuso de referência da clínica (Brasil, sem horário de verão). */

export const FUSO_CLINICA = 'America/Sao_Paulo';

const formatadorCivil = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO_CLINICA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Converte um instante para a data civil `YYYY-MM-DD` da clínica.
 *
 * Não usar `toISOString().slice(0, 10)` para este fim: após as 21h no fuso de
 * São Paulo o ISO já pertence ao dia seguinte em UTC.
 */
export function dataCivilClinica(data: Date): string {
  const partes = formatadorCivil.formatToParts(data);
  const ano = partes.find((parte) => parte.type === 'year')?.value ?? '';
  const mes = partes.find((parte) => parte.type === 'month')?.value ?? '';
  const dia = partes.find((parte) => parte.type === 'day')?.value ?? '';
  return `${ano}-${mes}-${dia}`;
}

/** Formata `YYYY-MM-DD` para `DD/MM/YYYY` sem converter fuso (data civil). */
export function formatarDataCivil(valor: string | null): string {
  if (!valor) return '—';
  const [ano, mes, dia] = valor.split('-');
  return `${dia}/${mes}/${ano}`;
}
