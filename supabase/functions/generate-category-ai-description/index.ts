import { createClient } from "npm:@supabase/supabase-js@2";
import { createLovableAiGatewayProvider } from "../_shared/ai-gateway.ts";
import { generateText } from "npm:ai";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUBTYPE_LABEL: Record<string, string> = {
  receita: "Receita",
  saida: "Saída",
  custo: "Custo",
  despesa: "Despesa",
  imposto: "Imposto",
  investimento: "Investimento",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Require authenticated session — avoid public abuse of the AI gateway.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await authClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY não configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { name, subtype, transaction_type, parent_name } = await req.json();

    if (!name || typeof name !== "string") {
      return new Response(JSON.stringify({ error: "Nome da categoria é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const subtypeLabel = SUBTYPE_LABEL[subtype] ?? "não informado";
    const gateway = createLovableAiGatewayProvider(key);

    const { text } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      system:
        "Você é um contador brasileiro. Escreva descrições objetivas de categorias financeiras para orientar um agente de IA a classificar lançamentos automaticamente. Use português do Brasil, tom neutro e profissional, no máximo 2 frases (até 300 caracteres). Cite exemplos típicos de lançamentos que se enquadram, sem repetir o nome da categoria como título. Não use markdown, aspas ou emojis.",
      prompt: `Gere a descrição da categoria abaixo:
- Nome: ${name}
- Subtipo contábil: ${subtypeLabel}
- Tipo do lançamento: ${transaction_type ?? "não informado"}
${parent_name ? `- Categoria pai: ${parent_name}` : ""}

Responda apenas com o texto da descrição.`,
    });

    const description = text.trim().replace(/^["']|["']$/g, "").slice(0, 500);

    return new Response(JSON.stringify({ description }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = /rate.?limit|429/i.test(msg) ? 429 : /402|credit/i.test(msg) ? 402 : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
