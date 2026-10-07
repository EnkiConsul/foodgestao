/**
 * Revisão ortográfica e textual da ata com IA. Recebe o HTML do editor e
 * devolve o HTML revisado (mesma estrutura) e um resumo das alterações.
 * Não altera nomes, números, datas ou decisões.
 */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { requireUser } from "../_shared/authz.ts";

const Body = z.object({ html: z.string().min(1).max(60000) });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const INSTRUCOES = `Você é revisor de textos em português do Brasil para atas de reunião de empresas de food service.
Revise ortografia, acentuação, pontuação, concordância e clareza, deixando o texto formal e bem escrito.
Regras obrigatórias:
- Preserve exatamente a estrutura HTML (tags h1/h2/h3/p/ul/ol/li/strong/em/u/s/blockquote/hr e atributos style).
- Não invente fatos, não remova tópicos e não altere nomes, números, datas, valores, horários ou decisões.
- Melhore frases truncadas ou confusas sem mudar o sentido.
- Em "alteracoes", liste até 15 mudanças relevantes, curtas, em Primeira Maiúscula.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["html", "alteracoes"],
  properties: {
    html: { type: "string" },
    alteracoes: { type: "array", items: { type: "string" } },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const caller = await requireUser(req);
    if (!caller) return json({ error: "Sessão expirada. Entre novamente." }, 401);
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: "Texto da ata inválido ou muito longo." }, 400);
    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) return json({ error: "Revisão indisponível no momento (configuração ausente)." }, 500);

    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      signal: req.signal,
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        stream: true,
        store: false,
        reasoning: { effort: "low" },
        instructions: INSTRUCOES,
        input: [{ role: "user", content: parsed.data.html }],
        text: { format: { type: "json_schema", name: "ata_revisada", strict: true, schema: SCHEMA } },
      }),
    });
    if (!res.ok || !res.body) {
      const status = res.status;
      let msg = "Não foi possível revisar o texto agora. Tente novamente em instantes.";
      if (status === 429) msg = "Muitas revisões em sequência. Aguarde um minuto e tente de novo.";
      if (status === 402) msg = "Os créditos de IA da plataforma acabaram. Avise o administrador da conta.";
      if (status === 403) msg = "A revisão com IA não está liberada para esta conta.";
      console.error("[dp-ata-revisar]", status, (await res.text().catch(() => "")).slice(0, 300));
      return json({ error: msg }, status >= 400 && status < 600 ? status : 500);
    }
    // Consome o SSE e acumula o texto final.
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", texto = "", recusa = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const linha = buf.slice(0, idx).trim(); buf = buf.slice(idx + 1);
        if (!linha.startsWith("data:")) continue;
        const dado = linha.slice(5).trim();
        if (!dado || dado === "[DONE]") continue;
        try {
          const ev = JSON.parse(dado);
          if (ev.type === "response.output_text.delta") texto += ev.delta ?? "";
          else if (ev.type === "response.refusal.delta") recusa += ev.delta ?? "";
          else if (ev.type === "error" || ev.type === "response.failed") throw new Error("falha_ia");
        } catch (e) { if ((e as Error).message === "falha_ia") throw e; }
      }
    }
    if (recusa || !texto) return json({ error: "A IA não conseguiu revisar este texto. Revise manualmente." }, 422);
    const out = JSON.parse(texto);
    return json({ html: String(out.html ?? ""), alteracoes: Array.isArray(out.alteracoes) ? out.alteracoes : [] });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") return new Response(null, { status: 499 });
    console.error("[dp-ata-revisar]", e);
    return json({ error: "Não foi possível revisar o texto agora. Tente novamente em instantes." }, 500);
  }
});
