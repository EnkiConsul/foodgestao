// Public lead capture for the marketing site.
// Validates + rate limits by IP hash, then inserts with the service role.
// Leads are never readable by anon/authenticated (only super admins via RLS).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const BUSINESS_TYPES = [
  "bar",
  "restaurante",
  "lanchonete",
  "cafeteria",
  "pizzaria",
  "rede",
  "dark_kitchen",
  "buffet",
  "outro",
];
const INTERESTS = ["financeiro", "dp", "ambos"];

function clean(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, max) : "";
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Requisição inválida" }, 400);
  }

  // Honeypot — silently accept, never store.
  if (clean(payload.website, 200)) return json({ ok: true });

  const name = clean(payload.name, 120);
  const email = clean(payload.email, 160).toLowerCase();
  const whatsapp = clean(payload.whatsapp, 24);
  const consent = payload.consent === true;
  const errors: Record<string, string> = {};

  if (name.length < 3) errors.name = "Informe seu nome completo.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.email = "Informe um e-mail válido.";
  if (whatsapp.replace(/\D/g, "").length < 10) errors.whatsapp = "Informe o WhatsApp com DDD.";
  if (!consent) errors.consent = "É necessário aceitar a Política de Privacidade.";

  const businessType = clean(payload.business_type, 40);
  if (businessType && !BUSINESS_TYPES.includes(businessType)) errors.business_type = "Tipo inválido.";
  const interest = clean(payload.interest, 20);
  if (interest && !INTERESTS.includes(interest)) errors.interest = "Solução inválida.";

  if (Object.keys(errors).length > 0) return json({ error: "Dados inválidos", errors }, 400);

  const toInt = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= 999 ? Math.trunc(n) : null;
  };

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";
  const ipHash = await sha256(`mkt-lead:${ip}`);

  // Rate limit: max 5 submissions per IP per hour.
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("mkt_leads")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", since);

  if ((count ?? 0) >= 5) {
    return json({ error: "Muitas solicitações. Tente novamente mais tarde." }, 429);
  }

  const utmRaw = (payload.utm ?? {}) as Record<string, unknown>;
  const utm: Record<string, string> = {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid", "referrer"]) {
    const v = clean(utmRaw[k], 200);
    if (v) utm[k] = v;
  }

  const { error } = await supabase.from("mkt_leads").insert({
    name,
    email,
    whatsapp,
    company_name: clean(payload.company_name, 160) || null,
    cnpj_count: toInt(payload.cnpj_count),
    unit_count: toInt(payload.unit_count),
    business_type: businessType || null,
    interest: interest || null,
    headcount_range: clean(payload.headcount_range, 40) || null,
    message: clean(payload.message, 2000) || null,
    consent,
    source_page: clean(payload.source_page, 200) || null,
    utm,
    ip_hash: ipHash,
  });

  if (error) {
    console.error("mkt-lead insert error", error.message);
    return json({ error: "Não foi possível registrar seu contato agora." }, 500);
  }

  return json({ ok: true });
});
