// Bateria de testes a)–l) da Fase 3 no Sandbox do Asaas.
// Cria contas/empresas/usuários "[TESTE]" marcados como sandbox, executa os
// fluxos pelas funções reais (com login real), lista o que ficou no Sandbox do
// Asaas e desfaz TODOS os registros locais. Só por x-cron-secret.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { serviceClient } from "../_shared/authz.ts";
import { secretMatches } from "../_shared/secret.ts";
import { asaasFetch } from "../_shared/asaas.ts";
import { conciliar, solicitarNfse } from "../_shared/billing-v2-ciclo.ts";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b, null, 1), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function cnpj(): string {
  const n = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).concat([0, 0, 0, 1]);
  const dv = (base: number[]) => {
    const w = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = base.reduce((s, d, i) => s + d * w[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  n.push(dv(n)); n.push(dv(n));
  return n.join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!secretMatches(req.headers.get("x-cron-secret"), Deno.env.get("PLUGGY_CRON_SECRET"))) return json({ error: "Forbidden" }, 403);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const cron = Deno.env.get("PLUGGY_CRON_SECRET")!;
  const admin = serviceClient();
  const rnd = crypto.randomUUID().slice(0, 8);
  const testes: Record<string, { status: "aprovado" | "reprovado"; observado: string }> = {};
  const asaas: { tipo: string; id: string; descricao: string }[] = [];
  const limpeza: string[] = [];
  const userIds: string[] = [];
  const emails: string[] = [];
  const companyIds: string[] = [];
  const body = await req.json().catch(() => ({})) as Record<string, any>;
  let manter = false; // o_preparar: mantém a massa para a verificação posterior
  const reg = (k: string, ok: boolean, obs: string) => { testes[k] = { status: ok ? "aprovado" : "reprovado", observado: obs }; };

  const call = async (token: string, body: unknown) => {
    const r = await fetch(`${url}/functions/v1/billing-v2-contratar`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    for (const a of j?.asaas ?? []) asaas.push(a);
    return { status: r.status, j };
  };
  const renovar = async () => {
    const r = await fetch(`${url}/functions/v1/billing-v2-renovacao`, {
      method: "POST", headers: { "x-cron-secret": cron, "Content-Type": "application/json" }, body: JSON.stringify({ somente_teste: true }),
    });
    return await r.json();
  };
  const snapProd = async () => {
    const { data } = await admin.from("subscriptions").select("id,plan_id,status,pending_plan_change,updated_at,cancel_at_period_end").eq("asaas_env", "production").order("id");
    return JSON.stringify(data);
  };

  let antesProd = "";
  try {
    antesProd = await snapProd();
    if (body.modo === "limpar") {
      emails.push(...(body.emails ?? [])); userIds.push(...(body.userIds ?? [])); companyIds.push(...(body.companyIds ?? []));
      reg("limpeza", true, "massa removida");
    } else if (body.modo === "o_verificar") {
      // fase 2 do teste o): confere após o processador rodar e limpa a massa
      emails.push(...(body.emails ?? [])); userIds.push(...(body.userIds ?? [])); companyIds.push(...(body.companyIds ?? []));
      const { data: evs } = await admin.from("asaas_webhook_events").select("status,processed_at,asaas_env,attempt_count").eq("event_id", body.evId);
      const { data: inv } = await admin.from("invoices").select("status,paid_at").eq("id", body.invoice_id).single();
      const { data: s } = await admin.from("subscriptions").select("status,grace_ends_at").eq("id", body.subscription_id).single();
      const { data: gr } = await admin.from("subscription_grants").select("tipo,ends_at,revoked_at").eq("subscription_id", body.subscription_id).eq("tipo", "carencia");
      const hook = () => fetch(`${url}/functions/v1/asaas-webhook`, { method: "POST", headers: { "asaas-access-token": Deno.env.get("ASAAS_SANDBOX_WEBHOOK_TOKEN")!, "Content-Type": "application/json" }, body: body.corpo }).then((r) => r.status);
      const o3 = await hook();
      const { count: n2 } = await admin.from("asaas_webhook_events").select("id", { count: "exact", head: true }).eq("event_id", body.evId);
      const carenciaFim = (gr ?? []).every((g: any) => g.revoked_at || (g.ends_at && new Date(g.ends_at) <= new Date()));
      reg("o", (evs ?? []).length === 1 && n2 === 1 && !!evs![0].processed_at && evs![0].asaas_env === "sandbox" && inv?.status === "paid" && s?.status === "active" && carenciaFim,
        `eventos gravados: ${(evs ?? []).length} (após 3º envio: ${n2}, HTTP ${o3}); status ${evs?.[0]?.status}, tentativas ${evs?.[0]?.attempt_count}, processado ${evs?.[0]?.processed_at}; fatura ${inv?.status} em ${inv?.paid_at}; assinatura ${s?.status}; carência ${carenciaFim ? "encerrada" : "ainda vigente"} ${JSON.stringify(gr)}`);
      await admin.from("asaas_webhook_events").delete().eq("event_id", body.evId);
    } else {
    // ---------- 1. massa de teste ----------
    const senha = crypto.randomUUID() + "Aa1!";
    const mkUser = async (papel: string) => {
      const { data, error } = await admin.auth.admin.createUser({
        email: `teste.billing.${papel}.${rnd}@aveto360.com`, password: senha, email_confirm: true,
        user_metadata: { full_name: `[TESTE] ${papel.toUpperCase()}` },
      });
      if (error) throw new Error(`criar usuário: ${error.message}`);
      userIds.push(data.user.id); emails.push(data.user.email!);
      const c = createClient(url, anon, { auth: { persistSession: false } });
      const { data: s, error: e2 } = await c.auth.signInWithPassword({ email: data.user.email!, password: senha });
      if (e2) throw new Error(`login teste: ${e2.message}`);
      return { id: data.user.id, token: s.session!.access_token };
    };
    const dono = await mkUser("dono");
    const estranho = await mkUser("estranho");
    // remove os testes grátis criados automaticamente no cadastro dos usuários de teste
    const { error: ePur } = await admin.rpc("billing_v2_qa_purge", { _emails: emails });
    if (ePur) throw new Error(`limpar trial: ${ePur.message}`);

    const mkCompany = async (nome: string) => {
      const { data, error } = await admin.from("companies").insert({ user_id: dono.id, name: `[TESTE] ${nome} ${rnd.toUpperCase()} LTDA`, cnpj: cnpj() }).select("id,cnpj").single();
      if (error) throw new Error(`criar empresa: ${error.message}`);
      companyIds.push(data.id);
      return data;
    };
    const A1 = await mkCompany("EMPRESA A1"); const A2 = await mkCompany("EMPRESA A2"); const B1 = await mkCompany("EMPRESA B1");

    const contaDe = async (cid: string) => (await admin.from("billing_account_companies").select("billing_account_id").eq("company_id", cid).is("removed_at", null).single()).data!.billing_account_id as string;
    const accA = await contaDe(A1.id); const accA2 = await contaDe(A2.id); const accB = await contaDe(B1.id);
    await admin.from("billing_accounts").update({ tipo: "grupo" }).eq("id", accA);
    if (accA2 !== accA) {
      await admin.from("billing_account_companies").update({ removed_at: new Date().toISOString() }).eq("company_id", A2.id).is("removed_at", null);
      const { error: eMv } = await admin.from("billing_account_companies").insert({ billing_account_id: accA, company_id: A2.id });
      if (eMv) throw new Error(`mover empresa A2: ${eMv.message}`);
    }
    const { error: eMark } = await admin.from("billing_accounts").update({ asaas_env: "sandbox", is_test: true })
      .eq("titular_user_id", dono.id);
    if (eMark) throw new Error(`marcar sandbox: ${eMark.message}`);
    await admin.from("billing_accounts").update({ tipo: "grupo", nome: `[TESTE] GRUPO A ${rnd.toUpperCase()}`, documento_pagador: A1.cnpj }).eq("id", accA);
    await admin.from("billing_accounts").update({ nome: `[TESTE] EMPRESA B1 ${rnd.toUpperCase()}`, documento_pagador: B1.cnpj }).eq("id", accB);

    const ativar = async (subId: string) => {
      const { data: inv } = await admin.from("invoices").select("id,external_invoice_id,amount_cents").eq("subscription_id", subId).eq("status", "open");
      for (const i of inv ?? []) {
        try { await asaasFetch(`/payments/${i.external_invoice_id}/receiveInCash`, { method: "POST", body: JSON.stringify({ paymentDate: new Date().toISOString().slice(0, 10), value: i.amount_cents / 100, notifyCustomer: false }) }, "sandbox"); } catch (_) { /* parcelado: pagamento simulado só local */ }
        await admin.from("invoices").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", i.id);
      }
      await admin.from("subscriptions").update({ status: "active" }).eq("id", subId);
    };
    const sub = async (id: string) => (await admin.from("subscriptions").select("*, plans:plan_id(slug)").eq("id", id).single()).data as any;

    if (body.modo === "u_preparar") {
      manter = true;
      const U1 = await mkCompany("EMPRESA U1");
      const accU = await contaDe(U1.id);
      await admin.from("billing_accounts").update({ asaas_env: "sandbox", is_test: true, nome: `[TESTE] EMPRESA U1 ${rnd.toUpperCase()}`, documento_pagador: U1.cnpj }).eq("id", accU);
      const u0 = await call(dono.token, { acao: "contratar", company_id: U1.id, plano: "financeiro-multiempresa", ciclo: "mensal", forma: "pix" });
      const sid = u0.j?.subscription_id; if (!sid) throw new Error("u: contratar " + JSON.stringify(u0.j));
      await ativar(sid);
      await admin.from("subscriptions").update({ current_period_start: new Date(Date.now() - 29 * 86400000).toISOString(), current_period_end: new Date(Date.now() + 1 * 86400000).toISOString() }).eq("id", sid);
      const u1 = await call(dono.token, { acao: "adicional", company_id: U1.id, subscription_id: sid, code: "usuarios", qtd: 1 });
      const u2 = await call(dono.token, { acao: "trocar_plano", company_id: U1.id, subscription_id: sid, plano: "financeiro-gestao", ciclo: "mensal" });
      const so = await sub(sid);
      const { data: ads } = await admin.from("subscription_addons").select("prorata_cents,prorata_billed_at").eq("subscription_id", sid);
      const { data: invs } = await admin.from("invoices").select("status,amount_cents,due_date").eq("subscription_id", sid);
      // usuário dono com senha conhecida só para o navegador de teste
      return json({ preparado: true, email: emails[0], senha, company_id: U1.id, subscription_id: sid, adicional: u1.j?.resultado ?? u1.j, troca: u2.j?.resultado ?? u2.j,
        pending: so.pending_plan_change, addons: ads, invoices: invs, emails, userIds, companyIds, asaas });
    }
    if (body.modo === "t_preparar") {
      // t): duas empresas [TESTE] em Sandbox, sem pagador cadastrado (preenchido no checkout)
      manter = true;
      const out: Record<string, string> = {};
      for (const k of ["T1", "T2"]) {
        const c = await mkCompany(`EMPRESA ${k}`);
        const acc = await contaDe(c.id);
        await admin.from("billing_accounts").update({ asaas_env: "sandbox", is_test: true, nome: `[TESTE] EMPRESA ${k} ${rnd.toUpperCase()}`, documento_pagador: null }).eq("id", acc);
        out[k] = c.id; out[`${k}_cnpj`] = c.cnpj;
      }
      return json({ preparado: true, email: emails[0], senha, ...out, emails, userIds, companyIds });
    }
    if (body.modo === "o_preparar") {
      manter = true;
      const O1 = await mkCompany("EMPRESA O1");
      const accO = await contaDe(O1.id);
      await admin.from("billing_accounts").update({ asaas_env: "sandbox", is_test: true, nome: `[TESTE] EMPRESA O1 ${rnd.toUpperCase()}`, documento_pagador: O1.cnpj }).eq("id", accO);
      const c0 = await call(dono.token, { acao: "contratar", company_id: O1.id, plano: "financeiro-gestao", ciclo: "mensal", forma: "pix" });
      const sid = c0.j?.subscription_id; if (!sid) throw new Error("o: contratar " + JSON.stringify(c0.j));
      const so = await sub(sid);
      // assinatura em carência aguardando o pagamento
      await admin.from("subscriptions").update({ status: "grace", grace_ends_at: new Date(Date.now() + 3 * 86400000).toISOString() }).eq("id", sid);
      await admin.from("subscription_grants").insert({ subscription_id: sid, tipo: "carencia", motivo_codigo: "outro", motivo_texto: "[TESTE] carência o)", ends_at: new Date(Date.now() + 3 * 86400000).toISOString(), granted_by: dono.id });
      const { data: invO } = await admin.from("invoices").select("id,external_invoice_id,amount_cents").eq("subscription_id", sid).limit(1).single();
      try { await asaasFetch(`/payments/${invO!.external_invoice_id}/receiveInCash`, { method: "POST", body: JSON.stringify({ paymentDate: new Date().toISOString().slice(0, 10), value: invO!.amount_cents / 100, notifyCustomer: false }) }, "sandbox"); } catch (_) { /* */ }
      const evId = `evt_teste_${rnd}`;
      const corpo = JSON.stringify({ id: evId, event: "PAYMENT_CONFIRMED", payment: { id: invO!.external_invoice_id, subscription: so?.external_subscription_id, value: invO!.amount_cents / 100, status: "CONFIRMED", billingType: "PIX", externalReference: sid } });
      const hook = () => fetch(`${url}/functions/v1/asaas-webhook`, { method: "POST", headers: { "asaas-access-token": Deno.env.get("ASAAS_SANDBOX_WEBHOOK_TOKEN")!, "Content-Type": "application/json" }, body: corpo }).then((r) => r.status);
      const h1 = await hook(); await new Promise((r) => setTimeout(r, 1500)); const h2 = await hook();
      const { count } = await admin.from("asaas_webhook_events").select("id", { count: "exact", head: true }).eq("event_id", evId);
      return json({ preparado: true, envios: [h1, h2], gravados: count, evId, corpo, invoice_id: invO!.id, subscription_id: sid, emails, userIds, companyIds, asaas });
    }

    if (body.modo === "final") {
      const brl = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",")}`;
      const ciclo = (b: Record<string, unknown>) => fetch(`${url}/functions/v1/billing-v2-ciclo`, { method: "POST",
        headers: { "x-cron-secret": cron, "Content-Type": "application/json" }, body: JSON.stringify({ somente_teste: true, ...b }) }).then((r) => r.json());
      const marcar = async () => { await admin.from("billing_accounts").update({ asaas_env: "sandbox", is_test: true }).eq("titular_user_id", dono.id); };
      const prep = async (nome: string) => {
        const c = await mkCompany(nome); const acc = await contaDe(c.id);
        await marcar();
        await admin.from("billing_accounts").update({ nome: `[TESTE] ${nome} ${rnd.toUpperCase()}`, documento_pagador: c.cnpj }).eq("id", acc);
        return { ...c, acc };
      };
      const hookSb = (corpo: unknown) => fetch(`${url}/functions/v1/asaas-webhook`, { method: "POST", headers: { "asaas-access-token": Deno.env.get("ASAAS_SANDBOX_WEBHOOK_TOKEN")!, "Content-Type": "application/json" }, body: JSON.stringify(corpo) }).then((r) => r.status);
      const worker = () => fetch(`${url}/functions/v1/asaas-webhook-worker`, { method: "POST", headers: { "x-worker-secret": cron, "Content-Type": "application/json" }, body: "{}" }).then((r) => r.status);
      const esperarEvento = async (evId: string) => {
        for (let i = 0; i < 12; i++) {
          await worker();
          const { data } = await admin.from("asaas_webhook_events").select("processed_at,status,last_error").eq("event_id", evId).maybeSingle();
          if (data?.processed_at || data?.status === "failed") return data;
          await new Promise((r) => setTimeout(r, 4000));
        }
        return null;
      };
      const evIds: string[] = [];

      // ---- v) excedentes: 25 CLT + 1 intermitente sem convocação no Pessoas Multiempresa (franquia 20)
      if (!body.so || body.so === "v") try {
        const V = await prep("EMPRESA V1");
        const cols = Array.from({ length: 25 }, (_, i) => ({ company_id: V.id, nome: `[TESTE] COLABORADOR ${i + 1}`, regime: "clt", ativo: true }));
        cols.push({ company_id: V.id, nome: "[TESTE] INTERMITENTE SEM CONVOCACAO", regime: "intermitente", ativo: true });
        const { error: eC } = await admin.from("dp_colaboradores").insert(cols as any);
        if (eC) throw new Error("colaboradores: " + eC.message);
        const v0 = await call(dono.token, { acao: "contratar", company_id: V.id, plano: "pessoas-multiempresa", ciclo: "mensal", forma: "pix" });
        const sv = v0.j?.subscription_id; if (!sv) throw new Error("v contratar " + JSON.stringify(v0.j));
        await admin.from("subscriptions").update({ status: "active" }).eq("id", sv); // 1ª mensalidade segue em aberto = próxima fatura
        const { data: inv0 } = await admin.from("invoices").select("id,amount_cents,external_invoice_id").eq("subscription_id", sv).eq("status", "open").single();
        const compAtual = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 7) + "-01";
        const r = await ciclo({ etapas: ["excedentes"], contas: [V.acc], competencia: compAtual });
        const r2 = await ciclo({ etapas: ["excedentes"], contas: [V.acc], competencia: compAtual }); // idempotência
        const { data: ex } = await admin.from("billing_v2_excedentes").select("*").eq("subscription_id", sv);
        const { data: inv1 } = await admin.from("invoices").select("amount_cents,notes").eq("id", inv0!.id).single();
        const { data: its } = await admin.from("invoice_items").select("module,quantity,unit_price_cents,total_cents").eq("invoice_id", inv0!.id);
        const pa = await asaasFetch(`/payments/${inv0!.external_invoice_id}`, {}, "sandbox");
        const e0 = ex?.[0];
        reg("v", ex?.length === 1 && e0.contados === 25 && e0.limite === 20 && e0.excedente === 5 && e0.valor_cents === 9950 && e0.detalhe.variaveis_fora === 1
          && inv1!.amount_cents === inv0!.amount_cents + 9950 && Math.round(pa.value * 100) === inv0!.amount_cents + 9950,
          `contados ${e0?.contados} (CLT ${e0?.detalhe?.regulares}; intermitente sem convocação fora: ${e0?.detalhe?.variaveis_fora}); franquia ${e0?.limite}; excedente ${e0?.excedente} × ${brl(e0?.valor_unit_cents ?? 0)} = ${brl(e0?.valor_cents ?? 0)} (${e0?.forma}); próxima fatura ${brl(inv0!.amount_cents)} → ${brl(inv1!.amount_cents)} (no Asaas ${brl(Math.round(pa.value * 100))}); itens ${JSON.stringify(its)}; 2ª rodada: ${JSON.stringify((r2 as any).excedentes?.apuradas?.[0]?.ja_apurado)}; ${JSON.stringify((r as any).excedentes?.apuradas?.[0]?.erro ?? "")}`);
      } catch (e) { reg("v", false, String((e as Error).message)); }

      // ---- pró-rata pequena (< R$ 5,00) somada quando o Asaas gera a próxima mensalidade
      if (!body.so || body.so === "p4") try {
        const P = await prep("EMPRESA P4");
        const p0 = await call(dono.token, { acao: "contratar", company_id: P.id, plano: "pessoas-gestao", ciclo: "mensal", forma: "pix" });
        const sp = p0.j?.subscription_id; if (!sp) throw new Error("p4 contratar " + JSON.stringify(p0.j));
        await ativar(sp);
        await admin.from("subscriptions").update({ current_period_start: new Date(Date.now() - 29 * 86400000).toISOString(), current_period_end: new Date(Date.now() + 1 * 86400000).toISOString() }).eq("id", sp);
        const p1 = await call(dono.token, { acao: "adicional", company_id: P.id, subscription_id: sp, code: "usuarios", qtd: 1 });
        const { data: pend0 } = await admin.from("billing_v2_cobrancas_pendentes").select("valor_cents,cobrado_em").eq("subscription_id", sp);
        const { data: ad0 } = await admin.from("subscription_addons").select("prorata_billed_at").eq("subscription_id", sp);
        // simula o Asaas gerando a próxima mensalidade (cobrança real no Sandbox + aviso PAYMENT_CREATED)
        const so = (await admin.from("subscriptions").select("external_subscription_id,external_customer_id,monthly_price_cents").eq("id", sp).single()).data!;
        const pg = await asaasFetch("/payments", { method: "POST", body: JSON.stringify({ customer: so.external_customer_id, billingType: "PIX", value: so.monthly_price_cents / 100, dueDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10), description: "[TESTE] próxima mensalidade" }) }, "sandbox");
        asaas.push({ tipo: "cobrança (simula mensalidade)", id: pg.id, descricao: "p4" });
        const evId = `evt_p4_${rnd}`; evIds.push(evId);
        await hookSb({ id: evId, event: "PAYMENT_CREATED", payment: { id: pg.id, subscription: so.external_subscription_id, value: pg.value, status: "PENDING", billingType: "PIX", dueDate: pg.dueDate } });
        const ev = await esperarEvento(evId);
        const { data: pend1 } = await admin.from("billing_v2_cobrancas_pendentes").select("valor_cents,cobrado_em,invoice_id").eq("subscription_id", sp);
        const { data: ad1 } = await admin.from("subscription_addons").select("prorata_billed_at").eq("subscription_id", sp);
        const pa = await asaasFetch(`/payments/${pg.id}`, {}, "sandbox");
        const pr = pend0?.[0]?.valor_cents ?? 0;
        reg("p4", p1.j?.resultado?.prorata_cobranca === "proxima_mensalidade" && pr > 0 && pr < 500 && !pend0![0].cobrado_em && !ad0![0].prorata_billed_at
          && !!pend1![0].cobrado_em && !!ad1![0].prorata_billed_at && Math.round(pa.value * 100) === so.monthly_price_cents + pr,
          `pró-rata ${brl(pr)} ficou pendente (não marcada como cobrada) até o Asaas gerar a mensalidade; aviso processado: ${!!ev?.processed_at}; mensalidade no Asaas ${brl(so.monthly_price_cents)} → ${brl(Math.round(pa.value * 100))}; marcada como cobrada em ${pend1?.[0]?.cobrado_em}`);
      } catch (e) { reg("p4", false, String((e as Error).message)); }

      // ---- w) NFS-e: ligada só para a conta [TESTE] (parâmetro global continua 'desligado')
      if (!body.so || body.so === "w") try {
        const { data: glob } = await admin.from("system_parameters").select("value").eq("key", "emitir_nfse").single();
        const W = await prep("EMPRESA W1");
        await admin.from("billing_accounts").update({ emitir_nfse: true }).eq("id", W.acc);
        const w0 = await call(dono.token, { acao: "contratar", company_id: W.id, plano: "financeiro-gestao", ciclo: "mensal", forma: "pix" });
        const sw = w0.j?.subscription_id; if (!sw) throw new Error("w contratar " + JSON.stringify(w0.j));
        const { data: invW } = await admin.from("invoices").select("id,external_invoice_id,amount_cents").eq("subscription_id", sw).eq("status", "open").single();
        try { await asaasFetch(`/payments/${invW!.external_invoice_id}/receiveInCash`, { method: "POST", body: JSON.stringify({ paymentDate: new Date().toISOString().slice(0, 10), value: invW!.amount_cents / 100, notifyCustomer: false }) }, "sandbox"); } catch (_) { /* */ }
        const evId = `evt_w_${rnd}`; evIds.push(evId);
        await hookSb({ id: evId, event: "PAYMENT_CONFIRMED", payment: { id: invW!.external_invoice_id, value: invW!.amount_cents / 100, status: "CONFIRMED", billingType: "PIX" } });
        const ev = await esperarEvento(evId);
        const { data: nf } = await admin.from("billing_v2_nfse_solicitacoes").select("*").eq("invoice_id", invW!.id).maybeSingle();
        // fatura zero
        const { data: z } = await admin.from("invoices").insert({ subscription_id: sw, user_id: dono.id, billing_account_id: W.acc, amount_cents: 0, status: "paid", paid_at: new Date().toISOString(), due_date: new Date().toISOString().slice(0, 10), external_invoice_id: `zero_${rnd}`, notes: "[TESTE] fatura zero", asaas_env: "sandbox" }).select("*").single();
        const rz = await solicitarNfse(admin, z, "sandbox");
        // conta sem a exceção: segue o global desligado
        const N = await prep("EMPRESA W2");
        const { data: zn } = await admin.from("invoices").insert({ user_id: dono.id, billing_account_id: N.acc, amount_cents: 1000, status: "paid", paid_at: new Date().toISOString(), due_date: new Date().toISOString().slice(0, 10), external_invoice_id: `ctrl_${rnd}`, notes: "[TESTE] controle", asaas_env: "sandbox" }).select("*").single();
        const rn = await solicitarNfse(admin, zn, "sandbox");
        await admin.from("invoices").delete().eq("id", zn!.id);
        const { count: prodNf } = await admin.from("billing_v2_nfse_solicitacoes").select("id", { count: "exact", head: true }).eq("asaas_env", "production");
        reg("w", glob?.value === "desligado" && !!nf && nf.tomador_documento === W.cnpj && nf.valor_cents === invW!.amount_cents && rz.status === "nao_emitida_valor_zero" && rn.status === "desligada" && (prodNf ?? 0) === 0,
          `parâmetro global: ${JSON.stringify(glob?.value)}; aviso processado: ${!!ev?.processed_at}; solicitação para o CNPJ ${nf?.tomador_documento} (pagador ${W.cnpj}), ${brl(nf?.valor_cents ?? 0)}, status "${nf?.status}" ${nf?.asaas_invoice_id ?? ""} ${nf?.resposta ? JSON.stringify(nf.resposta).slice(0, 220) : ""}; fatura zero: ${rz.status}; outra conta sem exceção: ${rn.status}; solicitações em produção: ${prodNf}`);
        if (nf?.asaas_invoice_id) asaas.push({ tipo: "nota fiscal", id: nf.asaas_invoice_id, descricao: "w" });
      } catch (e) { reg("w", false, String((e as Error).message)); }

      // ---- x) conciliação: divergência forçada em conta [TESTE], nada é corrigido
      if (!body.so || body.so === "x") try {
        const X = await prep("EMPRESA X1");
        const x0 = await call(dono.token, { acao: "contratar", company_id: X.id, plano: "financeiro-gestao", ciclo: "mensal", forma: "pix" });
        const sx = x0.j?.subscription_id; if (!sx) throw new Error("x contratar " + JSON.stringify(x0.j));
        await admin.from("subscriptions").update({ status: "active", monthly_price_cents: 31990 }).eq("id", sx); // força valor local ≠ Asaas
        const antesSub = JSON.stringify((await admin.from("subscriptions").select("status,monthly_price_cents,plan_id").eq("id", sx).single()).data);
        const antesInv = JSON.stringify((await admin.from("invoices").select("id,status,amount_cents").eq("subscription_id", sx).order("id")).data);
        const prodAntes = await snapProd();
        const r = await ciclo({ etapas: ["conciliacao"], contas: [X.acc], detalhar: true });
        const depoisSub = JSON.stringify((await admin.from("subscriptions").select("status,monthly_price_cents,plan_id").eq("id", sx).single()).data);
        const depoisInv = JSON.stringify((await admin.from("invoices").select("id,status,amount_cents").eq("subscription_id", sx).order("id")).data);
        const { data: dv } = await admin.from("billing_v2_conciliacao_divergencias").select("tipo,local,asaas,asaas_env").eq("subscription_id", sx);
        reg("x", (dv ?? []).some((d: any) => d.tipo === "valor_assinatura" && d.local.valor_cents === 31990 && d.asaas.valor_cents === 29990) && antesSub === depoisSub && antesInv === depoisInv && prodAntes === await snapProd(),
          `divergências: ${JSON.stringify(dv)}; verificadas ${(r as any).conciliacao?.assinaturas_verificadas} assinatura(s) e ${(r as any).conciliacao?.cobrancas_verificadas} cobrança(s); assinatura e faturas sem alteração: ${antesSub === depoisSub && antesInv === depoisInv}`);
      } catch (e) { reg("x", false, String((e as Error).message)); }

      // ---- z1) Grupo com 2 empresas em contas separadas
      if (!body.so || body.so === "z1") try {
        const Z1 = await prep("EMPRESA Z1"); const Z2 = await prep("EMPRESA Z2");
        const cdono = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${dono.token}` } }, auth: { persistSession: false } });
        const { data: ger } = await cdono.rpc("billing_v2_empresas_gerenciaveis");
        const doDono = (ger as any[] ?? []).filter((g) => [Z1.id, Z2.id].includes(g.id));
        const separadas = doDono.length === 2 && doDono[0].billing_account_id !== doDono[1].billing_account_id;
        const zE = await call(dono.token, { acao: "contratar", company_id: Z1.id, plano: "financeiro-essencial", ciclo: "mensal", forma: "pix", modo: "grupo", empresas: [Z1.id, Z2.id] });
        const aindaSep = (await contaDe(Z2.id)) === Z2.acc;
        const zE2 = await call(estranho.token, { acao: "contratar", company_id: Z1.id, plano: "financeiro-gestao", ciclo: "mensal", forma: "pix", modo: "grupo", empresas: [Z1.id, Z2.id] });
        const z = await call(dono.token, { acao: "contratar", company_id: Z1.id, plano: "financeiro-gestao", ciclo: "mensal", forma: "pix", modo: "grupo", empresas: [Z1.id, Z2.id] });
        const accZ1 = await contaDe(Z1.id), accZ2 = await contaDe(Z2.id);
        const { data: baZ } = await admin.from("billing_accounts").select("tipo").eq("id", accZ1).single();
        const { data: scs } = await admin.from("subscription_companies").select("company_id").eq("subscription_id", z.j?.subscription_id ?? crypto.randomUUID()).is("removed_at", null);
        const { data: evs } = await admin.from("billing_account_events").select("tipo_evento,billing_account_id").in("billing_account_id", [Z1.acc, Z2.acc]);
        const { count: nSubs } = await admin.from("subscriptions").select("id", { count: "exact", head: true }).in("billing_account_id", [Z1.acc, Z2.acc]).eq("module", "financeiro");
        reg("z1", separadas && zE.status === 422 && aindaSep && zE2.status === 403 && z.status === 200 && accZ1 === accZ2 && baZ?.tipo === "grupo" && scs?.length === 2 && z.j.total_cents === 29990 && nSubs === 1 && (evs ?? []).some((e: any) => e.tipo_evento === "conta_convertida_grupo"),
          `antes: 2 empresas gerenciáveis em contas separadas = ${separadas} (opção Grupo aparece); Essencial em grupo: HTTP ${zE.status} "${zE.j?.error}" e empresas continuaram separadas = ${aindaSep}; usuário sem acesso: HTTP ${zE2.status}; Gestão em grupo: HTTP ${z.status}, ${brl(z.j?.total_cents ?? 0)}, mesma conta = ${accZ1 === accZ2} (tipo ${baZ?.tipo}), empresas cobertas ${scs?.length}, assinaturas do módulo ${nSubs}; eventos: ${(evs ?? []).map((e: any) => e.tipo_evento).join(", ")}`);
      } catch (e) { reg("z1", false, String((e as Error).message)); }

      // ---- z2) atualizar dados do pagador
      if (!body.so || body.so === "z2") try {
        const Y = await prep("EMPRESA Y1");
        const y0 = await call(dono.token, { acao: "contratar", company_id: Y.id, plano: "financeiro-gestao", ciclo: "mensal", forma: "pix" });
        if (!y0.j?.subscription_id) throw new Error("z2 contratar " + JSON.stringify(y0.j));
        const { data: ba0 } = await admin.from("billing_accounts").select("asaas_customer_id,documento_pagador,email_cobranca").eq("id", Y.acc).single();
        const ruim = await call(dono.token, { acao: "atualizar_pagador", company_id: Y.id, documento: "11.111.111/1111-11", email: "x@y.com" });
        const fora = await call(estranho.token, { acao: "atualizar_pagador", company_id: Y.id, documento: cnpj(), email: "x@y.com" });
        const novoDoc = cnpj(); const novoEmail = `teste.billing.pagador.${rnd}@aveto360.com`;
        const ok = await call(dono.token, { acao: "atualizar_pagador", company_id: Y.id, documento: novoDoc, email: novoEmail });
        const { data: ba1 } = await admin.from("billing_accounts").select("documento_pagador,email_cobranca").eq("id", Y.acc).single();
        const cu = await asaasFetch(`/customers/${ba0!.asaas_customer_id}`, {}, "sandbox");
        const { data: ev } = await admin.from("billing_account_events").select("tipo_evento,payload").eq("billing_account_id", Y.acc).eq("tipo_evento", "pagador_atualizado");
        reg("z2", ruim.status === 422 && fora.status === 403 && ok.status === 200 && ba1!.documento_pagador === novoDoc && ba1!.email_cobranca === novoEmail && cu.cpfCnpj === novoDoc && cu.email === novoEmail && ev?.length === 1,
          `documento inválido: HTTP ${ruim.status} "${ruim.j?.error}"; usuário sem acesso: HTTP ${fora.status}; alteração válida: HTTP ${ok.status}; local ${ba1!.documento_pagador} / ${ba1!.email_cobranca}; cliente ${ba0!.asaas_customer_id} no Asaas: ${cu.cpfCnpj} / ${cu.email}; eventos: ${ev?.length}`);
      } catch (e) { reg("z2", false, String((e as Error).message)); }

      for (const id of evIds) await admin.from("asaas_webhook_events").delete().eq("event_id", id);
      const prodDepois = await snapProd();
      reg("producao_intacta", prodDepois === antesProd, prodDepois === antesProd ? "assinaturas de produção idênticas antes/depois" : "ATENÇÃO: produção mudou durante o teste");
    } else {
    // a) contratar mensal Pix
    const a = await call(dono.token, { acao: "contratar", company_id: A1.id, plano: "financeiro-gestao", ciclo: "mensal", forma: "pix" });
    const subA = a.j?.subscription_id as string;
    const okA = a.status === 200 && a.j.total_cents === 29990 && (a.j.asaas ?? []).some((x: any) => x.tipo === "assinatura");
    reg("a", okA, `HTTP ${a.status}; total R$ ${(a.j.total_cents ?? 0) / 100}; Asaas: ${(a.j.asaas ?? []).map((x: any) => x.tipo).join(", ") || a.j.error}`);
    if (!subA) throw new Error("teste a falhou; abortando: " + JSON.stringify(a.j));
    await ativar(subA);

    // b) anual parcelado no cartão (Pessoas)
    const b = await call(dono.token, { acao: "contratar", company_id: B1.id, plano: "pessoas-gestao", ciclo: "anual", forma: "cartao", parcelas: 12 });
    reg("b", b.status === 200 && b.j.total_cents === 99858 && (b.j.asaas ?? []).some((x: any) => x.tipo === "cobrança parcelada"),
      `HTTP ${b.status}; total anual R$ ${(b.j.total_cents ?? 0) / 100} em 12x; ${b.j.error ?? "cobrança parcelada criada"}`);

    // c) adicional no meio do ciclo
    await admin.from("subscriptions").update({ current_period_start: new Date(Date.now() - 15 * 86400000).toISOString(), current_period_end: new Date(Date.now() + 15 * 86400000).toISOString() }).eq("id", subA);
    const c = await call(dono.token, { acao: "adicional", company_id: A1.id, subscription_id: subA, code: "usuarios", qtd: 1 });
    const rc = c.j?.resultado ?? {};
    reg("c", c.status === 200 && rc.novo_valor_cents === 31980 && rc.prorata_cents > 0,
      `HTTP ${c.status}; novo valor R$ ${(rc.novo_valor_cents ?? 0) / 100}; pró-rata R$ ${(rc.prorata_cents ?? 0) / 100} (${rc.prorata_cobranca}) ${c.j.error ?? ""}`);

    // d) upgrade com cobrança da diferença
    const d = await call(dono.token, { acao: "trocar_plano", company_id: A1.id, subscription_id: subA, plano: "financeiro-multiempresa", ciclo: "mensal", forma: "pix" });
    const sd = await sub(subA); const qd = d.j?.resultado?.quote ?? {};
    reg("d", d.status === 200 && sd.plans.slug === "financeiro-multiempresa" && qd.cobrar_agora_cents > 0 && (d.j.asaas ?? []).some((x: any) => x.tipo === "cobrança avulsa"),
      `HTTP ${d.status}; crédito R$ ${(qd.credito_cents ?? 0) / 100}; diferença cobrada R$ ${(qd.cobrar_agora_cents ?? 0) / 100}; plano agora ${sd.plans.slug}; novo valor R$ ${(d.j?.resultado?.novo_valor_cents ?? 0) / 100} ${d.j.error ?? ""}`);
    await ativar(subA);

    // e) agendar downgrade
    const e = await call(dono.token, { acao: "trocar_plano", company_id: A1.id, subscription_id: subA, plano: "financeiro-gestao", ciclo: "mensal" });
    const se = await sub(subA);
    reg("e", e.status === 200 && e.j?.resultado?.agendado === true && se.pending_plan_change?.plano === "financeiro-gestao" && se.plans.slug === "financeiro-multiempresa",
      `HTTP ${e.status}; agendado para ${se.pending_plan_change?.efetivo_em ?? "-"}; plano atual mantido ${se.plans.slug} ${e.j.error ?? ""}`);

    // f) cancelar agendamento
    const f = await call(dono.token, { acao: "cancelar_agendamento", company_id: A1.id, subscription_id: subA });
    const sf = await sub(subA);
    reg("f", f.status === 200 && sf.pending_plan_change == null, `HTTP ${f.status}; agendamento removido: ${sf.pending_plan_change == null} ${f.j.error ?? ""}`);

    // g) mensal → anual imediato com crédito
    const g = await call(dono.token, { acao: "trocar_plano", company_id: A1.id, subscription_id: subA, plano: "financeiro-multiempresa", ciclo: "anual", forma: "pix" });
    const sg = await sub(subA); const qg = g.j?.resultado?.quote ?? {};
    const dias = Math.round((new Date(sg.current_period_end).getTime() - Date.now()) / 86400000);
    reg("g", g.status === 200 && sg.billing_cycle === "anual" && dias >= 364 && qg.credito_cents > 0,
      `HTTP ${g.status}; crédito R$ ${(qg.credito_cents ?? 0) / 100}; cobrado R$ ${(qg.cobrar_agora_cents ?? 0) / 100}; ciclo ${sg.billing_cycle}, vence em ${dias} dias; Asaas atualizado para anual R$ ${(g.j?.resultado?.novo_valor_cents ?? 0) / 100} ${g.j.error ?? ""}`);
    await ativar(subA);

    // h) anual → mensal agendado
    const h = await call(dono.token, { acao: "trocar_plano", company_id: A1.id, subscription_id: subA, plano: "financeiro-multiempresa", ciclo: "mensal" });
    const sh = await sub(subA);
    reg("h", h.status === 200 && h.j?.resultado?.agendado === true && sh.billing_cycle === "anual",
      `HTTP ${h.status}; agendado para a renovação (${sh.pending_plan_change?.efetivo_em ?? "-"}); ciclo atual segue ${sh.billing_cycle} ${h.j.error ?? ""}`);

    // i) renovação: troca agendada aprovada
    await admin.from("subscriptions").update({ pending_plan_change: { ...sh.pending_plan_change, efetivo_em: new Date(Date.now() - 60000).toISOString() } }).eq("id", subA);
    const ri = await renovar();
    const si = await sub(subA); const resI = (ri.resultados ?? []).find((x: any) => x.subscription_id === subA);
    reg("i", resI?.resultado === "aplicada" && si.billing_cycle === "mensal" && si.pending_plan_change == null,
      `rotina: ${JSON.stringify(resI ?? ri)}; ciclo agora ${si.billing_cycle}; valor Asaas R$ ${(si.monthly_price_cents ?? 0) / 100}`);

    // j) renovação: downgrade bloqueado por uso
    const j1 = await call(dono.token, { acao: "trocar_plano", company_id: A1.id, subscription_id: subA, plano: "financeiro-essencial", ciclo: "mensal" });
    await admin.from("subscription_companies").insert({ subscription_id: subA, company_id: A2.id });
    const sj0 = await sub(subA);
    await admin.from("subscriptions").update({ pending_plan_change: { ...sj0.pending_plan_change, efetivo_em: new Date(Date.now() - 60000).toISOString() } }).eq("id", subA);
    const rj = await renovar();
    const sj = await sub(subA); const resJ = (rj.resultados ?? []).find((x: any) => x.subscription_id === subA);
    const { data: evJ } = await admin.from("subscription_events").select("payload").eq("subscription_id", subA).eq("tipo_evento", "troca_bloqueada_uso").limit(1);
    reg("j", j1.status === 200 && resJ?.resultado === "bloqueada" && sj.plans.slug === "financeiro-multiempresa" && !!evJ?.length,
      `agendamento HTTP ${j1.status}; rotina: ${resJ?.resultado}; motivo "${resJ?.motivo}"; plano mantido ${sj.plans.slug}; histórico registrado: ${!!evJ?.length}; e-mail ${resJ?.email}`);

    // k) cancelar no fim do ciclo
    const k = await call(dono.token, { acao: "cancelar_fim_ciclo", company_id: A1.id, subscription_id: subA });
    const sk0 = await sub(subA);
    await admin.from("subscriptions").update({ current_period_end: new Date(Date.now() - 60000).toISOString() }).eq("id", subA);
    const rk = await renovar();
    const sk = await sub(subA); const resK = (rk.resultados ?? []).find((x: any) => x.subscription_id === subA);
    let asaasDeleted = false;
    try { const as = await asaasFetch(`/subscriptions/${sk.external_subscription_id}`, {}, "sandbox"); asaasDeleted = as?.deleted === true || as?.status === "INACTIVE"; } catch (_) { asaasDeleted = true; }
    reg("k", k.status === 200 && sk0.status === "active" && sk.status === "canceled" && asaasDeleted,
      `pedido HTTP ${k.status} (segue ativa até o fim do ciclo: ${sk0.status}); rotina: ${resK?.resultado}; status final ${sk.status}; assinatura removida no Asaas: ${asaasDeleted}`);

    // l) isolamento e autorização
    const l1 = await call(estranho.token, { acao: "cancelar_fim_ciclo", company_id: A1.id, subscription_id: subA });
    const { data: real } = await admin.from("companies").select("id").not("id", "in", `(${companyIds.join(",")})`).limit(1).single();
    const l2 = await call(dono.token, { acao: "cancelar_fim_ciclo", company_id: real!.id, subscription_id: subA });
    const l3 = await call(dono.token, { acao: "cancelar_fim_ciclo", company_id: A1.id, subscription_id: "00000000-0000-0000-0000-000000000001" });
    await admin.from("billing_accounts").update({ is_test: false }).eq("id", accB);
    const l4 = await call(dono.token, { acao: "contratar", company_id: B1.id, plano: "pessoas-essencial", ciclo: "mensal", forma: "pix" });
    await admin.from("billing_accounts").update({ is_test: true }).eq("id", accB);
    const { data: rec } = await admin.rpc("billing_v2_reconciliation");
    const recTxt = JSON.stringify(rec ?? "");
    const vazouRec = companyIds.some((id) => recTxt.includes(id)) || recTxt.includes(accA);
    const depoisProd = await snapProd();
    const vaz = ((rec ?? []) as any[]).filter((x) => companyIds.includes(x.company_id) || JSON.stringify(x).includes(accA)).slice(0, 5);
    const okL = l1.status === 403 && l2.status === 403 && l3.status === 403 && l4.status === 409 && !vazouRec && antesProd === depoisProd;
    reg("l", okL, `estranho: ${l1.status}; empresa real: ${l2.status}; assinatura de outra conta: ${l3.status}; sandbox sem marca de teste: ${l4.status}; conciliação de produção sem registros de teste: ${!vazouRec} ${vazouRec ? JSON.stringify(vaz) : ""}; assinaturas de produção inalteradas: ${antesProd === depoisProd}`);

    // ---------- m) a s) ----------
    const mk = async (n: string) => mkCompany(n);
    const M1 = await mk("M1"), M2 = await mk("M2"), G1 = await mk("G1"), G2 = await mk("G2"), E1 = await mk("E1"), E2 = await mk("E2");
    const N1 = await mk("N1"), P1 = await mk("P1"), Q1 = await mk("Q1"), R1 = await mk("R1"), S1 = await mk("S1");
    const accQ = await contaDe(Q1.id);
    await admin.from("billing_accounts").update({ asaas_env: "sandbox", is_test: true }).eq("titular_user_id", dono.id).neq("id", accQ);
    for (const c of [M1, M2, G1, G2, E1, E2, N1, P1, R1, S1]) {
      await admin.from("billing_accounts").update({ nome: `[TESTE] ${c.id.slice(0, 4).toUpperCase()} ${rnd.toUpperCase()}`, documento_pagador: c.cnpj }).eq("id", await contaDe(c.id));
    }
    const grupo = async (c1: any, c2: any) => {
      const acc = await contaDe(c1.id);
      const { error } = await admin.rpc("billing_v2_add_company_to_account", { _account: acc, _company: c2.id, _actor: dono.id });
      if (error) throw new Error("grupo: " + error.message);
      return acc;
    };

    // m) por empresa x grupo
    const m1 = await call(dono.token, { acao: "contratar", company_id: M1.id, plano: "financeiro-gestao", ciclo: "mensal", forma: "pix" });
    const m2 = await call(dono.token, { acao: "contratar", company_id: M2.id, plano: "financeiro-gestao", ciclo: "mensal", forma: "pix" });
    const accM = new Set([await contaDe(M1.id), await contaDe(M2.id)]);
    const accG = await grupo(G1, G2);
    const mg = await call(dono.token, { acao: "contratar", company_id: G1.id, plano: "financeiro-gestao", ciclo: "mensal", forma: "pix", modo: "grupo" });
    const { count: subsG } = await admin.from("subscriptions").select("id", { count: "exact", head: true }).eq("billing_account_id", accG);
    const { count: cobG } = await admin.from("subscription_companies").select("id", { count: "exact", head: true }).eq("subscription_id", mg.j?.subscription_id ?? "00000000-0000-0000-0000-000000000000");
    await grupo(E1, E2);
    const me = await call(dono.token, { acao: "contratar", company_id: E1.id, plano: "financeiro-essencial", ciclo: "mensal", forma: "pix", modo: "grupo" });
    reg("m", m1.status === 200 && m2.status === 200 && accM.size === 2 && mg.status === 200 && mg.j.total_cents === 29990 && subsG === 1 && cobG === 2 && me.status === 422,
      `por empresa: ${m1.status}/${m2.status}, ${accM.size} contas e 2 assinaturas; grupo Gestão: HTTP ${mg.status}, ${subsG} assinatura cobrindo ${cobG} empresas, R$ ${(mg.j.total_cents ?? 0) / 100}; grupo Essencial: HTTP ${me.status} (${JSON.stringify(me.j.detalhes ?? me.j.error)})`);

    // n) cortesia integral: nada no Asaas
    const accN = await contaDe(N1.id);
    const { data: pg } = await admin.from("plans").select("id").eq("slug", "financeiro-gestao").single();
    const { data: subN, error: eN } = await admin.from("subscriptions").insert({ user_id: dono.id, plan_id: pg!.id, module: "financeiro", status: "active", company_id: N1.id,
      billing_account_id: accN, billing_cycle: "mensal", asaas_env: "sandbox", monthly_price_cents: 0,
      current_period_start: new Date(Date.now() - 10 * 86400000).toISOString(), current_period_end: new Date(Date.now() + 20 * 86400000).toISOString() }).select("id").single();
    if (eN) throw new Error("n: criar assinatura " + eN.message);
    await admin.from("subscription_companies").insert({ subscription_id: subN!.id, company_id: N1.id });
    const { error: eG } = await admin.from("subscription_grants").insert({ subscription_id: subN!.id, tipo: "cortesia_total", percentual: 100, motivo_codigo: "outro", motivo_texto: "[TESTE] cortesia", starts_at: new Date(Date.now() - 86400000).toISOString(), ends_at: new Date(Date.now() + 365 * 86400000).toISOString(), granted_by: dono.id });
    if (eG) throw new Error("n: grant " + eG.message);
    const n1 = await call(dono.token, { acao: "adicional", company_id: N1.id, subscription_id: subN!.id, code: "usuarios", qtd: 1 });
    const n2 = await call(dono.token, { acao: "trocar_plano", company_id: N1.id, subscription_id: subN!.id, plano: "financeiro-multiempresa", ciclo: "mensal" });
    const { count: invN } = await admin.from("invoices").select("id", { count: "exact", head: true }).eq("subscription_id", subN!.id);
    reg("n", n1.status === 200 && n2.status === 200 && !(n1.j.asaas ?? []).length && !(n2.j.asaas ?? []).length && invN === 0 && !(await sub(subN!.id)).external_subscription_id,
      `adicional HTTP ${n1.status}, troca HTTP ${n2.status}; itens no Asaas: ${(n1.j.asaas ?? []).length + (n2.j.asaas ?? []).length}; faturas: ${invN}; assinatura no Asaas: nenhuma`);

    // p) valor do navegador ignorado
    const pp = await call(dono.token, { acao: "contratar", company_id: P1.id, plano: "financeiro-gestao", ciclo: "mensal", forma: "pix", valor_cents: 100 });
    const sp = pp.j?.subscription_id ? await sub(pp.j.subscription_id) : null;
    let vAs = 0; try { vAs = (await asaasFetch(`/subscriptions/${sp?.external_subscription_id}`, {}, "sandbox"))?.value ?? 0; } catch (_) { /* */ }
    reg("p", pp.status === 200 && pp.j.total_cents === 29990 && Math.round(vAs * 100) === 29990,
      `navegador enviou R$ 1,00; servidor gravou R$ ${(pp.j.total_cents ?? 0) / 100}; Asaas R$ ${vAs}`);

    // q) checkout em legado: produção recusada pelas funções novas
    const { data: modo } = await admin.rpc("checkout_v2_mode");
    const qq = await call(dono.token, { acao: "contratar", company_id: Q1.id, plano: "financeiro-gestao", ciclo: "mensal", forma: "pix" });
    reg("q", modo === "legado" && qq.status === 409 && !(qq.j.asaas ?? []).length,
      `modo ${modo}; conta de Produção nas funções novas: HTTP ${qq.status} "${qq.j.error}"; nada criado no Asaas`);

    // r) mensal -> anual com adicional
    const r0 = await call(dono.token, { acao: "contratar", company_id: R1.id, plano: "financeiro-gestao", ciclo: "mensal", forma: "pix" });
    const subR = r0.j.subscription_id; await ativar(subR);
    await admin.from("subscriptions").update({ current_period_start: new Date(Date.now() - 15 * 86400000).toISOString(), current_period_end: new Date(Date.now() + 15 * 86400000).toISOString() }).eq("id", subR);
    const r1 = await call(dono.token, { acao: "adicional", company_id: R1.id, subscription_id: subR, code: "usuarios", qtd: 1 });
    await ativar(subR);
    const r2 = await call(dono.token, { acao: "trocar_plano", company_id: R1.id, subscription_id: subR, plano: "financeiro-multiempresa", ciclo: "anual", forma: "pix" });
    const qr = r2.j?.resultado?.quote ?? {};
    const esperadoCred = Math.round(31980 * qr.fracao_restante);
    reg("r", r2.status === 200 && qr.valor_ciclo_atual_cents === 31980 && qr.valor_ciclo_novo_cents === 547008 && Math.abs(qr.credito_cents - esperadoCred) <= 1 && qr.cobrar_agora_cents === 547008 - qr.credito_cents && r2.j.resultado.novo_valor_cents === 547008,
      `adicional: pró-rata R$ ${(r1.j?.resultado?.prorata_cents ?? 0) / 100} (${r1.j?.resultado?.prorata_cobranca}); ciclo atual R$ ${(qr.valor_ciclo_atual_cents ?? 0) / 100} (plano + adicional); crédito R$ ${(qr.credito_cents ?? 0) / 100}; novo ciclo R$ ${(qr.valor_ciclo_novo_cents ?? 0) / 100}; cobrado agora R$ ${(qr.cobrar_agora_cents ?? 0) / 100}; Asaas anual R$ ${(r2.j?.resultado?.novo_valor_cents ?? 0) / 100} ${r2.j.error ?? ""}`);

    // s) adicional em conta anual: pró-rata cobrada na hora
    const s0 = await call(dono.token, { acao: "contratar", company_id: S1.id, plano: "financeiro-gestao", ciclo: "anual", forma: "pix" });
    const subS = s0.j.subscription_id; await ativar(subS);
    await admin.from("subscriptions").update({ current_period_start: new Date(Date.now() - 182 * 86400000).toISOString(), current_period_end: new Date(Date.now() + 183 * 86400000).toISOString() }).eq("id", subS);
    const s1 = await call(dono.token, { acao: "adicional", company_id: S1.id, subscription_id: subS, code: "usuarios", qtd: 1 });
    const rs = s1.j?.resultado ?? {};
    reg("s", s1.status === 200 && rs.prorata_cobranca === "imediata" && rs.prorata_cents > 0 && (s1.j.asaas ?? []).some((x: any) => x.tipo === "cobrança avulsa (pró-rata)"),
      `pró-rata R$ ${(rs.prorata_cents ?? 0) / 100} cobrada ${rs.prorata_cobranca}; novo valor anual R$ ${(rs.novo_valor_cents ?? 0) / 100}; ${(s1.j.asaas ?? []).map((x: any) => x.tipo).join(", ")} ${s1.j.error ?? ""}`);

    // o) webhook de pagamento confirmado reenviado 2 vezes
    const { data: invO } = await admin.from("invoices").select("id,external_invoice_id,amount_cents").eq("subscription_id", pp.j.subscription_id).limit(1).single();
    const evId = `evt_teste_${rnd}`;
    const corpo = JSON.stringify({ id: evId, event: "PAYMENT_CONFIRMED", payment: { id: invO!.external_invoice_id, subscription: sp?.external_subscription_id, value: invO!.amount_cents / 100, status: "CONFIRMED", billingType: "PIX", externalReference: pp.j.subscription_id } });
    const hook = () => fetch(`${url}/functions/v1/asaas-webhook`, { method: "POST", headers: { "asaas-access-token": Deno.env.get("ASAAS_SANDBOX_WEBHOOK_TOKEN")!, "Content-Type": "application/json" }, body: corpo }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));
    const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));
    await pausa(3000); const o1 = await hook(); await pausa(2000); const o2 = await hook(); await pausa(2000);
    const wk = await fetch(`${url}/functions/v1/asaas-webhook-worker`, { method: "POST", headers: { "x-worker-secret": cron, "Content-Type": "application/json" }, body: "{}" }).then((r) => r.status);
    let evs: any[] | null = null;
    for (let i = 0; i < 16; i++) { // aguarda o processamento (worker acionado + rodada do minuto)
      ({ data: evs } = await admin.from("asaas_webhook_events").select("status,processed_at,asaas_env").eq("event_id", evId));
      if (evs?.[0]?.processed_at) break;
      await new Promise((r) => setTimeout(r, 5000));
    }
    await pausa(2000); const o3 = await hook();
    console.log("teste o: worker", wk, JSON.stringify(evs));
    const { data: invO2 } = await admin.from("invoices").select("status").eq("id", invO!.id).single();
    reg("o", (evs ?? []).length === 1 && evs![0].asaas_env === "sandbox" && !!evs![0].processed_at && invO2?.status === "paid",
      `envios: ${o1.s}, ${o2.s}, ${o3.s} (${JSON.stringify(o2.j)}); eventos gravados: ${(evs ?? []).length}; status ${evs?.[0]?.status} (${evs?.[0]?.asaas_env}); fatura ${invO2?.status}`);
    await admin.from("asaas_webhook_events").delete().eq("event_id", evId);
    }
    }
  } catch (e) {
    testes["erro"] = { status: "reprovado", observado: String((e as Error).message ?? e) };
  } finally {
    if (manter) { /* massa mantida para o_verificar */ } else {
    // ---------- limpeza local ----------
    const del = async (t: string, col: string, ids: string[]) => {
      if (!ids.length) return;
      const { error, count } = await admin.from(t).delete({ count: "exact" }).in(col, ids);
      limpeza.push(`${t}: ${error ? "ERRO " + error.message : (count ?? 0) + " removido(s)"}`);
    };
    // inventário autoritativo no Sandbox do Asaas (por e-mail do dono de teste)
    const inventario: unknown[] = [];
    for (const em of emails) {
      try {
        const cs = await asaasFetch(`/customers?email=${encodeURIComponent(em)}&limit=20`, {}, "sandbox");
        for (const cu of cs?.data ?? []) {
          const ss = await asaasFetch(`/subscriptions?customer=${cu.id}&limit=50`, {}, "sandbox");
          const ps = await asaasFetch(`/payments?customer=${cu.id}&limit=100`, {}, "sandbox");
          inventario.push({ cliente: { id: cu.id, nome: cu.name },
            assinaturas: (ss?.data ?? []).map((x: any) => ({ id: x.id, valor: x.value, ciclo: x.cycle, status: x.status, removida: x.deleted })),
            cobrancas: (ps?.data ?? []).map((x: any) => ({ id: x.id, valor: x.value, tipo: x.billingType, status: x.status, parcelamento: x.installment ?? null, descricao: x.description })) });
        }
      } catch (e) { inventario.push({ erro: String((e as Error).message) }); }
    }
    (globalThis as any).__inv = inventario;
    if (userIds.length) {
      // itens de fatura (excedentes/pendências) saem antes da limpeza das faturas de teste
      const { data: accs } = await admin.from("billing_accounts").select("id").in("titular_user_id", userIds).eq("is_test", true);
      const { data: ss } = accs?.length ? await admin.from("subscriptions").select("id").in("billing_account_id", accs.map((a: any) => a.id)) : { data: [] };
      if (ss?.length) await admin.from("invoice_items").delete().in("subscription_id", ss.map((x: any) => x.id));
    }
    if (emails.length) {
      const { data: pr, error: ep } = await admin.rpc("billing_v2_qa_purge", { _emails: emails });
      limpeza.push(`cobrança de teste: ${ep ? "ERRO " + ep.message : JSON.stringify(pr)}`);
    }
    if (companyIds.length) {
      await admin.from("dp_colaboradores").delete().in("company_id", companyIds);
      await admin.from("dp_pendencias_apuracoes").delete().in("company_id", companyIds);
    }
    await del("companies", "id", companyIds);
    for (const u of userIds) {
      const { error } = await admin.auth.admin.deleteUser(u);
      limpeza.push(`usuário de teste: ${error ? "ERRO " + error.message : "removido"}`);
    }
    }
  }
  console.log("RESULTADO", JSON.stringify({ testes, limpeza }));
  console.log("INVENTARIO", JSON.stringify(((globalThis as any).__inv ?? []).map((e: any) => ({ c: e.cliente?.id, s: (e.assinaturas ?? []).map((a: any) => a.id), p: (e.cobrancas ?? []).filter((x: any) => !String(x.descricao).startsWith("Parcela ") || String(x.descricao).startsWith("Parcela 1 ")).map((x: any) => `${x.id} ${x.valor} ${x.status}`) }))));
  return json({ testes, asaas_sandbox_criado: asaas, inventario_sandbox: (globalThis as any).__inv, limpeza });
});
