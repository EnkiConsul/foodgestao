/**
 * Leitura automática do comprovante de pagamento (PDF, foto ou print).
 *
 * Devolve apenas SUGESTÕES: data do pagamento, valor pago e tipo de operação.
 * Nada é gravado aqui — quem anexa confere na tela e o banco valida de novo em
 * `dp_comprovante_anexar`. Falha de leitura nunca libera gravação sem data:
 * a trava é da rotina de anexo (fail closed).
 *
 * O arquivo chega no corpo do pedido (base64) e NÃO é guardado nem registrado
 * em log — só o resultado estruturado volta para a tela.
 */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { requireUser, serviceClient } from "../_shared/authz.ts";
import { ipRateLimited } from "../_shared/rate-limit.ts";
import { recordEdgeError } from "../_shared/error-log.ts";

const FUNCAO = "dp-comprovante-ler";
const AI_URL = "https://ai.gateway.lovable.dev/v1/responses";
const MODELO = "openai/gpt-6-astra";
const TIMEOUT_MS = 45_000;
const MAX_BYTES = 15 * 1024 * 1024;

const MIMES_IMAGEM = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);

const Body = z.object({
  mime_type: z.string().min(3).max(120),
  nome: z.string().max(260).optional(),
  /** Conteúdo do arquivo em base64, sem o prefixo "data:". */
  arquivo_base64: z.string().min(16),
});

const Leitura = z.object({
  pago_em: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  valor_cents: z.number().int().nonnegative().nullable(),
  operacao: z.enum(["pix", "ted", "doc", "boleto", "deposito", "dinheiro", "outro"]).nullable(),
  instituicao: z.string().max(80).nullable(),
  confianca: z.number().min(0).max(1).nullable(),
});

const PROMPT = [
  "Você lê comprovantes de pagamento brasileiros (Pix, TED, DOC, boleto, depósito),",
  "inclusive fotos e prints de tela de aplicativos de banco.",
  "Responda SOMENTE um JSON válido, sem texto em volta, no formato:",
  '{"pago_em":"AAAA-MM-DD"|null,"valor_cents":inteiro|null,"operacao":"pix"|"ted"|"doc"|"boleto"|"deposito"|"dinheiro"|"outro"|null,"instituicao":"nome"|null,"confianca":0a1}',
  "pago_em é a data em que o pagamento foi efetivado/liquidado (não a data de emissão do comprovante nem a competência).",
  "valor_cents é o valor pago em centavos (R$ 1.234,56 => 123456).",
  "Use null em qualquer campo que não estiver claramente legível. Nunca invente valores.",
].join(" ");

function erro(status: number, mensagem: string): Response {
  return new Response(JSON.stringify({ error: mensagem }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function ok(corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Parte de mídia conforme o endpoint de respostas: imagem ou PDF. */
function parteArquivo(mime: string, b64: string, nome: string) {
  if (mime === "application/pdf") {
    return { type: "input_file", filename: nome, file_data: `data:application/pdf;base64,${b64}` };
  }
  return { type: "input_image", image_url: `data:${mime};base64,${b64}` };
}

/** Texto da resposta do endpoint /v1/responses. */
function textoDaResposta(j: unknown): string {
  const corpo = j as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  if (typeof corpo?.output_text === "string" && corpo.output_text.trim()) return corpo.output_text;
  const partes: string[] = [];
  for (const item of corpo?.output ?? []) {
    for (const c of item?.content ?? []) {
      if (typeof c?.text === "string") partes.push(c.text);
    }
  }
  return partes.join("\n");
}

function extrairJson(texto: string): unknown {
  const bruto = texto.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const inicio = bruto.indexOf("{");
  const fim = bruto.lastIndexOf("}");
  if (inicio < 0 || fim <= inicio) return null;
  try {
    return JSON.parse(bruto.slice(inicio, fim + 1));
  } catch {
    return null;
  }
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return erro(405, "Método não permitido");

  const admin = serviceClient();
  try {
    const user = await requireUser(req);
    if (!user) return erro(401, "Entre na sua conta para continuar.");

    if (
      await ipRateLimited(
        admin as unknown as Parameters<typeof ipRateLimited>[0],
        req,
        "dp-comprovante-ler",
        120,
      )
    ) {
      return erro(429, "Muitas leituras em sequência. Tente de novo em alguns minutos.");
    }

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return erro(400, "Pedido inválido.");
    const { mime_type, arquivo_base64 } = parsed.data;
    const nome = parsed.data.nome ?? "comprovante";

    const mime = mime_type.toLowerCase().split(";")[0].trim();
    if (mime !== "application/pdf" && !MIMES_IMAGEM.has(mime)) {
      return ok({ lido: false, motivo: "formato_nao_suportado" });
    }
    // base64 cresce ~33%: estima o tamanho original.
    if (arquivo_base64.length * 0.75 > MAX_BYTES) {
      return ok({ lido: false, motivo: "arquivo_grande" });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return ok({ lido: false, motivo: "leitura_indisponivel" });

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let resposta: Response;
    try {
      resposta = await fetch(AI_URL, {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
        body: JSON.stringify({
          model: MODELO,
          input: [
            {
              role: "user",
              content: [
                { type: "input_text", text: PROMPT },
                parteArquivo(mime, arquivo_base64, nome),
              ],
            },
          ],
        }),
      });
    } catch (e) {
      clearTimeout(timer);
      const abortado = (e as Error)?.name === "AbortError";
      return ok({ lido: false, motivo: abortado ? "leitura_demorada" : "leitura_indisponivel" });
    }
    clearTimeout(timer);

    if (!resposta.ok) {
      // O corpo pode conter dados do documento: não é registrado.
      await recordEdgeError({
        functionName: FUNCAO,
        action: "ler o comprovante",
        error: `ia_http_${resposta.status}`,
      });
      return ok({ lido: false, motivo: "leitura_indisponivel" });
    }

    const bruto = extrairJson(textoDaResposta(await resposta.json()));
    const leitura = Leitura.safeParse(bruto);
    if (!leitura.success) return ok({ lido: false, motivo: "nao_reconhecido" });

    const dados = leitura.data;
    // Data futura ou impossível é descartada: quem anexa informa à mão.
    const pagoEm = dados.pago_em && dados.pago_em <= hoje() ? dados.pago_em : null;

    return ok({
      lido: true,
      pago_em: pagoEm,
      valor_cents: dados.valor_cents ?? null,
      operacao: dados.operacao ?? null,
      instituicao: dados.instituicao ?? null,
      confianca: dados.confianca ?? null,
      modelo: MODELO,
      lido_em: new Date().toISOString(),
    });
  } catch (e) {
    await recordEdgeError({ functionName: FUNCAO, action: "ler o comprovante", error: e });
    return erro(500, "Não foi possível ler o comprovante agora.");
  }
});
