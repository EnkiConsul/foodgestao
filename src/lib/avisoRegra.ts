import { ehRegraNegada } from "@/lib/dp/regraAviso";
import { mensagemErroFranquia } from "@/lib/billing/franquia";
import { mensagemRegraServidor } from "@/lib/dp/regraServidor";

/**
 * Recusa esperada (regra de negócio) x falha do sistema.
 *
 * Só reconhece avisos por classe `RegraNegada` ou por token de domínio do
 * servidor (franquia `EXCEDENTE_*`, folga/troca `TROCA_*`/`FOLGA_*`) — nunca por
 * frase solta, para não esconder defeito real da Auditoria de erros.
 * Devolve o texto que a pessoa deve ler, ou null quando é falha.
 */
export function avisoDeRegra(error: unknown): string | null {
  if (ehRegraNegada(error)) return (error as Error).message?.trim() || null;
  const texto = typeof error === "string" ? error : String((error as { message?: unknown } | null)?.message ?? "");
  const franquia = /\bEXCEDENTE_(CONFIRMACAO_NECESSARIA|SEM_PERMISSAO)\b/.test(texto) ? mensagemErroFranquia(texto) : null;
  if (franquia) return franquia;
  if (/^(TROCA_|FOLGA_)[A-Z_]+/.test(texto)) return mensagemRegraServidor(error);
  return null;
}
