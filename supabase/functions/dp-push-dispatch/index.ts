// Envia as notificações do Pessoas 360° para a barra do celular (Web Push).
// Acionado pelo agendamento a cada minuto; aceita somente o segredo interno por cabeçalho.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { secretMatches } from "../_shared/secret.ts";

const PATH_GESTOR: Record<string, string> = {
  dp_solicitacoes: "/dp/folgas?aba=solicitacoes", dp_trocas: "/dp/folgas?aba=trocas",
  dp_documentos: "/dp/documentos", dp_avisos: "/dp/avisos", dp_ocorrencias: "/dp/ocorrencias",
  dp_ferias_periodos: "/dp/ferias", dp_ferias_gozos: "/dp/ferias", dp_folgas: "/dp/folgas",
};
const PATH_PORTAL: Record<string, string> = {
  dp_trocas: "/dp/meu/calendario", dp_documentos: "/dp/meu/documentos", dp_folgas: "/dp/meu/calendario",
  dp_convocacoes: "/dp/meu/convocacoes", dp_indisponibilidades: "/dp/meu/calendario",
  dp_elogios: "/dp/meu/documentos?tipo=disciplinar",
};

Deno.serve(async (req) => {
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: esperado } = await admin.rpc("dp_push_worker_secret");
  if (!secretMatches(req.headers.get("x-worker-secret"), esperado as string | null)) return json({ error: "unauthorized" }, 401);

  const pub = Deno.env.get("VAPID_PUBLIC_KEY"), priv = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!pub || !priv) return json({ error: "vapid_not_configured" }, 500);
  webpush.setVapidDetails("mailto:contato@aveto360.com", pub, priv);

  const { data: itens, error } = await admin.rpc("dp_push_reservar", { _limite: 50 });
  if (error) { console.error("reservar", error); return json({ error: error.message }, 500); }
  let enviados = 0;

  for (const it of (itens ?? []) as any[]) {
    try {
      const { data: destinos } = await admin.rpc("dp_push_destinos", {
        _user_id: it.user_id, _company_id: it.company_id, _para_admins: !!it.para_admins,
      });
      const url = it.user_id
        ? (PATH_PORTAL[it.ref_table] ?? "/dp/meu")
        : (PATH_GESTOR[it.ref_table] ?? "/dp/notificacoes");
      let finalUrl = url;
      if (it.ref_table === "dp_trocas" && !it.user_id) {
        const { data: n } = await admin.from("dp_notificacoes").select("ref_id").eq("id", it.notificacao_id).maybeSingle();
        if (n?.ref_id) finalUrl = `${url}&troca_id=${encodeURIComponent(n.ref_id)}`;
      }
      const payload = JSON.stringify({ title: it.titulo, body: it.descricao ?? "", url: finalUrl, tag: it.notificacao_id });
      for (const d of (destinos ?? []) as any[]) {
        try {
          await webpush.sendNotification({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, payload, { TTL: 86400 });
          enviados++;
          await admin.from("dp_push_inscricoes").update({ ultimo_envio_em: new Date().toISOString(), falhas: 0 }).eq("id", d.inscricao_id);
        } catch (e: any) {
          const sc = e?.statusCode;
          if (sc === 404 || sc === 410) await admin.from("dp_push_inscricoes").delete().eq("id", d.inscricao_id);
          else console.error("push falhou", sc, e?.body ?? String(e));
        }
      }
      await admin.from("dp_push_fila").update({ status: "enviado", processado_em: new Date().toISOString() }).eq("id", it.fila_id);
    } catch (e) {
      await admin.from("dp_push_fila").update({ status: "erro", erro: String(e).slice(0, 500), processado_em: new Date().toISOString() }).eq("id", it.fila_id);
    }
  }
  return json({ processados: (itens ?? []).length, enviados });
});
