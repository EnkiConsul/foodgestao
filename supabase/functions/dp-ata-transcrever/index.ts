/**
 * Transcreve o áudio da reunião e organiza o texto no formato de ata (HTML).
 * Recebe multipart com o campo "audio". Não guarda o áudio.
 */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireUser } from "../_shared/authz.ts";

const MAX = 14 * 1024 * 1024;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const INSTRUCOES = `Você recebe a transcrição de uma reunião de equipe de uma empresa de food service (Brasil).
Monte a ata em HTML simples, em português formal, usando só as tags h2, p, ol, ul, li, strong.
Seções, nesta ordem: <h2>Pauta da Reunião</h2>, <h2>Discussões e Alinhamentos</h2>, <h2>Decisões e Combinados</h2>, <h2>Próximos Passos e Responsáveis</h2>.
Não invente fatos, nomes, números ou prazos. Se uma seção não tiver conteúdo, deixe um <p></p>.
Responda apenas com o HTML, sem comentários e sem blocos de código.`;

function erroGateway(status: number) {
  if (status === 429) return "Muitas transcrições em sequência. Aguarde um minuto e tente de novo.";
  if (status === 402) return "Os créditos de IA da plataforma acabaram. Avise o administrador da conta.";
  return "Não foi possível transcrever o áudio agora. Tente novamente em instantes.";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const caller = await requireUser(req);
    if (!caller) return json({ error: "Sessão expirada. Entre novamente." }, 401);
    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) return json({ error: "Transcrição indisponível no momento." }, 500);

    const form = await req.formData().catch(() => null);
    const audio = form?.get("audio");
    if (!(audio instanceof File) || audio.size === 0) return json({ error: "Envie um arquivo de áudio." }, 400);
    if (audio.size > MAX) return json({ error: "Áudio maior que 14 MB.", detalhe: "Grave em partes menores (até uns 25 minutos cada) e transcreva uma de cada vez." }, 400);

    const fd = new FormData();
    fd.append("model", "google/gemini-3.5-transcribe");
    fd.append("language", "pt");
    fd.append("file", audio, audio.name || "reuniao.webm");
    const tr = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST", headers: { Authorization: `Bearer ${key}` }, body: fd, signal: req.signal,
    });
    if (!tr.ok) {
      console.error("[dp-ata-transcrever] stt", tr.status);
      return json({ error: erroGateway(tr.status) }, tr.status === 429 || tr.status === 402 ? tr.status : 502);
    }
    const texto = String((await tr.json())?.text ?? "").trim();
    if (!texto) return json({ error: "Não conseguimos entender falas neste áudio.", detalhe: "Confira se o microfone captou as vozes e tente de novo." }, 422);

    const org = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST", signal: req.signal,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/gemini-2.5-flash", messages: [{ role: "system", content: INSTRUCOES }, { role: "user", content: texto.slice(0, 60000) }] }),
    });
    let html = "";
    if (org.ok) {
      html = String((await org.json())?.choices?.[0]?.message?.content ?? "").replace(/^```(?:html)?\s*|```\s*$/g, "").trim();
    } else console.error("[dp-ata-transcrever] org", org.status);
    return json({ texto, html });
  } catch (e) {
    console.error("[dp-ata-transcrever]", (e as Error)?.message);
    return json({ error: "Não foi possível transcrever o áudio agora. Tente novamente." }, 500);
  }
});
