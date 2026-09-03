// Edge function: dp-send-broadcast
// Envia uma mensagem (a partir de um modelo `dp_modelos_mensagem` ou corpo livre)
// para uma lista de colaboradores. Persiste em `dp_mensagens` (uma linha por destinatário)
// e — quando o canal for e-mail e o secret RESEND_API_KEY estiver configurado —
// dispara via Resend (gateway Lovable).
//
// Body: {
//   company_id: uuid,
//   canal: "whatsapp" | "email" | "sms",
//   assunto: string,
//   corpo: string,                          // pode conter variáveis {nome}, {data}
//   colaborador_ids: uuid[],                // destinatários
//   variables?: Record<string,string>,      // valores globais
// }

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

const BodySchema = z.object({
  company_id: z.string().uuid(),
  canal: z.enum(["whatsapp", "email", "sms"]),
  assunto: z.string().min(1).max(200),
  corpo: z.string().min(1).max(4000),
  colaborador_ids: z.array(z.string().uuid()).min(1).max(500),
  variables: z.record(z.string(), z.string()).optional().default({}),
});

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const { company_id, canal, assunto, corpo, colaborador_ids, variables } = parsed.data;

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: colabs, error } = await supabase
      .from("dp_colaboradores")
      .select("id, user_id, nome, email, email_portal, email_contato, whatsapp, telefone")
      .in("id", colaborador_ids)
      .eq("company_id", company_id);
    if (error) return json({ error: error.message }, 400);

    const substitute = (tpl: string, extra: Record<string, string>) => {
      const vars: Record<string, string> = { ...variables, ...extra };
      return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
    };

    // Persistir mensagens (uma por destinatário)
    const rows = (colabs ?? []).map((c) => ({
      company_id,
      destinatario_colaborador_id: c.id,
      destinatario_user_id: c.user_id ?? null,
      assunto,
      corpo: substitute(corpo, { nome: c.nome ?? "" }),
    }));
    if (rows.length > 0) {
      const { error: msgErr } = await supabase.from("dp_mensagens").insert(rows);
      if (msgErr) return json({ error: msgErr.message }, 400);
    }

    // Enviar por e-mail se aplicável e se Resend estiver configurado
    const results: any[] = [];
    if (canal === "email") {
      const LOVABLE = Deno.env.get("LOVABLE_API_KEY");
      const RESEND = Deno.env.get("RESEND_API_KEY");
      if (LOVABLE && RESEND) {
        for (const c of colabs ?? []) {
          const to = c.email_contato || c.email || c.email_portal;
          if (!to) { results.push({ id: c.id, skipped: "sem_email" }); continue; }
          const body = substitute(corpo, { nome: c.nome ?? "" });
          const r = await fetch(`${GATEWAY_URL}/emails`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${LOVABLE}`,
              "X-Connection-Api-Key": RESEND,
            },
            body: JSON.stringify({
              from: "Pessoas Aveto 360 <onboarding@resend.dev>",
              to: [to], subject: assunto,
              html: `<p>${body.replace(/\n/g, "<br/>")}</p>`,
            }),
          });
          if (!r.ok) {
            const txt = await r.text();
            results.push({ id: c.id, error: txt, status: r.status });
          } else {
            results.push({ id: c.id, sent: true });
          }
        }
      } else {
        results.push({ note: "Envio real de e-mail não configurado (RESEND_API_KEY ausente); mensagens persistidas em dp_mensagens." });
      }
    } else {
      results.push({ note: `Canal ${canal} apenas persistido em dp_mensagens (integração externa não configurada).` });
    }

    return json({ total: rows.length, results });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
