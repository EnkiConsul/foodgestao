// Edge function: dp-notify-atestado
// Notifica os administradores da empresa que um novo atestado foi enviado
// e faz dedupe simples (rejeita atestado do mesmo colaborador na mesma data
// enviado nas últimas 48h, exceto se forçado com `force=true`).
//
// Body: { company_id, colaborador_id, data_inicio, dias?: number, arquivo_path?: string, force?: boolean }
// Retorna: { notificacao_id, warn_dedupe?: {existing_id, uploaded_at} }

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

const BodySchema = z.object({
  company_id: z.string().uuid(),
  colaborador_id: z.string().uuid(),
  data_alvo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dias: z.number().int().min(1).max(365).optional().default(1),
  arquivo_path: z.string().optional(),
  force: z.boolean().optional().default(false),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const { company_id, colaborador_id, data_alvo, dias, arquivo_path, force } = parsed.data;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    // 1) Dedupe warn: mesma data + colaborador + criado nas últimas 48h
    const cutoff = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const { data: dup } = await supabase
      .from("dp_solicitacoes")
      .select("id, created_at")
      .eq("company_id", company_id)
      .eq("colaborador_id", colaborador_id)
      .eq("tipo", "atestado")
      .eq("data_alvo", data_alvo)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(1);

    let warn_dedupe: { existing_id: string; created_at: string } | undefined;
    if (dup && dup.length > 0) {
      if (!force) {
        return json({
          error: "Atestado duplicado (mesma data nas últimas 48h). Reenvie com force=true para forçar.",
          existing: { id: dup[0].id, created_at: dup[0].created_at },
        }, 409);
      }
      warn_dedupe = { existing_id: dup[0].id as string, created_at: dup[0].created_at as string };
    }

    // 2) Registra a solicitação de atestado
    const data_fim = new Date(new Date(data_alvo + "T00:00:00Z").getTime() + (dias - 1) * 86400000)
      .toISOString().slice(0, 10);

    const { data: solic, error: solicErr } = await supabase
      .from("dp_solicitacoes")
      .insert({
        company_id, colaborador_id,
        tipo: "atestado", status: "pendente",
        data_alvo, data_fim,
        arquivo_path: arquivo_path ?? null,
        motivo: "Atestado enviado via portal do colaborador",
      })
      .select("id").single();
    if (solicErr) return json({ error: solicErr.message }, 400);

    // 3) Notifica admins (trigger dp_notif_solicitacao já faz isso automaticamente,
    //    mas garantimos um registro com titulo específico para atestados).
    const { data: notif, error: notifErr } = await supabase
      .from("dp_notificacoes")
      .insert({
        company_id, tipo: "atestado_novo",
        titulo: "Novo atestado para análise",
        descricao: `Data: ${data_alvo}${dias > 1 ? ` (${dias} dias)` : ""}`,
        ref_table: "dp_solicitacoes", ref_id: solic.id,
        para_admins: true, colaborador_id,
      })
      .select("id").single();
    if (notifErr) return json({ error: notifErr.message }, 400);

    return json({
      solicitacao_id: solic.id,
      notificacao_id: notif.id,
      warn_dedupe,
    });
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
