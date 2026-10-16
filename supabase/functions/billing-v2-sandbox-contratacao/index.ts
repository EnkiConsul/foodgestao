// Bateria de testes da contratação "tudo ou nada" e da separação de pagadores,
// SOMENTE no Sandbox do Asaas, com contas "[TESTE]" (is_test, asaas_env=sandbox)
// que são MANTIDAS ao final para conferência. Só por x-cron-secret.
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
const MSG_DIV = "O CPF/CNPJ informado é diferente do pagador já cadastrado. Fale com o suporte.";
const MSG_OK = "Não foi possível concluir a contratação. Nada foi cobrado. Tente novamente ou escolha outra forma de pagamento.";
const MSG_PEND = "Não foi possível concluir a contratação. Se você receber alguma cobrança dela, desconsidere: nossa equipe vai cancelá-la.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const cron = Deno.env.get("PLUGGY_CRON_SECRET")!;
  if (!secretMatches(req.headers.get("x-cron-secret"), cron)) return json({ error: "Forbidden" }, 403);
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = serviceClient();
  const rnd = crypto.randomUUID().slice(0, 6).toUpperCase();
  const linhas: { teste: string; esperado: string; obtido: string; ok: boolean; evidencia: Record<string, unknown> }[] = [];
  const reg = (teste: string, esperado: string, ok: boolean, obtido: string, evidencia: Record<string, unknown> = {}) =>
    linhas.push({ teste, esperado, obtido, ok, evidencia });
  const sb = (path: string, init: RequestInit = {}) => asaasFetch(path, init, "sandbox");

  try {
    // ---------- massa [TESTE] ----------
    const senha = crypto.randomUUID() + "Aa1!";
    const email = `teste.billing.contratacao.${rnd.toLowerCase()}@aveto360.com`;
    const { data: u, error: eU } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { full_name: `[TESTE] CONTRATACAO ${rnd}` } });
    if (eU) throw new Error(`usuário: ${eU.message}`);
    const cli = createClient(url, anon, { auth: { persistSession: false } });
    const { data: s } = await cli.auth.signInWithPassword({ email, password: senha });
    const token = s.session!.access_token;
    await admin.rpc("billing_v2_qa_purge", { _emails: [email] });

    const call = async (b: unknown) => {
      const r = await fetch(`${url}/functions/v1/billing-v2-contratar`, { method: "POST", headers: { Authorization: `Bearer ${token}`, apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify(b) });
      return { status: r.status, j: await r.json().catch(() => ({})) as any };
    };
    const mk = async (nome: string) => {
      const doc = cnpj();
      const { data, error } = await admin.from("companies").insert({ user_id: u.user.id, name: `[TESTE] ${nome} ${rnd} LTDA`, cnpj: doc }).select("id").single();
      if (error) throw new Error(`empresa: ${error.message}`);
      const acc = (await admin.from("billing_account_companies").select("billing_account_id").eq("company_id", data.id).is("removed_at", null).single()).data!.billing_account_id as string;
      await admin.from("billing_accounts").update({ asaas_env: "sandbox", is_test: true, nome: `[TESTE] ${nome} ${rnd}` }).eq("id", acc);
      return { id: data.id as string, acc, doc };
    };
    const conta = async (id: string) => (await admin.from("billing_accounts").select("*").eq("id", id).single()).data as any;
    const subsDe = async (acc: string) => (await admin.from("subscriptions").select("id,status,external_subscription_id,external_customer_id,canceled_at").eq("billing_account_id", acc)).data ?? [];
    const evsConta = async (acc: string, tipo: string) => (await admin.from("billing_account_events").select("id,payload").eq("billing_account_id", acc).eq("tipo_evento", tipo)).data ?? [];
    const novoCliente = async (nome: string, doc?: string) => (await sb("/customers", { method: "POST", body: JSON.stringify({ name: nome, ...(doc ? { cpfCnpj: doc } : {}), email: `teste.${rnd.toLowerCase()}@aveto360.com`, notificationDisabled: true }) })).id as string;

    // 4c — sem cliente no Asaas
    const C = await mk("EMPRESA C");
    const rc = await call({ acao: "contratar", company_id: C.id, plano: "financeiro-gestao", ciclo: "mensal", forma: "pix", pagador: { documento: C.doc, email } });
    const cc = await conta(C.acc);
    reg("4c sem cliente no Asaas", "cria cliente e assinatura", rc.status === 200 && !!cc.asaas_customer_id, `HTTP ${rc.status}; cliente ${cc.asaas_customer_id}`, { conta: C.acc, sub: rc.j?.subscription_id, cliente: cc.asaas_customer_id });

    // 4a — cliente no Asaas SEM documento
    const A = await mk("EMPRESA A");
    const cusA = await novoCliente(`[TESTE] A ${rnd}`);
    await admin.from("billing_accounts").update({ asaas_customer_id: cusA, documento_pagador: null }).eq("id", A.acc);
    const ra = await call({ acao: "contratar", company_id: A.id, plano: "financeiro-gestao", ciclo: "mensal", forma: "pix", pagador: { documento: A.doc, email } });
    const gA = await sb(`/customers/${cusA}`);
    const ca = await conta(A.acc);
    reg("4a cliente sem documento", "editável, conclui, documento gravado e enviado ao Asaas", ra.status === 200 && ca.documento_pagador === A.doc && String(gA.cpfCnpj) === A.doc, `HTTP ${ra.status}; local ${ca.documento_pagador === A.doc}; Asaas ${String(gA.cpfCnpj) === A.doc}`, { conta: A.acc, cliente: cusA, sub: ra.j?.subscription_id });

    // 4b — cliente com documento (campo travado: mesmo documento)
    const B = await mk("EMPRESA B");
    const cusB = await novoCliente(`[TESTE] B ${rnd}`, B.doc);
    await admin.from("billing_accounts").update({ asaas_customer_id: cusB, documento_pagador: B.doc, email_cobranca: email }).eq("id", B.acc);
    const rb = await call({ acao: "contratar", company_id: B.id, plano: "financeiro-gestao", ciclo: "mensal", forma: "pix" });
    reg("4b cliente com documento", "campo bloqueado, conclui", rb.status === 200, `HTTP ${rb.status}`, { conta: B.acc, cliente: cusB, sub: rb.j?.subscription_id });

    // 4d — documento divergente
    const D = await mk("EMPRESA D");
    const cusD = await novoCliente(`[TESTE] D ${rnd}`, D.doc);
    await admin.from("billing_accounts").update({ asaas_customer_id: cusD, documento_pagador: null }).eq("id", D.acc);
    const rd = await call({ acao: "contratar", company_id: D.id, plano: "financeiro-gestao", ciclo: "mensal", forma: "pix", pagador: { documento: cnpj(), email } });
    const sd = await subsDe(D.acc);
    const pd = await sb(`/subscriptions?customer=${cusD}`);
    reg("4d documento diferente", `recusa: "${MSG_DIV}", nada criado`, rd.status === 422 && rd.j?.error === MSG_DIV && sd.length === 0 && (pd?.totalCount ?? 0) === 0, `HTTP ${rd.status}; "${rd.j?.error}"; assinaturas locais ${sd.length}; no Asaas ${pd?.totalCount}`, { conta: D.acc, cliente: cusD });

    // 4f — duas contas com o mesmo cliente
    const { error: eF } = await admin.from("billing_accounts").update({ asaas_customer_id: cusB }).eq("id", D.acc);
    reg("4f duas contas, mesmo cliente", "banco recusa", !!eF, eF ? `recusado: ${eF.code}` : "ACEITOU", { conta: D.acc, cliente: cusB });

    // 4g — alterar pagador de uma conta não mexe no cliente da outra
    const antesB = await sb(`/customers/${cusB}`);
    const novoEmail = `teste.g.${rnd.toLowerCase()}@aveto360.com`;
    const rg = await call({ acao: "atualizar_pagador", company_id: A.id, documento: A.doc, email: novoEmail });
    const depoisB = await sb(`/customers/${cusB}`); const depoisA = await sb(`/customers/${cusA}`);
    reg("4g alterar pagador isolado", "só o cliente da conta A muda", rg.status === 200 && depoisA.email === novoEmail && antesB.email === depoisB.email && antesB.cpfCnpj === depoisB.cpfCnpj, `HTTP ${rg.status}; A=${depoisA.email === novoEmail}; B inalterado=${antesB.email === depoisB.email}`, { contaA: A.acc, cusA, cusB });

    // 4h — Grupo com PIX: assinatura, cobrança, pagamento simulado, webhook, acesso
    const H1 = await mk("GRUPO H1"); const H2 = await mk("GRUPO H2");
    await admin.from("billing_accounts").update({ tipo: "grupo" }).eq("id", H1.acc);
    await admin.from("billing_account_companies").update({ removed_at: new Date().toISOString() }).eq("company_id", H2.id).is("removed_at", null);
    await admin.from("billing_account_companies").insert({ billing_account_id: H1.acc, company_id: H2.id });
    const rh = await call({ acao: "contratar", company_id: H1.id, plano: "financeiro-multiempresa", ciclo: "mensal", forma: "pix", modo: "grupo", empresas: [H1.id, H2.id], pagador: { documento: H1.doc, email } });
    const subH = rh.j?.subscription_id as string;
    const { data: invH } = await admin.from("invoices").select("id,external_invoice_id,amount_cents").eq("subscription_id", subH ?? "").limit(1);
    const sH = (await admin.from("subscriptions").select("external_subscription_id").eq("id", subH ?? "").maybeSingle()).data as any;
    let pagoAsaas = false; let wh = 0; let statusH = ""; let acesso: unknown[] = [];
    if (invH?.[0]) {
      try { await sb(`/payments/${invH[0].external_invoice_id}/receiveInCash`, { method: "POST", body: JSON.stringify({ paymentDate: new Date().toISOString().slice(0, 10), value: invH[0].amount_cents / 100, notifyCustomer: false }) }); pagoAsaas = true; } catch (_) { /* registrado */ }
      const evId = `evt_teste_h_${rnd}`;
      wh = await fetch(`${url}/functions/v1/asaas-webhook`, { method: "POST", headers: { "asaas-access-token": Deno.env.get("ASAAS_SANDBOX_WEBHOOK_TOKEN")!, "Content-Type": "application/json" }, body: JSON.stringify({ id: evId, event: "PAYMENT_RECEIVED", payment: { id: invH[0].external_invoice_id, subscription: sH?.external_subscription_id, value: invH[0].amount_cents / 100, status: "RECEIVED", billingType: "PIX", externalReference: subH } }) }).then((r) => r.status);
      await fetch(`${url}/functions/v1/asaas-webhook-worker`, { method: "POST", headers: { "x-worker-secret": Deno.env.get("WEBHOOK_WORKER_SECRET") ?? cron, "Content-Type": "application/json" }, body: "{}" });
      for (let i = 0; i < 10; i++) {
        statusH = ((await admin.from("subscriptions").select("status").eq("id", subH).single()).data as any)?.status;
        if (statusH === "active") break;
        await new Promise((r) => setTimeout(r, 2000));
      }
      for (const c of [H1.id, H2.id]) acesso.push((await admin.rpc("_module_access_core", { _company_id: c, _module: "financeiro" })).data);
    }
    const acessoOk = acesso.length === 2 && acesso.every((a: any) => JSON.stringify(a).includes('"allowed":true') || a === true || a?.allowed === true);
    reg("4h Grupo com PIX", "assinatura, cobrança, pago, webhook, acesso nas 2 empresas", rh.status === 200 && !!invH?.[0] && pagoAsaas && wh === 200 && statusH === "active" && acessoOk, `HTTP ${rh.status}; cobrança ${invH?.[0]?.external_invoice_id}; pago no Asaas ${pagoAsaas}; webhook HTTP ${wh}; assinatura ${statusH}; acesso ${JSON.stringify(acesso)}`, { conta: H1.acc, sub: subH, asaas_sub: sH?.external_subscription_id });

    // i1 — falha antes de criar no Asaas
    const I1 = await mk("EMPRESA I1");
    const r1 = await call({ acao: "contratar", company_id: I1.id, plano: "financeiro-gestao", ciclo: "mensal", forma: "pix", pagador: { documento: I1.doc, email }, simular_falha: "criacao" });
    const s1 = await subsDe(I1.acc);
    const ev1 = s1[0] ? (await admin.from("subscription_events").select("tipo_evento").eq("subscription_id", s1[0].id)).data ?? [] : [];
    reg("i1 falha na criação no Asaas", "assinatura cancelada (não apagada), histórico, \"Nada foi cobrado\"", r1.status === 502 && r1.j?.error === MSG_OK && s1.length === 1 && s1[0].status === "canceled" && ev1.some((e: any) => e.tipo_evento === "contratacao_desfeita") && (await evsConta(I1.acc, "contratacao_falhou")).length === 1, `HTTP ${r1.status}; "${r1.j?.error}"; assinatura ${s1[0]?.status}; eventos ${ev1.map((e: any) => e.tipo_evento).join(",")}`, { conta: I1.acc, sub: s1[0]?.id });

    // i2 — criada no Asaas, falha depois, cancelamento funciona
    const I2 = await mk("EMPRESA I2");
    const r2 = await call({ acao: "contratar", company_id: I2.id, plano: "financeiro-gestao", ciclo: "mensal", forma: "pix", pagador: { documento: I2.doc, email }, simular_falha: "apos_assinatura" });
    const s2 = await subsDe(I2.acc);
    let g2: any = null; try { g2 = await sb(`/subscriptions/${s2[0]?.external_subscription_id}`); } catch (e) { g2 = { erro: String((e as Error).message) }; }
    const e2 = await evsConta(I2.acc, "contratacao_falhou");
    reg("i2 criada no Asaas + falha, cancelamento OK", "tudo desfeito e conferido por GET", r2.status === 502 && r2.j?.error === MSG_OK && s2[0]?.status === "canceled" && (g2?.deleted === true || String(g2?.erro ?? "").includes("404")) && e2.length === 1, `HTTP ${r2.status}; local ${s2[0]?.status}; GET Asaas ${g2?.deleted === true ? "removida" : JSON.stringify(g2).slice(0, 120)}; desfeitos ${JSON.stringify(e2[0]?.payload?.desfeitos)}`, { conta: I2.acc, sub: s2[0]?.id, asaas_sub: s2[0]?.external_subscription_id });

    // i3 — criada no Asaas, cancelamento falha (simulado)
    const I3 = await mk("EMPRESA I3");
    const r3 = await call({ acao: "contratar", company_id: I3.id, plano: "financeiro-gestao", ciclo: "mensal", forma: "pix", pagador: { documento: I3.doc, email }, simular_falha: "cancelamento" });
    const s3 = await subsDe(I3.acc);
    const e3 = await evsConta(I3.acc, "contratacao_falhou_compensacao_pendente");
    reg("i3 cancelamento no Asaas falha", "evento de compensação pendente, alerta no Backoffice, mensagem protetiva", r3.status === 502 && r3.j?.error === MSG_PEND && s3[0]?.status === "canceled" && e3.length === 1 && (e3[0].payload?.pendentes ?? []).length > 0, `HTTP ${r3.status}; "${r3.j?.error}"; pendentes ${JSON.stringify((e3[0]?.payload?.pendentes ?? []).map((p: any) => p.id))}`, { conta: I3.acc, sub: s3[0]?.id, evento: e3[0]?.id });

    // k — webhook de cobrança da assinatura desfeita (i3, ainda viva no Asaas)
    const { data: inv3 } = await admin.from("invoices").select("id,external_invoice_id,amount_cents,status").eq("subscription_id", s3[0]?.id ?? "").limit(1);
    let kOk = false; let kObs = "sem cobrança para testar";
    if (inv3?.[0]) {
      const evK = `evt_teste_k_${rnd}`;
      const hk = await fetch(`${url}/functions/v1/asaas-webhook`, { method: "POST", headers: { "asaas-access-token": Deno.env.get("ASAAS_SANDBOX_WEBHOOK_TOKEN")!, "Content-Type": "application/json" }, body: JSON.stringify({ id: evK, event: "PAYMENT_RECEIVED", payment: { id: inv3[0].external_invoice_id, subscription: s3[0].external_subscription_id, value: inv3[0].amount_cents / 100, status: "RECEIVED", billingType: "PIX" } }) }).then((r) => r.status);
      await fetch(`${url}/functions/v1/asaas-webhook-worker`, { method: "POST", headers: { "x-worker-secret": Deno.env.get("WEBHOOK_WORKER_SECRET") ?? cron, "Content-Type": "application/json" }, body: "{}" });
      await new Promise((r) => setTimeout(r, 4000));
      const sk = (await admin.from("subscriptions").select("status").eq("id", s3[0].id).single()).data as any;
      const ik = (await admin.from("invoices").select("status").eq("id", inv3[0].id).single()).data as any;
      const dv = (await admin.from("asaas_env_divergencias").select("id,detalhe").eq("event_id", evK)).data ?? [];
      const ac = (await admin.rpc("_module_access_core", { _company_id: I3.id, _module: "financeiro" })).data;
      kOk = hk === 200 && sk?.status === "canceled" && ik?.status === "canceled" && dv.length === 1;
      kObs = `webhook HTTP ${hk}; assinatura ${sk?.status}; fatura ${ik?.status}; divergências ${dv.length}; acesso ${JSON.stringify(ac)}`;
      reg("k webhook de assinatura desfeita", "não reativa, registra divergência", kOk, kObs, { sub: s3[0].id, evento: evK, divergencia: dv[0]?.id });
    } else reg("k webhook de assinatura desfeita", "não reativa, registra divergência", false, kObs);
    // limpeza do Sandbox: cancela a assinatura que o i3 deixou viva e marca como resolvida
    if (s3[0]?.external_subscription_id) {
      try { await sb(`/subscriptions/${s3[0].external_subscription_id}`, { method: "DELETE" }); } catch (_) { /* informado */ }
      await admin.from("billing_account_events").insert({ billing_account_id: I3.acc, actor_id: u.user.id, tipo_evento: "compensacao_resolvida", payload: { subscription_id: s3[0].id, origem: "teste_sandbox" } });
    }

    // j — troca de pagador e contratação em seguida: usa o cliente novo
    const J = await mk("EMPRESA J");
    const cusJ1 = await novoCliente(`[TESTE] J antigo ${rnd}`, J.doc);
    await admin.from("billing_accounts").update({ asaas_customer_id: cusJ1, documento_pagador: J.doc, email_cobranca: email }).eq("id", J.acc);
    const docJ2 = cnpj();
    const cusJ2 = await novoCliente(`[TESTE] J novo ${rnd}`, docJ2);
    await admin.from("billing_accounts").update({ asaas_customer_id: cusJ2, documento_pagador: docJ2 }).eq("id", J.acc);
    await admin.from("billing_account_events").insert({ billing_account_id: J.acc, actor_id: u.user.id, tipo_evento: "pagador_atualizado", payload: { origem: "teste_sandbox", antes: cusJ1, depois: cusJ2 } });
    const rj = await call({ acao: "contratar", company_id: J.id, plano: "financeiro-gestao", ciclo: "mensal", forma: "pix" });
    const sj = await subsDe(J.acc);
    reg("j troca de pagador + contratação", "assinatura no cliente novo", rj.status === 200 && sj[0]?.external_customer_id === cusJ2, `HTTP ${rj.status}; cliente usado ${sj[0]?.external_customer_id} (novo ${cusJ2}, antigo ${cusJ1})`, { conta: J.acc, sub: sj[0]?.id });

    return json({ ok: linhas.every((l) => l.ok), massa_mantida: { usuario: email, contas: [C, A, B, D, H1, I1, I2, I3, J].map((x) => x.acc) }, linhas });
  } catch (e) {
    return json({ erro: String((e as Error).message ?? e), linhas }, 500);
  }
});
