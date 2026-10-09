// Contratação e alterações de assinatura no modelo v2.
// Valor sempre recalculado no banco; credenciais do Asaas pelo asaas_env do registro;
// só dono/administrador da empresa (ou titular da conta / super admin).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { requireUser, serviceClient } from "../_shared/authz.ts";
import {
  BillingError, cancelarAgendamento, cancelarFimCiclo, carregarConta, contratar, contratarAdicional,
  cotar, exigirModoPermitido, opcoesParcelamento, trocarPlano, type Criados,
} from "../_shared/billing-v2.ts";
import { aplicarPendentes, configurarNfseAssinatura } from "../_shared/billing-v2-ciclo.ts";
import { asaasFetch } from "../_shared/asaas.ts";

function docValido(d: string): boolean {
  if (/^(\d)\1+$/.test(d)) return false;
  const calc = (b: string, pesos: number[]) => { const r = b.split("").reduce((t, x, i) => t + Number(x) * pesos[i], 0) % 11; return r < 2 ? 0 : 11 - r; };
  if (d.length === 11) {
    const p1 = [10, 9, 8, 7, 6, 5, 4, 3, 2], p2 = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
    const dv = (b: string, p: number[]) => { const r = (b.split("").reduce((t, x, i) => t + Number(x) * p[i], 0) * 10) % 11; return r === 10 ? 0 : r; };
    return dv(d.slice(0, 9), p1) === Number(d[9]) && dv(d.slice(0, 10), p2) === Number(d[10]);
  }
  if (d.length === 14) {
    const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    return calc(d.slice(0, 12), w1) === Number(d[12]) && calc(d.slice(0, 13), w2) === Number(d[13]);
  }
  return false;
}

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ciclo = z.enum(["mensal", "anual"]);
const forma = z.enum(["pix", "boleto", "cartao"]);
const Body = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("contratar"), company_id: z.string().uuid(), plano: z.string().min(3).max(60), ciclo, forma,
    parcelas: z.number().int().min(1).max(12).optional(), modo: z.enum(["empresa", "grupo"]).optional(),
    // valor vindo do navegador é ignorado: o servidor sempre recalcula
    valor_cents: z.number().optional(),
    adicionais: z.array(z.object({ code: z.string().max(40), qtd: z.number().int().min(1).max(500) })).max(10).optional(),
    empresas: z.array(z.string().uuid()).min(2).max(50).optional(),
    pagador: z.object({
      documento: z.string().transform((s) => s.replace(/\D/g, "")).refine((s) => s.length === 11 || s.length === 14, "CPF/CNPJ inválido"),
      email: z.string().trim().email().max(255),
    }).optional() }),
  z.object({ acao: z.literal("adicional"), company_id: z.string().uuid(), subscription_id: z.string().uuid(), code: z.string().max(40), qtd: z.number().int().min(1).max(500) }),
  z.object({ acao: z.literal("trocar_plano"), company_id: z.string().uuid(), subscription_id: z.string().uuid(), plano: z.string().min(3).max(60), ciclo, forma: forma.default("pix") }),
  z.object({ acao: z.literal("cancelar_agendamento"), company_id: z.string().uuid(), subscription_id: z.string().uuid() }),
  z.object({ acao: z.literal("parcelamento"), company_id: z.string().uuid(), plano: z.string().min(3).max(60),
    adicionais: z.array(z.object({ code: z.string().max(40), qtd: z.number().int().min(1).max(500) })).max(10).optional() }),
  z.object({ acao: z.literal("atualizar_pagador"), company_id: z.string().uuid(),
    documento: z.string().transform((s) => s.replace(/\D/g, "")), email: z.string().trim().email().max(255) }),
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
    let conta = await carregarConta(admin, vinc.billing_account_id);
    await exigirModoPermitido(admin, conta);

    if (b.acao === "atualizar_pagador") {
      if (!docValido(b.documento)) return json({ error: "CPF/CNPJ inválido. Confira os números e tente novamente." }, 422);
      const antes = { documento_pagador: conta.documento_pagador, email_cobranca: conta.email_cobranca };
      if (conta.asaas_customer_id) {
        try {
          await asaasFetch(`/customers/${conta.asaas_customer_id}`, { method: "POST", body: JSON.stringify({ cpfCnpj: b.documento, email: b.email }) }, conta.asaas_env);
        } catch (e) {
          return json({ error: "O Asaas recusou os novos dados do pagador. Nada foi alterado.", detalhes: String((e as Error).message) }, 422);
        }
      }
      await admin.from("billing_accounts").update({ documento_pagador: b.documento, email_cobranca: b.email }).eq("id", conta.id);
      await admin.from("billing_account_events").insert({ billing_account_id: conta.id, tipo_evento: "pagador_atualizado", actor_id: user.id,
        payload: { antes, depois: { documento_pagador: b.documento, email_cobranca: b.email }, asaas_atualizado: !!conta.asaas_customer_id } });
      return json({ ok: true, asaas_atualizado: !!conta.asaas_customer_id });
    }

    const { data: au } = await admin.auth.admin.getUserById(user.id);
    const criados: Criados = [];

    if (b.acao === "parcelamento") {
      const q = await cotar(admin, conta.id, [{ plano: b.plano, empresas: 1, adicionais: b.adicionais ?? [] }], "anual");
      return json({ ok: true, anual_cents: q.total_ciclo_cents, opcoes: await opcoesParcelamento(admin, q.total_ciclo_cents) });
    }
    if (b.acao === "contratar") {
      if (b.valor_cents !== undefined) console.warn("billing-v2-contratar: valor do navegador ignorado", b.valor_cents);
      // Dados do pagador: gravados só enquanto o cliente ainda não existe no Asaas
      if (b.pagador && !conta.asaas_customer_id) {
        await admin.from("billing_accounts").update({ documento_pagador: b.pagador.documento, email_cobranca: b.pagador.email }).eq("id", conta.id);
        conta.documento_pagador = b.pagador.documento; conta.email_cobranca = b.pagador.email;
      }
      // Grupo escolhido pelo cliente: cria/converte a conta de grupo só com as empresas selecionadas
      if (b.modo === "grupo" && b.empresas?.length) {
        if (!b.empresas.includes(b.company_id)) return json({ error: "A empresa atual precisa estar no grupo." }, 422);
        const { data: plano } = await admin.from("plans").select("module").eq("slug", b.plano).maybeSingle();
        if (!plano) return json({ error: "Plano indisponível." }, 422);
        // o plano precisa permitir essa quantidade de empresas ANTES de mexer em qualquer conta
        await cotar(admin, conta.id, [{ plano: b.plano, empresas: b.empresas.length, adicionais: b.adicionais ?? [] }], b.ciclo);
        for (const cid of b.empresas.filter((c) => c !== b.company_id)) {
          const [{ data: c2 }, { data: m2 }, { data: v2 }] = await Promise.all([
            admin.from("companies").select("id,user_id").eq("id", cid).maybeSingle(),
            admin.from("company_members").select("role").eq("company_id", cid).eq("user_id", user.id).maybeSingle(),
            admin.from("billing_account_companies").select("billing_account_id").eq("company_id", cid).is("removed_at", null).maybeSingle(),
          ]);
          if (!c2 || !(c2.user_id === user.id || ["owner", "admin"].includes(String(m2?.role ?? "")) || sa === true)) return json({ error: "Você não gerencia uma das empresas escolhidas." }, 403);
          if (v2 && v2.billing_account_id !== conta.id) {
            const outra = await carregarConta(admin, v2.billing_account_id);
            if (outra.asaas_env !== conta.asaas_env) return json({ error: "Empresas em ambientes de cobrança diferentes." }, 409);
            const { data: ocup } = await admin.from("subscriptions").select("id").eq("billing_account_id", outra.id).eq("module", plano.module)
              .in("status", ["active", "trialing", "past_due", "pending", "grace"]).limit(1);
            if (ocup?.length) return json({ error: "Uma das empresas já tem assinatura deste módulo. Cancele-a ou use a troca de plano antes de agrupar." }, 409);
          }
        }
        const { data: ba0 } = await admin.from("billing_accounts").select("tipo").eq("id", conta.id).single();
        for (const cid of b.empresas.filter((c) => c !== b.company_id)) {
          const { data: v2 } = await admin.from("billing_account_companies").select("billing_account_id").eq("company_id", cid).is("removed_at", null).maybeSingle();
          if (v2?.billing_account_id === conta.id) continue;
          const { error: eAdd } = await admin.rpc("billing_v2_add_company_to_account", { _account: conta.id, _company: cid, _actor: user.id });
          if (eAdd) return json({ error: "Não foi possível montar o grupo.", detalhes: eAdd.message }, 422);
          if (v2) await admin.from("billing_account_events").insert({ billing_account_id: v2.billing_account_id, tipo_evento: "empresa_movida_para_grupo", actor_id: user.id, payload: { company_id: cid, grupo: conta.id } });
        }
        await admin.from("billing_accounts").update({ tipo: "grupo" }).eq("id", conta.id);
        await admin.from("billing_account_events").insert({ billing_account_id: conta.id, tipo_evento: (ba0 as any)?.tipo === "grupo" ? "grupo_atualizado_pelo_cliente" : "conta_convertida_grupo",
          actor_id: user.id, payload: { empresas: b.empresas, plano: b.plano, origem: "checkout" } });
        conta = await carregarConta(admin, conta.id);
      }
      const r = await contratar(admin, conta, au?.user?.email ?? "", b.company_id, b, criados);
      try {
        const { data: subN } = await admin.from("subscriptions").select("*").eq("id", r.subscription_id).single();
        if (await configurarNfseAssinatura(admin, subN)) criados.push({ tipo: "nota fiscal automática", id: subN.external_subscription_id, descricao: "emissão na confirmação do pagamento" });
      } catch (e) { console.warn("nfse automática não configurada", (e as Error).message); }
      return json({ ok: true, ...r, asaas: criados });
    }

    const { data: sub } = await admin.from("subscriptions").select("*").eq("id", b.subscription_id).maybeSingle();
    if (!sub || sub.billing_account_id !== conta.id) return json({ error: "Assinatura não pertence a esta empresa." }, 403);
    if (sub.asaas_env !== conta.asaas_env) return json({ error: "Ambiente divergente." }, 409);

    let r: unknown;
    if (b.acao === "adicional") {
      r = await contratarAdicional(admin, sub, b.code, b.qtd, criados);
      (r as any).pendencias = await aplicarPendentes(admin, sub.id, criados);
    }
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
