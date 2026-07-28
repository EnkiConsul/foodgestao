// deno-lint-ignore-file no-explicit-any
// Pluggy V2 - Observabilidade / Alertas (Fase 9)
//
// Consulta o snapshot SLO (pluggy_v2_slo_snapshot) e materializa alertas em
// public.pluggy_v2_alerts. Cada alerta é deduplicado enquanto permanecer aberto
// (resolved_at IS NULL) e é auto-resolvido quando o valor volta abaixo do limiar.
//
// Invocação:
//   - HTTP GET/POST manual (super_admin autenticado) para inspeção via UI.
//   - Cron: `x-cron-secret: $PLUGGY_CRON_TICK_SECRET` (execução automática).

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("PLUGGY_CRON_TICK_SECRET") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Severity = "info" | "warning" | "critical";

interface Rule {
  key: string;
  severity: Severity;
  threshold: number;
  extract: (snap: any) => number;
  message: (value: number, threshold: number) => string;
}

const RULES: Rule[] = [
  {
    key: "webhook_dead_letter",
    severity: "critical",
    threshold: 1,
    extract: (s) => Number(s?.webhook?.dead_letter ?? 0),
    message: (v) => `${v} evento(s) de webhook em dead-letter exigem análise manual`,
  },
  {
    key: "webhook_backlog_pending",
    severity: "warning",
    threshold: 50,
    extract: (s) => Number(s?.webhook?.pending ?? 0),
    message: (v, t) => `Backlog de webhooks: ${v} pendentes (limiar ${t})`,
  },
  {
    key: "webhook_oldest_pending_age",
    severity: "critical",
    threshold: 900, // 15min
    extract: (s) => Number(s?.webhook?.oldest_pending_age_seconds ?? 0),
    message: (v) =>
      `Webhook mais antigo pendente há ${Math.round(v / 60)} min (SLO 15 min)`,
  },
  {
    key: "webhook_expired_claims",
    severity: "warning",
    threshold: 1,
    extract: (s) => Number(s?.webhook?.expired_claims ?? 0),
    message: (v) => `${v} reserva(s) de worker expirada(s) sem finalização`,
  },
  {
    key: "sync_dead_letter",
    severity: "critical",
    threshold: 1,
    extract: (s) => Number(s?.sync_runs?.dead_letter ?? 0),
    message: (v) => `${v} sincronização(ões) em dead-letter`,
  },
  {
    key: "sync_stuck_running",
    severity: "warning",
    threshold: 1,
    extract: (s) => Number(s?.sync_runs?.stuck_running ?? 0),
    message: (v) => `${v} sincronização(ões) travadas em 'running' há mais de 15 min`,
  },
  {
    key: "sync_error_last_hour",
    severity: "warning",
    threshold: 5,
    extract: (s) => Number(s?.sync_runs?.error_last_hour ?? 0),
    message: (v, t) => `${v} falhas de sync na última hora (limiar ${t})`,
  },
  {
    key: "connections_in_error",
    severity: "warning",
    threshold: 3,
    extract: (s) => Number(s?.connections?.in_error ?? 0),
    message: (v, t) => `${v} conexões em erro (login_error/outdated). Limiar ${t}`,
  },
];

async function evaluate() {
  const { data: snap, error } = await admin.rpc("pluggy_v2_slo_snapshot");
  if (error) throw new Error(`snapshot_failed: ${error.message}`);

  const opened: any[] = [];
  const resolved: any[] = [];

  for (const rule of RULES) {
    const value = rule.extract(snap);
    const isOpen = value >= rule.threshold;

    // Fetch current open alert
    const { data: existing } = await admin
      .from("pluggy_v2_alerts")
      .select("id, metric_value")
      .eq("alert_key", rule.key)
      .is("resolved_at", null)
      .order("notified_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (isOpen && !existing) {
      const { data: inserted } = await admin
        .from("pluggy_v2_alerts")
        .insert({
          alert_key: rule.key,
          severity: rule.severity,
          message: rule.message(value, rule.threshold),
          metric_value: value,
          threshold: rule.threshold,
          payload: { snapshot: snap },
        })
        .select("id")
        .single();
      opened.push({ key: rule.key, value, id: inserted?.id });
    } else if (isOpen && existing) {
      // Update running value (no notify_at change to preserve dedup window)
      await admin
        .from("pluggy_v2_alerts")
        .update({ metric_value: value, message: rule.message(value, rule.threshold) })
        .eq("id", existing.id);
    } else if (!isOpen && existing) {
      await admin
        .from("pluggy_v2_alerts")
        .update({ resolved_at: new Date().toISOString(), metric_value: value })
        .eq("id", existing.id);
      resolved.push({ key: rule.key, value, id: existing.id });
    }
  }

  return { snapshot: snap, opened, resolved };
}

async function requireSuperAdmin(req: Request): Promise<boolean> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData?.user) return false;
  const { data: roleData } = await admin.rpc("has_role", {
    _user_id: userData.user.id,
    _role: "super_admin",
  });
  return Boolean(roleData);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const cronHeader = req.headers.get("x-cron-secret") ?? "";
  const isCron = CRON_SECRET !== "" && cronHeader === CRON_SECRET;

  if (!isCron) {
    const ok = await requireSuperAdmin(req);
    if (!ok) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  try {
    const result = await evaluate();
    return new Response(
      JSON.stringify({ ok: true, ...result }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ ok: false, error: String(err?.message ?? err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
