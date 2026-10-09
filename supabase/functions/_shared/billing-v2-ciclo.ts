// Fechamento de ciclo v2: pendências somadas à próxima mensalidade, excedentes de
// colaboradores (Pessoas), NFS-e pelo Asaas e conciliação diária (só aponta).
// Ambiente do Asaas SEMPRE vem do registro (asaas_env), nunca do chamador.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { asaasFetch, parseAsaasEnv } from "./asaas.ts";
import { ASAAS_MINIMO_CENTS, cortesiaIntegral, type Criados } from "./billing-v2.ts";

const reais = (c: number) => Math.round(c) / 100;
const hoje = (d = 0) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Registra uma pendência (idempotente por referência). */
export async function registrarPendente(admin: SupabaseClient, sub: any, p: {
  origem: "prorata" | "excedente"; referencia: string; descricao: string; valor_cents: number; detalhe?: Record<string, unknown>;
}) {
  if (p.valor_cents <= 0) return;
  await admin.from("billing_v2_cobrancas_pendentes").upsert({
    subscription_id: sub.id, origem: p.origem, referencia: p.referencia, descricao: p.descricao,
    valor_cents: p.valor_cents, detalhe: p.detalhe ?? {}, asaas_env: sub.asaas_env,
  }, { onConflict: "subscription_id,origem,referencia", ignoreDuplicates: true });
}

/**
 * Soma as pendências na mensalidade em aberto gerada pelo Asaas. Só marca como
 * cobrada depois que o Asaas aceitou o novo valor.
 */
export async function aplicarPendentes(admin: SupabaseClient, subId: string, criados: Criados | null = null) {
  const { data: pend } = await admin.from("billing_v2_cobrancas_pendentes").select("*")
    .eq("subscription_id", subId).is("cobrado_em", null).order("created_at");
  if (!pend?.length) return { aplicadas: 0, motivo: "sem pendências" };
  const { data: sub } = await admin.from("subscriptions").select("id,asaas_env,external_subscription_id,module").eq("id", subId).single();
  if (!sub?.external_subscription_id) return { aplicadas: 0, motivo: "assinatura sem recorrência no Asaas" };
  const { data: inv } = await admin.from("invoices").select("id,amount_cents,external_invoice_id,notes,due_date")
    .eq("subscription_id", subId).eq("status", "open").eq("asaas_env", sub.asaas_env).gte("due_date", hoje(0))
    .not("external_invoice_id", "is", null).order("due_date").limit(1).maybeSingle();
  if (!inv) return { aplicadas: 0, motivo: "aguardando o Asaas gerar a próxima mensalidade" };
  const extra = pend.reduce((t: number, p: any) => t + p.valor_cents, 0);
  const novo = inv.amount_cents + extra;
  const desc = pend.map((p: any) => `${p.descricao} ${brl(p.valor_cents)}`).join("; ");
  await asaasFetch(`/payments/${inv.external_invoice_id}`, {
    method: "POST", body: JSON.stringify({ value: reais(novo), description: `Mensalidade + ${desc}`.slice(0, 500) }),
  }, parseAsaasEnv(sub.asaas_env));
  const agora = new Date().toISOString();
  await admin.from("invoices").update({ amount_cents: novo, notes: `${inv.notes ?? ""} + ${desc}`.trim().slice(0, 1000) }).eq("id", inv.id);
  await admin.from("invoice_items").insert(pend.map((p: any) => ({
    invoice_id: inv.id, subscription_id: subId, module: `${sub.module}:${p.origem}`, quantity: (p.detalhe as any)?.excedente ?? 1,
    unit_price_cents: (p.detalhe as any)?.valor_unit_cents ?? p.valor_cents, desconto_cents: 0, total_cents: p.valor_cents,
  })));
  await admin.from("billing_v2_cobrancas_pendentes").update({ cobrado_em: agora, invoice_id: inv.id }).in("id", pend.map((p: any) => p.id));
  for (const p of pend.filter((x: any) => x.origem === "prorata" && (x.detalhe as any)?.addon_row)) {
    await admin.from("subscription_addons").update({ prorata_billed_at: agora }).eq("id", (p.detalhe as any).addon_row);
  }
  await admin.from("subscription_events").insert({ subscription_id: subId, tipo_evento: "pendencias_somadas_mensalidade",
    payload: { invoice_id: inv.id, somado_cents: extra, itens: pend.map((p: any) => ({ origem: p.origem, referencia: p.referencia, valor_cents: p.valor_cents })) } });
  criados?.push({ tipo: "cobrança (pendências somadas)", id: inv.external_invoice_id, descricao: `+${brl(extra)}` });
  return { aplicadas: pend.length, somado_cents: extra, invoice_id: inv.id, novo_valor_cents: novo };
}

/** Simulação da apuração: só lê, nunca grava nem chama o Asaas. */
export async function simularExcedentes(admin: SupabaseClient, subId: string, competencia: string) {
  const comp = competencia.slice(0, 7) + "-01";
  const { data: sub } = await admin.from("subscriptions").select("*").eq("id", subId).single();
  if (sub.module !== "pessoas") return { ignorado: "módulo sem franquia de colaboradores" };
  const { data: ja } = await admin.from("billing_v2_excedentes").select("id").eq("subscription_id", subId).eq("competencia", comp).maybeSingle();
  const { data: cnt, error } = await admin.rpc("billing_v2_colaboradores_competencia", { _sub: subId, _competencia: comp });
  if (error) throw new Error(`apuração: ${error.message}`);
  const c = (cnt as any[])[0];
  const { data: lims } = await admin.rpc("_billing_v2_limits", { _sub: subId });
  const limite = Number((lims as any[] ?? []).find((l) => l.recurso === "colaboradores")?.limite ?? 0);
  const exc = Math.max(0, c.contados - limite);
  const { data: ad } = await admin.from("plan_addons").select("price_cents").eq("module", "pessoas").eq("code", "colaboradores").single();
  const unit = ad?.price_cents ?? 0;
  const cortesia = await cortesiaIntegral(admin, sub);
  return { competencia: comp, status: sub.status, contados: c.contados, regulares: c.regulares, variaveis_contados: c.variaveis_contados,
    variaveis_fora: c.variaveis_fora, limite, excedente: exc, cortesia, ja_apurado: !!ja,
    forma: exc === 0 ? "nenhuma" : cortesia ? "cortesia" : sub.billing_cycle === "anual" ? "avulsa" : "proxima_fatura",
    valor_informativo_cents: exc * unit, valor_a_cobrar_cents: cortesia ? 0 : exc * unit };
}

/** Apura colaboradores da competência e lança o excedente (idempotente por mês).
 *  Com cortesia_total vigente o excedente é só informativo: nunca vira pendência nem cobrança. */
export async function apurarExcedentes(admin: SupabaseClient, subId: string, competencia: string, criados: Criados | null = null) {
  const comp = competencia.slice(0, 7) + "-01";
  const { data: ja } = await admin.from("billing_v2_excedentes").select("*").eq("subscription_id", subId).eq("competencia", comp).maybeSingle();
  if (ja) return { ...ja, ja_apurado: true };
  const { data: sub } = await admin.from("subscriptions").select("*").eq("id", subId).single();
  if (sub.module !== "pessoas") return { ignorado: "módulo sem franquia de colaboradores" };
  const { data: cnt, error } = await admin.rpc("billing_v2_colaboradores_competencia", { _sub: subId, _competencia: comp });
  if (error) throw new Error(`apuração: ${error.message}`);
  const c = (cnt as any[])[0];
  const { data: lims } = await admin.rpc("_billing_v2_limits", { _sub: subId });
  const lim = (lims as any[] ?? []).find((l) => l.recurso === "colaboradores");
  const limite = Number(lim?.limite ?? 0);
  const exc = Math.max(0, c.contados - limite);
  const { data: ad } = await admin.from("plan_addons").select("price_cents").eq("module", "pessoas").eq("code", "colaboradores").single();
  const unit = ad?.price_cents ?? 0;
  const cortesia = await cortesiaIntegral(admin, sub);
  const valor = cortesia ? 0 : exc * unit;
  const anual = sub.billing_cycle === "anual";
  const detalhe = { mes: comp.slice(0, 7), contados: c.contados, regulares: c.regulares, variaveis_contados: c.variaveis_contados,
    variaveis_fora: c.variaveis_fora, limite, excedente: exc, valor_unit_cents: unit };
  let forma: "proxima_fatura" | "avulsa" | "nenhuma" | "cortesia" = exc === 0 ? "nenhuma" : cortesia ? "cortesia" : anual ? "avulsa" : "proxima_fatura";
  const desc = `Colaboradores excedentes ${comp.slice(5, 7)}/${comp.slice(0, 4)}: ${exc} × ${brl(unit)}`;
  let externo: string | null = null;
  if (valor > 0) {
    await registrarPendente(admin, sub, { origem: "excedente", referencia: comp, descricao: desc, valor_cents: valor, detalhe });
    if (anual) {
      // anual: cobrança avulsa mensal (abaixo do mínimo do Asaas acumula para o mês seguinte)
      const { data: abertos } = await admin.from("billing_v2_cobrancas_pendentes").select("id,valor_cents,descricao")
        .eq("subscription_id", subId).eq("origem", "excedente").is("cobrado_em", null);
      const total = (abertos ?? []).reduce((t: number, p: any) => t + p.valor_cents, 0);
      if (total >= ASAAS_MINIMO_CENTS) {
        const pg = await asaasFetch("/payments", { method: "POST", body: JSON.stringify({ customer: sub.external_customer_id, billingType: "UNDEFINED",
          value: reais(total), dueDate: hoje(3), description: desc, externalReference: sub.id }) }, parseAsaasEnv(sub.asaas_env));
        externo = pg.id;
        const { data: invRow } = await admin.from("invoices").insert({ subscription_id: sub.id, user_id: sub.user_id, billing_account_id: sub.billing_account_id,
          amount_cents: total, status: "open", due_date: pg.dueDate, payment_method: "pix", external_invoice_id: pg.id,
          external_payment_url: pg.invoiceUrl ?? null, notes: desc, asaas_env: sub.asaas_env }).select("id").single();
        await admin.from("invoice_items").insert({ invoice_id: invRow!.id, subscription_id: sub.id, module: "pessoas:excedente", quantity: exc, unit_price_cents: unit, desconto_cents: 0, total_cents: total });
        await admin.from("billing_v2_cobrancas_pendentes").update({ cobrado_em: new Date().toISOString(), invoice_id: invRow!.id }).in("id", (abertos ?? []).map((p: any) => p.id));
        criados?.push({ tipo: "cobrança avulsa (excedente)", id: pg.id, descricao: desc });
      } else forma = "proxima_fatura";
    }
  }
  const row = { subscription_id: subId, competencia: comp, contados: c.contados, limite, excedente: exc, valor_unit_cents: unit,
    valor_cents: valor, forma, external_payment_id: externo, detalhe, asaas_env: sub.asaas_env };
  await admin.from("billing_v2_excedentes").insert(row);
  await admin.from("subscription_events").insert({ subscription_id: subId, tipo_evento: "apuracao_colaboradores", payload: row });
  if (!anual && valor > 0) await aplicarPendentes(admin, subId, criados);
  return row;
}

// ---------------- NFS-e ----------------

async function nfseLigada(admin: SupabaseClient, contaId: string | null): Promise<boolean> {
  const [{ data: p }, { data: c }] = await Promise.all([
    admin.from("system_parameters").select("value").eq("key", "emitir_nfse").maybeSingle(),
    contaId ? admin.from("billing_accounts").select("emitir_nfse").eq("id", contaId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const ov = (c as any)?.emitir_nfse;
  if (ov === true || ov === false) return ov;
  return (p as any)?.value === "ligado";
}

async function nfseConfig(admin: SupabaseClient) {
  const { data } = await admin.from("system_parameters").select("value").eq("key", "nfse_config").maybeSingle();
  const v = ((data as any)?.value ?? {}) as Record<string, any>;
  return {
    serviceDescription: v.descricao ?? "Licença de uso do software Aveto 360 (SaaS)",
    municipalServiceCode: v.codigo_servico ?? undefined, municipalServiceId: v.servico_id ?? undefined,
    municipalServiceName: v.nome_servico ?? undefined,
    taxes: { retainIss: false, iss: Number(v.iss ?? 0), cofins: 0, csll: 0, inss: 0, ir: 0, pis: 0 },
  };
}

/** Configura emissão automática na assinatura do Asaas (quando ligada para a conta). */
export async function configurarNfseAssinatura(admin: SupabaseClient, sub: any) {
  if (!sub.external_subscription_id || !(await nfseLigada(admin, sub.billing_account_id))) return false;
  const cfg = await nfseConfig(admin);
  await asaasFetch(`/subscriptions/${sub.external_subscription_id}/invoiceSettings`, { method: "POST", body: JSON.stringify({
    ...cfg, effectiveDatePeriod: "ON_PAYMENT_CONFIRMATION", receivedOnly: true, observations: "Mensalidade Aveto 360" }) }, parseAsaasEnv(sub.asaas_env));
  await admin.from("subscription_events").insert({ subscription_id: sub.id, tipo_evento: "nfse_automatica_configurada", payload: {} });
  return true;
}

/** Pagamento confirmado → solicita NFS-e (idempotente por fatura). Nunca para total zero. */
export async function solicitarNfse(admin: SupabaseClient, invoice: any, env: "production" | "sandbox") {
  if (invoice.asaas_env !== env) return { status: "ignorada_ambiente" };
  const valor = Number(invoice.amount_cents ?? 0);
  const { data: sub } = invoice.subscription_id
    ? await admin.from("subscriptions").select("id,billing_account_id,external_subscription_id,asaas_env").eq("id", invoice.subscription_id).maybeSingle()
    : { data: null };
  const contaId = invoice.billing_account_id ?? (sub as any)?.billing_account_id ?? null;
  const { data: conta } = contaId ? await admin.from("billing_accounts").select("documento_pagador,is_test,asaas_env").eq("id", contaId).maybeSingle() : { data: null };
  // sandbox só emite (no Sandbox) para contas de teste; nunca cruza ambientes
  if (env === "sandbox" && !(conta as any)?.is_test) return { status: "ignorada_sandbox" };
  if ((conta as any)?.asaas_env && (conta as any).asaas_env !== env) return { status: "ignorada_ambiente" };
  if (!(await nfseLigada(admin, contaId))) return { status: "desligada" };
  const base = { invoice_id: invoice.id, external_payment_id: invoice.external_invoice_id, tomador_documento: (conta as any)?.documento_pagador ?? null, valor_cents: valor, asaas_env: env };
  if (valor <= 0) {
    await admin.from("billing_v2_nfse_solicitacoes").upsert({ ...base, status: "nao_emitida_valor_zero" }, { onConflict: "invoice_id", ignoreDuplicates: true });
    return { status: "nao_emitida_valor_zero" };
  }
  const { data: ja } = await admin.from("billing_v2_nfse_solicitacoes").select("status").eq("invoice_id", invoice.id).maybeSingle();
  if (ja) return { status: ja.status, repetida: true };
  if ((sub as any)?.external_subscription_id && invoice.external_invoice_id) {
    const { count } = await admin.from("subscription_events").select("id", { count: "exact", head: true })
      .eq("subscription_id", (sub as any).id).eq("tipo_evento", "nfse_automatica_configurada");
    if ((count ?? 0) > 0) {
      await admin.from("billing_v2_nfse_solicitacoes").insert({ ...base, status: "automatica_assinatura" });
      return { status: "automatica_assinatura" };
    }
  }
  const cfg = await nfseConfig(admin);
  let status = "solicitada", resposta: any = null, nfId: string | null = null;
  try {
    resposta = await asaasFetch("/invoices", { method: "POST", body: JSON.stringify({
      payment: invoice.external_invoice_id, ...cfg, observations: `Fatura Aveto 360 ${invoice.id.slice(0, 8)}`,
      value: reais(valor), deductions: 0, effectiveDate: hoje(0) }) }, env);
    nfId = resposta?.id ?? null;
  } catch (e) {
    status = "recusada_asaas"; resposta = { erro: String((e as Error).message ?? e) };
  }
  await admin.from("billing_v2_nfse_solicitacoes").insert({ ...base, status, asaas_invoice_id: nfId, resposta });
  return { status, asaas_invoice_id: nfId, resposta };
}

// ---------------- Conciliação ----------------

const STATUS_PAGO = ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"];
function statusLocalDePagamento(s: string): string {
  if (STATUS_PAGO.includes(s)) return "paid";
  if (s === "OVERDUE") return "overdue";
  if (["REFUNDED", "REFUND_REQUESTED", "REFUND_IN_PROGRESS"].includes(s)) return "refunded";
  if (["DELETED", "CHARGEBACK_REQUESTED", "CHARGEBACK_DISPUTE"].includes(s)) return "canceled";
  return "open";
}

/** Compara assinaturas e cobranças com o Asaas e só registra divergências. */
export async function conciliar(admin: SupabaseClient, opts: { env: "production" | "sandbox"; contas?: string[] }) {
  const execucao = crypto.randomUUID();
  const divs: any[] = [];
  let qSubs = admin.from("subscriptions").select("id,status,monthly_price_cents,external_subscription_id,billing_account_id,asaas_env,is_exempt")
    .eq("asaas_env", opts.env).not("external_subscription_id", "is", null).not("status", "in", "(canceled,expired)");
  if (opts.contas?.length) qSubs = qSubs.in("billing_account_id", opts.contas);
  const { data: subs } = await qSubs;
  let verificadas = 0, cobrancas = 0;
  for (const s of subs ?? []) {
    verificadas++;
    try {
      const a = await asaasFetch(`/subscriptions/${s.external_subscription_id}`, {}, opts.env);
      const valorAsaas = Math.round(Number(a.value ?? 0) * 100);
      if (a.deleted || a.status === "INACTIVE") divs.push({ tipo: "assinatura_inativa_no_asaas", subscription_id: s.id, external_id: s.external_subscription_id, local: { status: s.status }, asaas: { status: a.status, deleted: a.deleted } });
      if (!s.is_exempt && valorAsaas !== s.monthly_price_cents) divs.push({ tipo: "valor_assinatura", subscription_id: s.id, external_id: s.external_subscription_id, local: { valor_cents: s.monthly_price_cents }, asaas: { valor_cents: valorAsaas } });
    } catch (e) {
      divs.push({ tipo: "assinatura_nao_encontrada", subscription_id: s.id, external_id: s.external_subscription_id, local: { status: s.status }, asaas: { erro: String((e as Error).message) } });
    }
  }
  let qInv = admin.from("invoices").select("id,status,amount_cents,external_invoice_id,subscription_id,billing_account_id")
    .eq("asaas_env", opts.env).not("external_invoice_id", "is", null).in("status", ["open", "overdue", "paid"])
    .gte("created_at", new Date(Date.now() - 90 * 86400000).toISOString());
  if (opts.contas?.length) qInv = qInv.in("billing_account_id", opts.contas);
  const { data: invs } = await qInv;
  for (const i of invs ?? []) {
    cobrancas++;
    try {
      const p = await asaasFetch(`/payments/${i.external_invoice_id}`, {}, opts.env);
      const st = statusLocalDePagamento(String(p.status ?? ""));
      const v = Math.round(Number(p.value ?? 0) * 100);
      if (st !== i.status) divs.push({ tipo: "status_cobranca", invoice_id: i.id, subscription_id: i.subscription_id, external_id: i.external_invoice_id, local: { status: i.status }, asaas: { status: p.status } });
      if (v !== i.amount_cents) divs.push({ tipo: "valor_cobranca", invoice_id: i.id, subscription_id: i.subscription_id, external_id: i.external_invoice_id, local: { valor_cents: i.amount_cents }, asaas: { valor_cents: v } });
    } catch (e) {
      divs.push({ tipo: "cobranca_nao_encontrada", invoice_id: i.id, subscription_id: i.subscription_id, external_id: i.external_invoice_id, local: { status: i.status }, asaas: { erro: String((e as Error).message) } });
    }
  }
  if (divs.length) await admin.from("billing_v2_conciliacao_divergencias").insert(divs.map((d) => ({ ...d, execucao_id: execucao, asaas_env: opts.env })));
  return { execucao_id: execucao, assinaturas_verificadas: verificadas, cobrancas_verificadas: cobrancas, divergencias: divs };
}
