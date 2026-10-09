// Contratação e alterações de assinatura no modelo v2.
// Valor sempre recalculado no banco; credenciais do Asaas pelo asaas_env do registro;
// só dono/administrador da empresa (ou titular da conta / super admin).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { requireUser, serviceClient } from "../_shared/authz.ts";
import {
  BillingError, cancelarAgendamento, cancelarFimCiclo, carregarConta, contratar, contratarAdicional,
  exigirModoPermitido, trocarPlano, type Criados,
} from "../_shared/billing-v2.ts";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ciclo = z.enum(["mensal", "anual"]);
const forma = z.enum(["pix", "boleto", "cartao"]);
const Body = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("contratar"), company_id: z.string().uuid(), plano: z.string().min(3).max(60), ciclo, forma,
    parcelas: z.number().int().min(1).max(12).optional(),
    adicionais: z.array(z.object({ code: z.string().max(40), qtd: z.number().int().min(1).max(500) })).max(10).optional() }),
  z.object({ acao: z.literal("adicional"), company_id: z.string().uuid(), subscription_id: z.string().uuid(), code: z.string().max(40), qtd: z.number().int().min(1).max(500) }),
  z.object({ acao: z.literal("trocar_plano"), company_id: z.string().uuid(), subscription_id: z.string().uuid(), plano: z.string().min(3).max(60), ciclo, forma: forma.default("pix") }),
  z.object({ acao: z.literal("cancelar_agendamento"), company_id: z.string().uuid(), subscription_id: z.string().uuid() }),
  z.object({ acao: z.literal("cancelar_fim_ciclo"), company_id: z.string().uuid(), subscription_id: z.string().uuid(), desfazer: z.boolean().optional() }),
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);
  try {
    const user = await requireUser(req);
    if (!user) return json({ error: "Faça login novamente." }, 401);
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: "Pedido inválido", detalhes: parsed.error.flatten().fieldErrors }, 400);
    const b = parsed.data;
    const admin = serviceClient();

    // Autorização: dono/owner/admin da empresa, ou super admin
    const [{ data: comp }, { data: mem }, { data: sa }] = await Promise.all([
      admin.from("companies").select("id,user_id").eq("id", b.company_id).maybeSingle(),
      admin.from("company_members").select("role").eq("company_id", b.company_id).eq("user_id", user.id).maybeSingle(),
      admin.rpc("is_super_admin", { _user_id: user.id }),
    ]);
    if (!comp) return json({ error: "Empresa não encontrada." }, 404);
    const podeGerir = comp.user_id === user.id || ["owner", "admin"].includes(String(mem?.role ?? "")) || sa === true;
    if (!podeGerir) return json({ error: "Somente o dono ou um administrador da empresa pode contratar." }, 403);

    const { data: vinc } = await admin.from("billing_account_companies").select("billing_account_id")
      .eq("company_id", b.company_id).is("removed_at", null).maybeSingle();
    if (!vinc) return json({ error: "Empresa sem conta de cobrança." }, 422);
    const conta = await carregarConta(admin, vinc.billing_account_id);
    await exigirModoPermitido(admin, conta);

    const { data: au } = await admin.auth.admin.getUserById(user.id);
    const criados: Criados = [];

    if (b.acao === "contratar") {
      const r = await contratar(admin, conta, au?.user?.email ?? "", b.company_id, b, criados);
      return json({ ok: true, ...r, asaas: criados });
    }

    const { data: sub } = await admin.from("subscriptions").select("*").eq("id", b.subscription_id).maybeSingle();
    if (!sub || sub.billing_account_id !== conta.id) return json({ error: "Assinatura não pertence a esta empresa." }, 403);
    if (sub.asaas_env !== conta.asaas_env) return json({ error: "Ambiente divergente." }, 409);

    let r: unknown;
    if (b.acao === "adicional") r = await contratarAdicional(admin, sub, b.code, b.qtd, criados);
    else if (b.acao === "trocar_plano") r = await trocarPlano(admin, sub, b.plano, b.ciclo, b.forma, criados);
    else if (b.acao === "cancelar_agendamento") r = await cancelarAgendamento(admin, sub);
    else r = await cancelarFimCiclo(admin, sub, b.desfazer);
    return json({ ok: true, resultado: r, asaas: criados });
  } catch (e) {
    if (e instanceof BillingError) return json({ error: e.message, detalhes: e.detalhes }, e.status);
    console.error("billing-v2-contratar", e);
    return json({ error: "Não foi possível concluir agora. Tente novamente em instantes." }, 500);
  }
});
