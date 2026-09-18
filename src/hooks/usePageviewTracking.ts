/**
 * Visualizações de página — DESATIVADAS (AUD-021).
 *
 * Nenhum SDK de Google Analytics ou pixel da Meta é carregado no aplicativo,
 * então este hook não reporta nada e não guarda fila para reenvio. Fica como
 * no-op para que as telas e o roteador continuem iguais.
 *
 * Ver docs/security/metricas-marketing-desativadas.md.
 */
export function usePageviewTracking(): void {
  // Desativado de propósito: sem efeito, sem leitura de URL, sem fila.
  return;
}
