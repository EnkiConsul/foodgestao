// Sugere categorias para transações Open Finance pendentes usando Lovable AI (Gemini).
// Recebe: { items: [{id, description, amount, type}], company_id }
// Retorna: { suggestions: [{id, category_id, category_name, confidence}] }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";

const BodySchema = z.object({
  company_id: z.string().uuid(),
  items: z.array(z.object({
    id: z.string(),
    description: z.string(),
    amount: z.number(),
    type: z.enum(["entrada", "saida"]).optional(),
  })).min(1).max(50),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return json({ error: parsed.error.flatten().fieldErrors }, 400);
    }
    const { company_id, items } = parsed.data;

    // Busca categorias da empresa (PJ)
    const { data: cats, error: catErr } = await supabase
      .from("categories")
      .select("id, name, type, parent_id")
      .eq("company_id", company_id)
      .eq("archived", false)
      .order("name");

    if (catErr) return json({ error: catErr.message }, 500);
    if (!cats || cats.length === 0) {
      return json({ suggestions: [] });
    }

    const catList = cats.map(c => `${c.id}|${c.name}|${c.type}`).join("\n");

    const prompt = `Você é um classificador financeiro. Dada a lista de categorias disponíveis (formato id|nome|tipo) e a lista de lançamentos, retorne SOMENTE um JSON no formato {"suggestions":[{"id":"<id_lancamento>","category_id":"<id>","confidence":0.0-1.0}]}.

Regras:
- category_id deve ser exatamente um dos ids fornecidos abaixo.
- Se o tipo do lançamento é "entrada", escolha categoria de tipo "entrada"; se "saida", tipo "saida".
- Se não houver match confiável (>0.4), omita a linha.

CATEGORIAS:
${catList}

LANÇAMENTOS:
${items.map(i => `${i.id}|${i.type ?? "saida"}|${i.amount}|${i.description}`).join("\n")}`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY missing" }, 500);

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI gateway error", aiRes.status, errText);
      if (aiRes.status === 429) return json({ error: "rate_limited" }, 429);
      if (aiRes.status === 402) return json({ error: "credits_exhausted" }, 402);
      return json({ error: "ai_failed", details: errText }, 502);
    }

    const aiJson = await aiRes.json();
    const content = aiJson?.choices?.[0]?.message?.content ?? "{}";
    let parsedContent: any = {};
    try {
      parsedContent = JSON.parse(content);
    } catch {
      parsedContent = { suggestions: [] };
    }

    const catMap = new Map(cats.map(c => [c.id, c.name]));
    const rawSug: Array<any> = Array.isArray(parsedContent?.suggestions) ? parsedContent.suggestions : [];
    const suggestions = rawSug
      .filter(s => s && catMap.has(s.category_id))
      .map(s => ({
        id: String(s.id),
        category_id: s.category_id,
        category_name: catMap.get(s.category_id)!,
        confidence: Number(s.confidence ?? 0.5),
      }));

    return json({ suggestions });
  } catch (err) {
    console.error("of-ai-suggest error", err);
    return json({ error: String(err?.message ?? err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
