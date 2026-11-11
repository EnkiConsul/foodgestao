/**
 * Resumos e regras dos blocos da tela "Regras de Folgas" (sanfona por assunto).
 * A escolha de folgas pelo app e a troca entre colegas são decisões separadas:
 * desligar a escolha nunca desliga a troca (o servidor aplica a mesma regra).
 */
import type { DpConfigDp, TrocaFolgaModo } from "@/lib/dp/dsr-rules";

type CfgAutonomia = Pick<
  DpConfigDp,
  | "folga_marcacao_portal"
  | "folga_janela_ativa"
  | "folga_janela_abre_dia"
  | "folga_janela_fecha_dia"
  | "troca_folga_modo"
>;

/** O colaborador pode propor troca de folga com um colega pelo app? Só a regra de troca decide. */
export function trocaLiberadaNoPortal(cfg: Pick<DpConfigDp, "troca_folga_modo">): boolean {
  return cfg.troca_folga_modo !== "proibida";
}

/**
 * Erro do período mensal de escolha. Só vale quando o colaborador escolhe folgas no app:
 * com a escala definida pela gerência os campos ficam ocultos e não podem travar o salvamento.
 */
export function erroPeriodoEscolha(cfg: CfgAutonomia): string | null {
  if (!cfg.folga_marcacao_portal || !cfg.folga_janela_ativa) return null;
  if (cfg.folga_janela_fecha_dia < cfg.folga_janela_abre_dia) {
    return "O dia de encerramento precisa ser igual ou depois do dia de abertura.";
  }
  return null;
}

const TROCA_CURTA: Record<TrocaFolgaModo, string> = {
  direta: "Troca direta entre colegas",
  aprovacao_admin: "Troca com aprovação do gestor",
  proibida: "Troca desativada",
};

/** Linha de resumo do bloco "Autonomia no aplicativo". */
export function resumoAutonomia(cfg: CfgAutonomia): string {
  const escolha = !cfg.folga_marcacao_portal
    ? "Escala definida pela gerência"
    : cfg.folga_janela_ativa
      ? `Escolha no app do dia ${cfg.folga_janela_abre_dia} ao ${cfg.folga_janela_fecha_dia}`
      : "Escolha livre no app";
  return `${escolha} · ${TROCA_CURTA[cfg.troca_folga_modo] ?? TROCA_CURTA.aprovacao_admin}`;
}

const BASE_CURTA = { clt: "CLT", cct: "Convenção coletiva", propria: "Política própria" } as const;

const semanasTexto = (n: number) => {
  if (!Number.isFinite(n) || n <= 0) return "sem exigência";
  const v = Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
  return `a cada ${v} sem.`;
};

/** Linha de resumo do bloco "Domingos e base legal". */
export function resumoDomingos(
  base: keyof typeof BASE_CURTA,
  semanas: { geral: number; mulher: number },
): string {
  return `${BASE_CURTA[base]} · Homens ${semanasTexto(semanas.geral)} · Mulheres ${semanasTexto(semanas.mulher)}`;
}

/** Linha de resumo do bloco "Travas da escala". */
export function resumoTravas(regras: { ativo: boolean }[]): string {
  const ativas = regras.filter((r) => r.ativo).length;
  if (ativas === 0) return regras.length ? "Nenhuma trava ativa" : "Nenhuma trava cadastrada";
  return ativas === 1 ? "1 trava ativa" : `${ativas} travas ativas`;
}
