// Plin IA — Edge Function principal (chat com streaming)
import { createClient } from "npm:@supabase/supabase-js@2";
import { streamText, convertToModelMessages, type UIMessage } from "npm:ai@7.0.13";
import { createLovableAiGatewayProvider } from "../_shared/ai-gateway.ts";
import { buildFinancialContext, contextToText, PLIN_IA_SYSTEM_PROMPT } from "../_shared/plin-ia-context.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const contextCache = new Map<string, { at: number; text: string }>();
const CACHE_TTL = 5 * 60_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsRes, error: claimsErr } = await supabaseAuth.auth.getClaims(token);
    if (claimsErr || !claimsRes?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const userId = claimsRes.claims.sub as string;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const { messages, sessionId, context = "pf", companyId = null } = body as {
      messages: UIMessage[];
      sessionId: string;
      context?: "pf" | "pj";
      companyId?: string | null;
    };

    if (!Array.isArray(messages) || messages.length === 0 || !sessionId) {
      return json({ error: "messages and sessionId are required" }, 400);
    }

    // 1) Checa feature flag + quota do plano
    const { data: features } = await admin.rpc("get_user_plan_features", { _user_id: userId });
    const isSuperAdmin = (await admin.rpc("is_super_admin", { _user_id: userId })).data === true;
    const aiEnabled = isSuperAdmin || !!(features && (features as any).ai_enabled);
    if (!aiEnabled) return json({ error: "Plin IA não está disponível no seu plano atual." }, 402);

    const quota = isSuperAdmin ? 999999 : Number((features as any)?.ai_messages_per_day ?? 30);
    const today = new Date().toISOString().slice(0, 10);
    const { data: usageRow } = await admin
      .from("ia_usage_control")
      .select("messages_count, tokens_used")
      .eq("user_id", userId)
      .eq("date", today)
      .maybeSingle();
    const usedToday = usageRow?.messages_count ?? 0;
    if (usedToday >= quota) {
      return json({ error: "Você atingiu seu limite diário de mensagens do Plin IA. O limite renova à meia-noite." }, 429);
    }

    // 2) Contexto financeiro (cache 5min)
    const cacheKey = `${userId}:${context}:${companyId ?? "-"}`;
    let contextText = contextCache.get(cacheKey)?.text;
    if (!contextText || Date.now() - contextCache.get(cacheKey)!.at > CACHE_TTL) {
      const ctx = await buildFinancialContext(admin, { userId, context, companyId });
      contextText = contextToText(ctx);
      contextCache.set(cacheKey, { at: Date.now(), text: contextText });
    }

    const systemPrompt = `${PLIN_IA_SYSTEM_PROMPT}\n\nCONTEXTO DO USUÁRIO:\n${contextText}`;

    // 3) Registra mensagem do usuário
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const userText = lastUser
      ? (lastUser as any).parts?.filter((p: any) => p.type === "text").map((p: any) => p.text).join("") ?? ""
      : "";

    await admin.from("ia_conversations").insert({
      user_id: userId,
      session_id: sessionId,
      role: "user",
      content: userText,
    });

    // 4) Chama Lovable AI Gateway
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) return json({ error: "LOVABLE_API_KEY not configured" }, 500);
    const gateway = createLovableAiGatewayProvider(lovableKey);
    const model = gateway("google/gemini-2.5-pro");

    // Últimas 10 mensagens como janela
    const trimmed = messages.slice(-10);

    const result = streamText({
      model,
      system: systemPrompt,
      messages: await convertToModelMessages(trimmed),
      onFinish: async ({ text, usage }) => {
        try {
          await admin.from("ia_conversations").insert({
            user_id: userId,
            session_id: sessionId,
            role: "assistant",
            content: text,
            tokens_used: usage?.totalTokens ?? null,
          });
          await admin
            .from("ia_usage_control")
            .upsert(
              {
                user_id: userId,
                date: today,
                messages_count: usedToday + 1,
                tokens_used: (usageRow?.tokens_used ?? 0) + (usage?.totalTokens ?? 0),
                updated_at: new Date().toISOString(),
              },
              { onConflict: "user_id,date" },
            );
        } catch (e) {
          console.error("Persist error", e);
        }
      },
    });

    return result.toUIMessageStreamResponse({ headers: corsHeaders });
  } catch (e) {
    console.error("plin-ia error", e);
    return json({ error: (e as Error).message || "Internal error" }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
