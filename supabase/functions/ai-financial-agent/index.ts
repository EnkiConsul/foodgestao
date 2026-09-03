// 360°IA — Edge Function principal (chat com streaming + tool calling)
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { streamText, convertToModelMessages, tool, stepCountIs, type UIMessage } from "npm:ai@5.0.210";
import { z } from "npm:zod@3.23.8";
import { createLovableAiGatewayProvider } from "../_shared/ai-gateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const IA360_SYSTEM_PROMPT = `Você é o "360°IA", o CFO Virtual do Aveto 360.

SUAS FERRAMENTAS acessam o banco de dados REAL do usuário em tempo real. USE-AS SEMPRE que a pergunta envolver valores, contas, categorias, contatos, períodos, vencimentos ou tendências. NUNCA responda "não tenho essa informação" sem antes tentar buscar via ferramenta.

FLUXO OBRIGATÓRIO:
1. Interprete a pergunta e escolha a(s) ferramenta(s) certa(s).
2. Se o usuário citar um banco/conta ("Nubank", "Caixa"), use plin_ia_by_account para descobrir totais por conta; se citar uma categoria, use plin_ia_by_category; se citar um cliente/fornecedor, use plin_ia_by_contact.
3. Se pedir uma listagem específica, use plin_ia_search_transactions com filtros.
4. Combine ferramentas quando útil (ex.: resumo + top categorias).
5. Só então componha a resposta em Markdown.

FORMATAÇÃO:
- Valores em R$ 1.234,56 (pt-BR, vírgula decimal).
- Datas em dd/MM/yyyy.
- Tabelas Markdown para números comparativos.
- **Negrito** para valores-chave.
- Máx. 3-4 parágrafos, salvo pedido de detalhe.
- Termine com 1 recomendação prática acionável.

RESTRIÇÕES:
- Responda APENAS sobre finanças e gestão do negócio.
- Nunca invente dados. Se a ferramenta devolver vazio, diga isso claramente.
- Nada de consultoria jurídica/fiscal formal.

TOM: profissional, direto, trate por "você".`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsRes, error: claimsErr } = await supabaseUser.auth.getClaims(token);
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

    // Feature flag + quota
    const { data: features } = await admin.rpc("get_user_plan_features", { _user_id: userId });
    const isSuperAdmin = (await admin.rpc("is_super_admin", { _user_id: userId })).data === true;
    const aiEnabled = isSuperAdmin || !!(features && (features as any).ai_enabled);
    if (!aiEnabled) return json({ error: "360°IA não está disponível no seu plano atual." }, 402);

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
      return json({ error: "Você atingiu seu limite diário de mensagens do 360°IA. O limite renova à meia-noite." }, 429);
    }

    // Registra mensagem do usuário
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

    // ===== Tools =====
    const tools = buildTools(supabaseUser, context, companyId);

    // Mini-briefing curto (data + contexto) — o resto vem via ferramentas
    const now = new Date();
    const monthNames = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    const briefing = `CONTEXTO ATIVO: ${context === "pj" ? `Empresarial (company_id=${companyId ?? "?"})` : "Pessoal (PF)"}\nData de hoje: ${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} (${monthNames[now.getMonth()]}/${now.getFullYear()})`;
    const systemPrompt = `${IA360_SYSTEM_PROMPT}\n\n${briefing}`;

    // LLM
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) return json({ error: "LOVABLE_API_KEY not configured" }, 500);
    const gateway = createLovableAiGatewayProvider(lovableKey);
    const model = gateway("google/gemini-2.5-pro");

    const trimmed = messages.slice(-10);

    const result = streamText({
      model,
      system: systemPrompt,
      messages: await convertToModelMessages(trimmed),
      tools,
      stopWhen: stepCountIs(8),
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
    console.error("360-ia error", e);
    return json({ error: (e as Error).message || "Internal error" }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ===== Ferramentas do 360°IA =====

function buildTools(
  sb: SupabaseClient,
  context: "pf" | "pj",
  companyId: string | null,
) {
  const base = { _context: context, _company_id: context === "pj" ? companyId : null };

  const dateOpt = z.string().describe("Data ISO YYYY-MM-DD. Se omitido usa o mês atual.").optional();
  const typeOpt = z.enum(["entrada", "saida", "transferencia"]).optional();

  const call = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await sb.rpc(fn, { ...base, ...args });
    if (error) return { error: error.message };
    return { data };
  };

  return {
    plin_ia_summary: tool({
      description: "Resumo financeiro do período: receitas, despesas, saldo líquido, quantidade de lançamentos pendentes e vencidos. Padrão: mês atual.",
      inputSchema: z.object({ from: dateOpt, to: dateOpt }),
      execute: (a) => call("plin_ia_summary", { _from: a.from ?? null, _to: a.to ?? null }),
    }),
    plin_ia_by_account: tool({
      description: "Totais agrupados por conta bancária (ex.: Nubank, Caixa) no período. Use quando o usuário citar um banco/conta ou pedir comparação entre contas.",
      inputSchema: z.object({ from: dateOpt, to: dateOpt, type: typeOpt }),
      execute: (a) => call("plin_ia_by_account", { _from: a.from ?? null, _to: a.to ?? null, _type: a.type ?? null }),
    }),
    plin_ia_by_category: tool({
      description: "Totais por categoria no período. Use para 'onde gastei mais', ranking de categorias, etc.",
      inputSchema: z.object({ from: dateOpt, to: dateOpt, type: typeOpt }),
      execute: (a) => call("plin_ia_by_category", { _from: a.from ?? null, _to: a.to ?? null, _type: a.type ?? null }),
    }),
    plin_ia_by_contact: tool({
      description: "Totais por cliente/fornecedor no período.",
      inputSchema: z.object({ from: dateOpt, to: dateOpt, type: typeOpt }),
      execute: (a) => call("plin_ia_by_contact", { _from: a.from ?? null, _to: a.to ?? null, _type: a.type ?? null }),
    }),
    plin_ia_upcoming: tool({
      description: "Lista lançamentos pendentes com vencimento nos próximos N dias (padrão 7).",
      inputSchema: z.object({ days: z.number().int().min(1).max(90).optional() }),
      execute: (a) => call("plin_ia_upcoming", { _days: a.days ?? 7 }),
    }),
    plin_ia_overdue: tool({
      description: "Lista lançamentos vencidos ainda em aberto.",
      inputSchema: z.object({}),
      execute: () => call("plin_ia_overdue", {}),
    }),
    plin_ia_cashflow: tool({
      description: "Série mensal de receitas/despesas/saldo dos últimos N meses (padrão 6).",
      inputSchema: z.object({ months: z.number().int().min(1).max(24).optional() }),
      execute: (a) => call("plin_ia_cashflow", { _months: a.months ?? 6 }),
    }),
    plin_ia_accounts_balance: tool({
      description: "Saldos atuais de todas as contas bancárias ativas.",
      inputSchema: z.object({}),
      execute: () => call("plin_ia_accounts_balance", {}),
    }),
    plin_ia_search_transactions: tool({
      description: "Busca lançamentos com filtros combináveis (período, tipo, status, conta, categoria, contato, faixa de valor, texto). Máx 50 resultados.",
      inputSchema: z.object({
        from: dateOpt,
        to: dateOpt,
        type: typeOpt,
        status: z.enum(["pendente", "confirmado", "cancelado"]).optional(),
        account_id: z.string().uuid().optional(),
        category_id: z.string().uuid().optional(),
        contact_id: z.string().uuid().optional(),
        min: z.number().optional(),
        max: z.number().optional(),
        query: z.string().optional().describe("Trecho de texto para buscar na descrição"),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: (a) => call("plin_ia_search_transactions", {
        _from: a.from ?? null, _to: a.to ?? null,
        _type: a.type ?? null, _status: a.status ?? null,
        _account_id: a.account_id ?? null, _category_id: a.category_id ?? null, _contact_id: a.contact_id ?? null,
        _min: a.min ?? null, _max: a.max ?? null,
        _query: a.query ?? null, _limit: a.limit ?? 20,
      }),
    }),
  };
}
