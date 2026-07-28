// deno-lint-ignore-file no-explicit-any
// Self-test do worker durável Pluggy (Bloco 9).
// Cobre T2 (expiração de lease), T3 (dead_letter após max_attempts)
// e T4 (finalize_success limpa reserva).
//
// Invoque manualmente via curl com header x-cron-secret:
//   curl -H "x-cron-secret: $PLUGGY_CRON_TICK_SECRET" \
//        https://<project>.supabase.co/functions/v1/pluggy-worker-selftest
//
// A função usa SERVICE_ROLE_KEY e insere/limpa registros de teste
// prefixados com "selftest-worker-".

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("PLUGGY_CRON_TICK_SECRET") ?? "";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type TestResult = { name: string; pass: boolean; detail?: unknown };

async function cleanup() {
  await admin
    .from("open_finance_webhook_events")
    .delete()
    .like("event_id", "selftest-worker-%");
}

async function seed(count: number) {
  const rows = Array.from({ length: count }, (_, i) => ({
    event_id: `selftest-worker-${crypto.randomUUID()}-${i}`,
    event_type: "item/updated",
    payload: { selftest: true, idx: i },
    status: "pending",
    attempt_count: 0,
    max_attempts: 3,
  }));
  const { error } = await admin.from("open_finance_webhook_events").insert(rows);
  if (error) throw error;
}

async function claim(worker: string, batch = 5, lease = 60) {
  const { data, error } = await admin.rpc("pluggy_webhook_claim", {
    p_worker_id: worker,
    p_batch_size: batch,
    p_lease_seconds: lease,
  });
  if (error) throw error;
  return (data ?? []) as any[];
}

async function runTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  await cleanup();
  await seed(6);

  // T2: expiração de lease — worker-a reserva 3, expira, worker-b recupera
  const a = await claim("selftest-a", 3, 60);
  await admin
    .from("open_finance_webhook_events")
    .update({ claim_expires_at: new Date(Date.now() - 10_000).toISOString() })
    .eq("claimed_by", "selftest-a");
  const b = await claim("selftest-b", 10, 60);
  results.push({
    name: "T2_lease_expiration",
    pass: a.length === 3 && b.length >= 3,
    detail: { a: a.length, b: b.length },
  });

  // T3: dead_letter após max_attempts
  const target = b[0];
  if (target) {
    await admin
      .from("open_finance_webhook_events")
      .update({ attempt_count: 3 })
      .eq("id", target.id);
    await admin.rpc("pluggy_webhook_finalize_failure", {
      p_event_id: target.id,
      p_worker_id: "selftest-b",
      p_error: "selftest triggered failure",
      p_error_code: "selftest",
    });
    const { data: after } = await admin
      .from("open_finance_webhook_events")
      .select("status, claimed_by")
      .eq("id", target.id)
      .maybeSingle();
    results.push({
      name: "T3_dead_letter",
      pass: after?.status === "dead_letter" && after?.claimed_by === null,
      detail: after,
    });
  }

  // T4: finalize_success limpa reserva
  const survivor = b[1];
  if (survivor) {
    await admin.rpc("pluggy_webhook_finalize_success", {
      p_event_id: survivor.id,
      p_worker_id: "selftest-b",
    });
    const { data: after } = await admin
      .from("open_finance_webhook_events")
      .select("status, claimed_by, processed_at")
      .eq("id", survivor.id)
      .maybeSingle();
    results.push({
      name: "T4_finalize_success",
      pass:
        after?.status === "processed" &&
        after?.claimed_by === null &&
        !!after?.processed_at,
      detail: after,
    });
  }

  await cleanup();
  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const secret = req.headers.get("x-cron-secret") ?? "";
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const results = await runTests();
    const allPass = results.every((r) => r.pass);
    return new Response(
      JSON.stringify({ ok: allPass, results }, null, 2),
      {
        status: allPass ? 200 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: String((err as Error).message ?? err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
