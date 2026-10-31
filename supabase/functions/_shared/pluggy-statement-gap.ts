// Regras puras da conferência de extrato (saldo x lançamentos).

/** Diferença abaixo disso (rendimento de centavos, arredondamento) não é lacuna. */
export const GAP_TOLERANCE = 1.0;
/** Só após N detecções seguidas na mesma conta sugerimos reconectar. */
export const GAP_RECONNECT_AFTER = 3;

/** Lançamento ainda não compensado pelo banco: não entra no staging nem na soma. */
export function isPendingTx(t: { status?: string | null } | null | undefined): boolean {
  return String(t?.status ?? '').toUpperCase() === 'PENDING';
}

/** Arredonda e aplica a tolerância; null = sem lacuna. */
export function gapAfterTolerance(diferenca: number): number | null {
  const d = Math.round(diferenca * 100) / 100;
  return Math.abs(d) < GAP_TOLERANCE ? null : d;
}

/** Contador de detecções consecutivas: sobe com lacuna, zera quando some. */
export function nextGapChecks(prev: number | null | undefined, hasGap: boolean): number {
  return hasGap ? Math.max(0, Number(prev ?? 0)) + 1 : 0;
}

export function shouldSuggestReconnect(checks: number | null | undefined): boolean {
  return Number(checks ?? 0) >= GAP_RECONNECT_AFTER;
}

export function gapMessage(nome: string, diferenca: number, de: string, ate: string, checks: number): string {
  const valor = Math.abs(diferenca).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const br = (s: string) => s.split('-').reverse().join('/');
  const base = `O banco atualizou o saldo de ${nome} mas ainda não entregou todos os lançamentos: faltam R$ ${valor} entre ${br(de)} e ${br(ate)}.`;
  return shouldSuggestReconnect(checks)
    ? `${base} A diferença persiste após ${checks} verificações; importe o extrato ou, em último caso, reconecte o banco.`
    : `${base} Use "Sincronizar novamente"; o sistema também segue buscando automaticamente.`;
}
