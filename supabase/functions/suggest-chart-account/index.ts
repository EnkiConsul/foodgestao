// Assistente de vínculo Categoria Padrão → Conta Contábil Padrão (plano V2).
// Pré-filtra candidatas por compatibilidade e palavras-chave, e pede à IA a
// melhor escolha com justificativa, confiança e marcação de revisão humana.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createOpenAI } from "npm:@ai-sdk/openai";
import { streamText } from "npm:ai";

type CategoryTemplate = {
  code: string;
  name: string;
  subtype: string;
  transaction_type: "entrada" | "saida" | "transferencia";
  ai_description: string | null;
  guidance_include: string | null;
  guidance_exclude: string | null;
  keywords: string[] | null;
  examples: string | null;
  chart_account_code: string | null;
};

type ChartTemplate = {
  code: string;
  name: string;
  template_key: string | null;
  is_synthetic: boolean | null;
  is_active: boolean | null;
  requires_review: boolean | null;
  usage_description: string | null;
  keywords: string[] | null;
  excluded_keywords: string[] | null;
  allowed_category_subtypes: string[] | null;
  allowed_transaction_types: string[] | null;
};

type Suggestion = {
  category_code: string;
  chart_account_code: string | null;
  template_key: string | null;
  confidence: number;
  rationale: string;
  requires_review: boolean;
};

const NON_RESULT_SUBTYPES = ["investimento", "patrimonial", "transferencia"];
const NON_RESULT_ROOTS = ["1", "2", "3", "9"];
const OUTFLOW_ROOTS = ["5", "6", "7", "8"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function root(code: string) {
  return (code ?? "").trim().split(".")[0] ?? "";
}

function norm(s: string) {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Compatibilidade estrutural: espelha `chartCompat.ts` + campos V2 da conta. */
function eligible(cat: CategoryTemplate, acc: ChartTemplate): boolean {
  if (acc.is_synthetic) return false;
  if (acc.is_active === false) return false;

  const allowedTypes = acc.allowed_transaction_types ?? [];
  if (allowedTypes.length > 0 && !allowedTypes.includes(cat.transaction_type)) return false;
  const allowedSubs = acc.allowed_category_subtypes ?? [];
  if (allowedSubs.length > 0 && !allowedSubs.includes(cat.subtype)) return false;

  const r = root(acc.code);
  const nonResult = NON_RESULT_SUBTYPES.includes(cat.subtype) || cat.transaction_type === "transferencia";
  if (nonResult) return NON_RESULT_ROOTS.includes(r);
  if (["1", "2", "3"].includes(r)) return false;
  if (!["4", "5", "6", "7", "8", "9"].includes(r)) return false;
  if (cat.transaction_type === "entrada" && OUTFLOW_ROOTS.includes(r)) return false;
  if (cat.transaction_type === "saida" && r === "4") return false;
  return true;
}

function score(cat: CategoryTemplate, acc: ChartTemplate): number {
  const haystack = norm(
    [cat.name, cat.ai_description, cat.guidance_include, cat.examples, (cat.keywords ?? []).join(" ")].join(" "),
  );
  const catName = norm(cat.name);
  let s = 0;

  for (const kw of acc.keywords ?? []) {
    const k = norm(kw);
    if (k.length < 3) continue;
    if (catName.includes(k)) s += 4;
    else if (haystack.includes(k)) s += 2;
  }
  for (const kw of acc.excluded_keywords ?? []) {
    const k = norm(kw);
    if (k.length >= 3 && haystack.includes(k)) s -= 3;
  }
  // Similaridade de nome por tokens
  const accTokens = new Set(norm(acc.name).split(" ").filter((t) => t.length >= 4));
  for (const t of accTokens) if (haystack.includes(t)) s += 1;

  if ((acc.allowed_category_subtypes ?? []).includes(cat.subtype)) s += 2;
  if (acc.requires_review) s -= 1;
  return s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY não configurada" }, 500);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const anon = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claims } = await anon.auth.getClaims(authHeader.replace("Bearer ", ""));
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) return json({ error: "unauthorized" }, 401);

  const { data: isAdmin, error: roleErr } = await anon.rpc("has_role", {
    _user_id: userId,
    _role: "super_admin",
  });
  if (roleErr) return json({ error: "authorization_check_failed", message: roleErr.message }, 403);
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const codes = Array.isArray(body?.codes) ? (body.codes as string[]).map(String) : null;
  const limit = Math.min(Math.max(Number(body?.limit) || 40, 1), 120);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  let catQuery = admin
    .from("category_templates")
    .select(
      "code, name, subtype, transaction_type, ai_description, guidance_include, guidance_exclude, keywords, examples, chart_account_code",
    )
    .order("sort_order");
  if (codes?.length) catQuery = catQuery.in("code", codes);
  else catQuery = catQuery.is("chart_account_code", null);

  const { data: catRows, error: catErr } = await catQuery;
  if (catErr) return json({ error: "categories_lookup_failed", message: catErr.message }, 500);

  const categories = ((catRows ?? []) as CategoryTemplate[]).slice(0, limit);
  if (categories.length === 0) return json({ suggestions: [], total: 0, pending: 0 });

  const { data: accRows, error: accErr } = await admin
    .from("chart_account_templates")
    .select(
      "code, name, template_key, is_synthetic, is_active, requires_review, usage_description, keywords, excluded_keywords, allowed_category_subtypes, allowed_transaction_types",
    )
    .order("sort_order");
  if (accErr) return json({ error: "accounts_lookup_failed", message: accErr.message }, 500);
  const accounts = (accRows ?? []) as ChartTemplate[];

  const lovable = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey: LOVABLE_API_KEY,
    headers: {
      "Lovable-API-Key": LOVABLE_API_KEY,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });

  const suggestions: Suggestion[] = [];
  const CHUNK = 8;

  for (let i = 0; i < categories.length; i += CHUNK) {
    const chunk = categories.slice(i, i + CHUNK);

    const payload = chunk.map((cat) => {
      const candidates = accounts
        .filter((acc) => eligible(cat, acc))
        .map((acc) => ({ acc, s: score(cat, acc) }))
        .sort((a, b) => b.s - a.s)
        .slice(0, 8)
        .map(({ acc }) => ({
          code: acc.code,
          template_key: acc.template_key,
          name: acc.name,
          como_usar: acc.usage_description,
          palavras_chave: acc.keywords ?? [],
          nao_usar_para: acc.excluded_keywords ?? [],
          exige_revisao: !!acc.requires_review,
        }));
      return {
        categoria: {
          code: cat.code,
          nome: cat.name,
          subtipo: cat.subtype,
          tipo: cat.transaction_type,
          descricao: cat.ai_description,
          o_que_lancar: cat.guidance_include,
          o_que_nao_lancar: cat.guidance_exclude,
          palavras_chave: cat.keywords ?? [],
          exemplos: cat.examples,
        },
        contas_candidatas: candidates,
      };
    });

    // Sem candidata elegível: devolve como pendente de revisão manual.
    const withCandidates = payload.filter((p) => p.contas_candidatas.length > 0);
    for (const p of payload) {
      if (p.contas_candidatas.length === 0) {
        suggestions.push({
          category_code: p.categoria.code,
          chart_account_code: null,
          template_key: null,
          confidence: 0,
          rationale: "Nenhuma conta contábil compatível encontrada no plano padrão.",
          requires_review: true,
        });
      }
    }
    if (withCandidates.length === 0) continue;

    try {
      const result = streamText({
        model: lovable.responses("openai/gpt-5.6-sol"),
        system:
          "Você é um contador brasileiro especialista em food service. Para cada categoria financeira, escolha entre as contas candidatas a conta contábil correta, usando o campo 'como_usar', as palavras-chave e as exclusões de cada conta. " +
          "Marque requires_review = true quando o caso for ambíguo (bonificação, ativo x manutenção, aporte x receita, sócio, transferência entre empresas), quando a conta escolhida tiver exige_revisao = true, ou quando a confiança for menor que 0,7. " +
          "Se nenhuma candidata servir, devolva chart_account_code = null. Responda APENAS com JSON válido no formato " +
          '{"suggestions":[{"category_code":"","chart_account_code":"","template_key":"","confidence":0.0,"rationale":"","requires_review":false}]} ' +
          "com rationale de até 160 caracteres em português do Brasil, sem markdown.",
        prompt: JSON.stringify(withCandidates),
        providerOptions: {
          openai: {
            forceReasoning: true,
            reasoningEffort: "low",
            reasoningSummary: "auto",
            store: false,
          },
        },
      });

      const text = await result.text;
      const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
      const start = cleaned.indexOf("{");
      const parsed = JSON.parse(start > 0 ? cleaned.slice(start) : cleaned) as {
        suggestions?: Suggestion[];
      };

      const allowed = new Map(
        withCandidates.flatMap((p) => p.contas_candidatas.map((c) => [c.code, c] as const)),
      );
      for (const s of parsed.suggestions ?? []) {
        const cat = withCandidates.find((p) => p.categoria.code === s.category_code);
        if (!cat) continue;
        const acc = s.chart_account_code ? allowed.get(s.chart_account_code) : null;
        const confidence = Math.max(0, Math.min(1, Number(s.confidence) || 0));
        suggestions.push({
          category_code: s.category_code,
          chart_account_code: acc?.code ?? null,
          template_key: acc?.template_key ?? null,
          confidence,
          rationale: String(s.rationale ?? "").slice(0, 200),
          requires_review: !!s.requires_review || !acc || !!acc.exige_revisao || confidence < 0.7,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/rate.?limit|429/i.test(msg)) return json({ error: "rate_limited", message: msg }, 429);
      if (/402|credit/i.test(msg)) return json({ error: "credits_exhausted", message: msg }, 402);
      return json({ error: "ai_failed", message: msg }, 500);
    }
  }

  return json({ suggestions, total: suggestions.length, analyzed: categories.length });
});
