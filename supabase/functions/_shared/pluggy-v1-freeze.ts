// V1 freeze guard — when PLUGGY_V1_FROZEN=true, novos writes na stack V1 são rejeitados (503).
// Não bloqueia webhook/worker/materialize, pois eles ainda precisam processar itens ativos.

export function isPluggyV1Frozen(): boolean {
  const v = (Deno.env.get("PLUGGY_V1_FROZEN") ?? "").toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

export function pluggyV1FrozenResponse(corsHeaders: Record<string, string> = {}): Response {
  return new Response(
    JSON.stringify({
      error: "pluggy_v1_frozen",
      message:
        "Stack Pluggy V1 congelada. Use a integração V2 (feature flag pluggy_version='v2' na empresa).",
    }),
    {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}
