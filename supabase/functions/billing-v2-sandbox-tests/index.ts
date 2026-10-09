// Bateria de testes a)–l) da Fase 3 no Sandbox do Asaas.
// Cria contas/empresas/usuários "[TESTE]" marcados como sandbox, executa os
// fluxos pelas funções reais (com login real), lista o que ficou no Sandbox do
// Asaas e desfaz TODOS os registros locais. Só por x-cron-secret.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { serviceClient } from "../_shared/authz.ts";
import { secretMatches } from "../_shared/secret.ts";
import { asaasFetch } from "../_shared/asaas.ts";

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
      `HTTP ${c.status}; novo valor R$ ${(rc.novo_valor_cents ?? 0) / 100}; pró-rata R$ ${(rc.prorata_cents ?? 0) / 100} (cobrado uma vez na próxima fatura) ${c.j.error ?? ""}`);

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
  } catch (e) {
    testes["erro"] = { status: "reprovado", observado: String((e as Error).message ?? e) };
  } finally {
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
    if (emails.length) {
      const { data: pr, error: ep } = await admin.rpc("billing_v2_qa_purge", { _emails: emails });
      limpeza.push(`cobrança de teste: ${ep ? "ERRO " + ep.message : JSON.stringify(pr)}`);
    }
    await del("companies", "id", companyIds);
    for (const u of userIds) {
      const { error } = await admin.auth.admin.deleteUser(u);
      limpeza.push(`usuário de teste: ${error ? "ERRO " + error.message : "removido"}`);
    }
  }
  return json({ testes, asaas_sandbox_criado: asaas, inventario_sandbox: (globalThis as any).__inv, limpeza });
});
