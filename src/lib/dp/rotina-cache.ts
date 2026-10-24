import type { QueryClient } from "@tanstack/react-query";

/** Refresh both official operation views after a decision, never just the request list. */
export function invalidarRotina(qc: QueryClient) {
  return Promise.all([
    "dp_panorama_base", "dp_meu_rotina_loja", "dp_meu_rotina_dia_panel",
    "dp_portal_equipe_fora_dia", "dp_minha_situacao_dia", "dp_folgas",
    "dp_folgas_efetivadas", "dp_dia_trabalho_excepcional_panorama",
  ].map((key) => qc.invalidateQueries({ queryKey: [key] })));
}