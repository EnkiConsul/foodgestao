// Fase 6 — Camada 3: Categorização por IA (Gemini) para lançamentos sem match.
// Lê a fila pgmq `ai_categorization`, busca categorias candidatas do usuário,
// pede ao Gemini a melhor escolha e aplica via RPC `apply_ai_categorization`.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createLovableAiGatewayProvider } from "../_shared/ai-gateway.ts";
import { generateText, Output, NoObjectGeneratedError } from "npm:ai";
import { z } from "npm:zod";

type QueueMsg = {
  msg_id: number;
  message: {
    transaction_id: string;
    user_id: string;
    description: string;
    transaction_type: "entrada" | "saida" | "transferencia";
    context: "pf" | "pj" | null;
    company_id: string | null;
    amount: number | string;
  };
};

type Candidate = {
  id: string;
  name: string;
  hierarchy?: string | null;
  ai_description?: string | null;
  transaction_type: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  if (!LOVABLE_API_KEY) {
    return json({ error: "LOVABLE_API_KEY não configurada" }, 500);
  }

  // Optional auth: any authenticated user can trigger the worker on their own queue.
  // Service role callers (cron) bypass this.
  const authHeader = req.headers.get("Authorization") ?? "";
  const isServiceRole = authHeader.includes(SERVICE_KEY);
  if (!isServiceRole) {
    const anonClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims } = await anonClient.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (!claims?.claims?.sub) return json({ error: "Não autorizado" }, 401);
  }

  const body = await req.json().catch(() => ({}));
  const batchSize = Math.min(Math.max(Number(body?.batch) || 20, 1), 50);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: messages, error: readErr } = await admin.rpc("read_ai_categorization_queue", {
    p_batch: batchSize,
    p_vt: 90,
  });
  if (readErr) return json({ error: `read_queue: ${readErr.message}` }, 500);

  const msgs = (messages ?? []) as QueueMsg[];
  if (msgs.length === 0) return json({ processed: 0, applied: 0, empty: true });

  const gateway = createLovableAiGatewayProvider(LOVABLE_API_KEY);
  const model = gateway("google/gemini-3-flash-preview");

  // Group messages by (user_id, context, company_id, transaction_type) to reuse candidate list
  const groups = new Map<string, QueueMsg[]>();
  for (const m of msgs) {
    const k = `${m.message.user_id}|${m.message.context ?? ""}|${m.message.company_id ?? ""}|${m.message.transaction_type}`;
    const arr = groups.get(k) ?? [];
    arr.push(m);
    groups.set(k, arr);
  }

  let applied = 0;
  let noMatch = 0;
  const errors: string[] = [];

  for (const [, groupMsgs] of groups) {
    const first = groupMsgs[0].message;

    // Fetch candidate categories: user's own + system categories matching context and type
    const catsQuery = admin
      .from("categories")
      .select("id, name, hierarchy_index, ai_description, transaction_type, context, is_active, is_system, user_id, company_id")
      .eq("is_active", true)
      .eq("transaction_type", first.transaction_type)
      .limit(200);

    if (first.context) catsQuery.eq("context", first.context);

    const { data: rawCats, error: catsErr } = await catsQuery;
    if (catsErr) {
      errors.push(`fetch_cats: ${catsErr.message}`);
      continue;
    }

    const candidates: Candidate[] = (rawCats ?? [])
      .filter((c: any) =>
        c.is_system ||
        c.user_id === first.user_id ||
        (first.company_id && c.company_id === first.company_id),
      )
      .map((c: any) => ({
        id: c.id,
        name: c.name,
        hierarchy: c.hierarchy_index,
        ai_description: c.ai_description,
        transaction_type: c.transaction_type,
      }));

    if (candidates.length === 0) {
      // No categories available — drop all messages of this group to avoid infinite loop
      for (const m of groupMsgs) {
        await admin.rpc("delete_ai_categorization_message", { p_msg_id: m.msg_id });
      }
      continue;
    }

    // Build compact catalog string
    const catalog = candidates
      .map((c) => `- ${c.id} :: ${c.hierarchy ? c.hierarchy + " " : ""}${c.name}${c.ai_description ? ` — ${c.ai_description.slice(0, 140)}` : ""}`)
      .join("\n");

    for (const m of groupMsgs) {
      const desc = m.message.description ?? "";
      try {
        const { output } = await generateText({
          model,
          output: Output.object({
            schema: z.object({
              category_id: z.string().nullable(),
              confidence: z.number(),
              reason: z.string(),
            }),
          }),
          system:
            "Você é um contador brasileiro. Classifique um lançamento financeiro escolhendo a categoria mais apropriada da lista fornecida. Responda em JSON. Se nenhuma categoria for adequada, retorne category_id = null e confidence 0.",
          prompt: [
            `Lançamento:`,
            `- Descrição: "${desc}"`,
            `- Tipo: ${m.message.transaction_type}`,
            `- Valor: ${m.message.amount}`,
            `- Contexto: ${m.message.context ?? "não informado"}`,
            ``,
            `Categorias candidatas (id :: caminho):`,
            catalog,
            ``,
            `Escolha UMA categoria da lista. Retorne o id EXATO copiado da lista, um número de 0 a 1 em confidence, e uma justificativa curta (até 140 caracteres).`,
          ].join("\n"),
        });

        const chosen = output?.category_id ?? null;
        const confidence = Math.max(0, Math.min(1, Number(output?.confidence ?? 0)));

        if (chosen && confidence >= 0.55 && candidates.some((c) => c.id === chosen)) {
          const { error: applyErr } = await admin.rpc("apply_ai_categorization", {
            p_transaction_id: m.message.transaction_id,
            p_category_id: chosen,
            p_confidence: confidence,
            p_reason: output.reason?.slice(0, 200) ?? null,
          });
          if (applyErr) {
            errors.push(`apply(${m.message.transaction_id}): ${applyErr.message}`);
          } else {
            applied += 1;
          }
        } else {
          noMatch += 1;
        }
      } catch (err) {
        if (NoObjectGeneratedError.isInstance(err)) {
          noMatch += 1;
        } else {
          errors.push(`ai(${m.message.transaction_id}): ${(err as Error).message}`);
        }
      } finally {
        // Always remove message from queue to avoid reprocessing loops.
        await admin.rpc("delete_ai_categorization_message", { p_msg_id: m.msg_id });
      }
    }
  }

  return json({
    processed: msgs.length,
    applied,
    no_match: noMatch,
    errors: errors.slice(0, 10),
  });
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
