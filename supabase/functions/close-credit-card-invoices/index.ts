// Fecha faturas de cartão de crédito diariamente.
//
// Toda a lógica ficou no banco: a RPC `close_credit_card_invoices` faz, por fatura,
// em uma única operação atômica: recalcula totais, fecha a fatura com o mínimo,
// cria/vincula a conta a pagar e abre a fatura do próximo ciclo.
// Erros em uma fatura não interrompem o lote e voltam no resumo.
//
// verify_jwt = false — protegido pelo header secreto (mesmo padrão de expire-trials).

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLOSE_SECRET = Deno.env.get("CLOSE_INVOICES_SECRET");

/** Comparação em tempo constante, sem vazar o tamanho do segredo. */
function secretMatches(provided: string | null, expected: string | undefined): boolean {
  if (!expected || !provided) return false;
  const a = new TextEncoder().encode(provided);
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!secretMatches(req.headers.get("x-close-secret"), CLOSE_SECRET)) {
    return json({ error: "unauthorized" }, 401);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc("close_credit_card_invoices", { _limit: 500 });

  if (error) {
    console.error("close_credit_card_invoices failed", error.message);
    return json({ error: error.message }, 500);
  }

  const row = (Array.isArray(data) ? data[0] : data) ?? {};
  const summary = {
    closed: Number(row.closed ?? 0),
    opened: Number(row.opened ?? 0),
    payables: Number(row.payables ?? 0),
    errors: row.errors ?? [],
  };

  if (Array.isArray(summary.errors) && summary.errors.length > 0) {
    console.error("close invoices partial errors", JSON.stringify(summary.errors));
  }

  return json({ ok: true, ...summary });
});
