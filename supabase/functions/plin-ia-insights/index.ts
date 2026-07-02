// Plin IA — Insights automáticos para o dashboard
import { createClient } from "npm:@supabase/supabase-js@2";
import { generateText } from "npm:ai@7.0.13";
import { createLovableAiGatewayProvider } from "../_shared/ai-gateway.ts";
import { buildFinancialContext, contextToText, PLIN_IA_SYSTEM_PROMPT } from "../_shared/plin-ia-context.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const cache = new Map<string, { at: number; insights: unknown[] }>();
const CACHE_TTL = 15 * 60_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claimsRes, error: claimsErr } = await supabaseAuth.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (claimsErr || !claimsRes?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const userId = claimsRes.claims.sub as string;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: features } = await admin.rpc("get_user_plan_features", { _user_id: userId });
    const isSuperAdmin = (await admin.rpc("is_super_admin", { _user_id: userId })).data === true;
    if (!isSuperAdmin && !(features && (features as any).ai_enabled)) {
      return json({ insights: [] });
    }

    const body = await req.json().catch(() => ({}));
    const { context = "pf", companyId = null } = body as { context?: "pf" | "pj"; companyId?: string | null };

    const key = `${userId}:${context}:${companyId ?? "-"}`;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL) {
      return json({ insights: cached.insights });
    }

    const ctx = await buildFinancialContext(admin, { userId, context, companyId });
    const contextText = contextToText(ctx);

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) return json({ error: "LOVABLE_API_KEY not configured" }, 500);
    const gateway = createLovableAiGatewayProvider(lovableKey);
    const model = gateway("google/gemini-2.5-flash");

    const prompt = `${PLIN_IA_SYSTEM_PROMPT}

CONTEXTO DO USUÁRIO:
${contextText}

TAREFA: Gere EXATAMENTE 3 insights financeiros curtos e acionáveis com base nos dados acima:
1. Um insight tipo "alerta" (vencimentos críticos, fluxo negativo, inadimplência alta)
2. Um insight tipo "tendencia" (variação de receita/despesa vs mês anterior)
3. Um insight tipo "oportunidade" (categoria com melhor performance, redução de custo)

Responda APENAS com um JSON válido no formato:
{"insights":[{"tipo":"alerta"|"tendencia"|"oportunidade","titulo":"...","mensagem":"..."}, ...]}

Cada mensagem: 1-2 frases, no máximo 200 caracteres, com valores em R$ formatados.
Se não houver dados suficientes para algum tipo, gere um insight genérico orientando o usuário a cadastrar mais lançamentos.`;

    const { text } = await generateText({ model, prompt });

    let insights: unknown[] = [];
    try {
      const cleaned = text.replace(/```json\n?|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      insights = Array.isArray(parsed?.insights) ? parsed.insights.slice(0, 3) : [];
    } catch {
      insights = [];
    }
    cache.set(key, { at: Date.now(), insights });
    return json({ insights });
  } catch (e) {
    console.error("plin-ia-insights error", e);
    return json({ error: (e as Error).message || "Internal error" }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
