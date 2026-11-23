/** Conversões de valor usadas antes de cruzar a ponte IPC. */

/** DECIMAL(10,2) e cálculos monetários sempre com duas casas decimais. */
export function arredondar2(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

/** Texto amigável para o motivo da auditoria de preço. */
export function formatarBrl(valor: number): string {
  return `R$ ${arredondar2(valor).toFixed(2).replace('.', ',')}`;
}
