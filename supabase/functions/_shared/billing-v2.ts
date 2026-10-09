// Núcleo da contratação v2 (servidor). Valores SEMPRE recalculados no banco
// (billing_v2_quote / billing_v2_plan_change_quote); ambiente do Asaas SEMPRE
// vindo do registro (billing_accounts.asaas_env), nunca do navegador.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { asaasFetch, parseAsaasEnv, requireAsaasId, type AsaasEnv } from "./asaas.ts";

export type Ciclo = "mensal" | "anual";
export type Forma = "pix" | "boleto" | "cartao";

export class BillingError extends Error {
  constructor(public status: number, msg: string, public detalhes?: unknown) { super(msg); }
}

const hoje = (dias = 0) => {
  const d = new Date(Date.now() + dias * 86400000);
  return d.toISOString().slice(0, 10);
};
const reais = (c: number) => Math.round(c) / 100;
const billingType = (f: Forma) => (f === "pix" ? "PIX" : f === "boleto" ? "BOLETO" : "CREDIT_CARD");
const cicloQuote = (c: Ciclo) => (c === "anual" ? "yearly" : "monthly");

export type Conta = {
  id: string; nome: string; titular_user_id: string; documento_pagador: string | null;
  email_cobranca: string | null; asaas_customer_id: string | null; asaas_env: AsaasEnv; is_test: boolean;
};

export async function carregarConta(admin: SupabaseClient, billingAccountId: string): Promise<Conta> {
  const { data, error } = await admin.from("billing_accounts")
    .select("id,nome,titular_user_id,documento_pagador,email_cobranca,asaas_customer_id,asaas_env,is_test")
    .eq("id", billingAccountId).maybeSingle();
  if (error || !data) throw new BillingError(404, "Conta de cobrança não encontrada.");
  return { ...(data as any), asaas_env: parseAsaasEnv((data as any).asaas_env) };
}

/** Bloqueia produção enquanto checkout_v2 = 'legado'. Sandbox de teste sempre liberado. */
export async function exigirModoPermitido(admin: SupabaseClient, conta: Conta) {
  if (conta.asaas_env === "sandbox") {
    if (!conta.is_test) throw new BillingError(409, "Conta de Sandbox sem marcação de teste.");
    return;
  }
  const { data } = await admin.rpc("checkout_v2_mode");
  if (data !== "v2") throw new BillingError(409, "A contratação nova ainda não foi liberada. Use a tela atual de planos.");
}

export async function garantirCliente(admin: SupabaseClient, conta: Conta, email: string): Promise<string> {
  if (conta.asaas_customer_id) return conta.asaas_customer_id;
  const doc = (conta.documento_pagador ?? "").replace(/\D/g, "");
  if (!doc) throw new BillingError(422, "Informe o CNPJ/CPF do pagador antes de contratar.");
  const c = await asaasFetch("/customers", {
    method: "POST",
    body: JSON.stringify({ name: conta.nome, cpfCnpj: doc, email: conta.email_cobranca ?? email, externalReference: conta.id, notificationDisabled: true }),
  }, conta.asaas_env);
  const id = requireAsaasId(c, "o cliente");
  await admin.from("billing_accounts").update({ asaas_customer_id: id }).eq("id", conta.id);
  conta.asaas_customer_id = id;
  return id;
}

type Modulo = { plano: string; empresas?: number; adicionais?: { code: string; qtd: number }[] };

export async function cotar(admin: SupabaseClient, contaId: string, modulos: Modulo[], ciclo: Ciclo) {
  const { data, error } = await admin.rpc("billing_v2_quote", {
    _billing_account_id: contaId, _itens: { modulos }, _billing_cycle: cicloQuote(ciclo),
  });
  if (error) throw new BillingError(500, "Falha ao calcular o valor.", error.message);
  if (!data?.ok) throw new BillingError(422, "Contratação inválida.", data?.erros);
  return data as { total_ciclo_cents: number; itens: any[] };
}

/** Valor recorrente atual da assinatura (plano + empresas + adicionais ativos não isentos). */
export async function valorRecorrente(admin: SupabaseClient, subId: string) {
  const { data: s } = await admin.from("subscriptions")
    .select("id,billing_account_id,billing_cycle,plans:plan_id(slug)").eq("id", subId).single();
  const { count } = await admin.from("subscription_companies").select("id", { count: "exact", head: true })
    .eq("subscription_id", subId).is("removed_at", null);
  const { data: ads } = await admin.from("subscription_addons")
    .select("quantity,is_exempt,status,plan_addons:addon_id(code)").eq("subscription_id", subId);
  const adicionais = (ads ?? []).filter((a: any) => a.status !== "canceled" && !a.is_exempt && a.plan_addons?.code !== "empresas")
    .map((a: any) => ({ code: a.plan_addons.code, qtd: a.quantity }));
  const ciclo = ((s as any).billing_cycle ?? "mensal") as Ciclo;
  const q = await cotar(admin, (s as any).billing_account_id, [{ plano: (s as any).plans.slug, empresas: count ?? 1, adicionais }], ciclo);
  return { cents: q.total_ciclo_cents, ciclo };
}

async function registrarFatura(admin: SupabaseClient, sub: any, pg: any, forma: Forma, nota: string) {
  await admin.from("invoices").insert({
    subscription_id: sub.id, user_id: sub.user_id, billing_account_id: sub.billing_account_id,
    amount_cents: Math.round(Number(pg.value ?? 0) * 100), status: "open", due_date: pg.dueDate,
    payment_method: forma === "cartao" ? "card" : forma, external_invoice_id: pg.id,
    external_payment_url: pg.invoiceUrl ?? null, boleto_url: pg.bankSlipUrl ?? null,
    notes: nota, asaas_env: sub.asaas_env,
  });
}

export type Criados = { tipo: string; id: string; descricao: string }[];

// ---------- operações ----------

export async function contratar(admin: SupabaseClient, conta: Conta, userEmail: string, companyId: string, p: {
  plano: string; ciclo: Ciclo; forma: Forma; parcelas?: number; adicionais?: { code: string; qtd: number }[];
}, criados: Criados) {
  const { data: plano } = await admin.from("plans").select("id,module,slug,name").eq("slug", p.plano).eq("is_active", true).maybeSingle();
  if (!plano) throw new BillingError(422, "Plano indisponível.");
  const { data: ativa } = await admin.from("subscriptions").select("id")
    .eq("billing_account_id", conta.id).eq("module", plano.module)
    .in("status", ["active", "trialing", "past_due", "pending", "grace"]).limit(1);
  if (ativa?.length) throw new BillingError(409, "Já existe assinatura deste módulo para a conta. Use troca de plano.");
  if (p.parcelas && p.parcelas > 1 && !(p.ciclo === "anual" && p.forma === "cartao")) {
    throw new BillingError(422, "Parcelamento só no plano anual pago com cartão.");
  }
  const q = await cotar(admin, conta.id, [{ plano: p.plano, empresas: 1, adicionais: p.adicionais ?? [] }], p.ciclo);
  const cliente = await garantirCliente(admin, conta, userEmail);

  const inicio = new Date();
  const fim = new Date(inicio); p.ciclo === "anual" ? fim.setFullYear(fim.getFullYear() + 1) : fim.setMonth(fim.getMonth() + 1);
  const { data: sub, error } = await admin.from("subscriptions").insert({
    user_id: conta.titular_user_id, plan_id: plano.id, module: plano.module, status: "pending", company_id: companyId,
    billing_account_id: conta.id, billing_cycle: p.ciclo, asaas_env: conta.asaas_env, monthly_price_cents: q.total_ciclo_cents,
    current_period_start: inicio.toISOString(), current_period_end: fim.toISOString(), next_charge_date: hoje(1),
    external_customer_id: cliente,
  }).select("*").single();
  if (error) throw new BillingError(500, "Falha ao registrar a assinatura.", error.message);
  await admin.from("subscription_companies").insert({ subscription_id: sub.id, company_id: companyId });
  for (const a of p.adicionais ?? []) {
    const { data: ad } = await admin.from("plan_addons").select("id,price_cents").eq("module", plano.module).eq("code", a.code).single();
    await admin.from("subscription_addons").insert({ subscription_id: sub.id, addon_id: ad!.id, quantity: a.qtd, price_cents: ad!.price_cents, status: "active", origem: "compra" });
  }

  if (p.parcelas && p.parcelas > 1) {
    // Anual parcelado no cartão: cobrança única parcelada; a renovação gera nova cobrança.
    const pg = await asaasFetch("/payments", {
      method: "POST",
      body: JSON.stringify({ customer: cliente, billingType: "CREDIT_CARD", installmentCount: p.parcelas,
        totalValue: reais(q.total_ciclo_cents), dueDate: hoje(1), description: `${plano.name} — anual em ${p.parcelas}x`, externalReference: sub.id }),
    }, conta.asaas_env);
    criados.push({ tipo: "cobrança parcelada", id: requireAsaasId(pg, "a cobrança"), descricao: `${plano.name} anual ${p.parcelas}x` });
    await registrarFatura(admin, sub, pg, "cartao", `Contratação anual ${p.parcelas}x`);
  } else {
    const as = await asaasFetch("/subscriptions", {
      method: "POST",
      body: JSON.stringify({ customer: cliente, billingType: billingType(p.forma), value: reais(q.total_ciclo_cents),
        nextDueDate: hoje(1), cycle: p.ciclo === "anual" ? "YEARLY" : "MONTHLY", description: plano.name, externalReference: sub.id }),
    }, conta.asaas_env);
    const asId = requireAsaasId(as, "a assinatura");
    criados.push({ tipo: "assinatura", id: asId, descricao: `${plano.name} ${p.ciclo}` });
    await admin.from("subscriptions").update({ external_subscription_id: asId }).eq("id", sub.id);
    const pays = await asaasFetch(`/subscriptions/${asId}/payments`, {}, conta.asaas_env);
    for (const pg of pays?.data ?? []) {
      criados.push({ tipo: "cobrança", id: pg.id, descricao: `1ª cobrança ${plano.name}` });
      await registrarFatura(admin, { ...sub, external_subscription_id: asId }, pg, p.forma, "Contratação");
    }
  }
  await admin.from("subscription_events").insert({ subscription_id: sub.id, tipo_evento: "contratacao_v2", payload: { quote: q, forma: p.forma, parcelas: p.parcelas ?? 1 } });
  return { subscription_id: sub.id, total_cents: q.total_ciclo_cents };
}

async function atualizarValorAsaas(admin: SupabaseClient, sub: any, criados: Criados | null, extra: Record<string, unknown> = {}) {
  const v = await valorRecorrente(admin, sub.id);
  await admin.from("subscriptions").update({ monthly_price_cents: v.cents }).eq("id", sub.id);
  if (!sub.external_subscription_id) return v;
  await asaasFetch(`/subscriptions/${sub.external_subscription_id}`, {
    method: "POST",
    body: JSON.stringify({ value: reais(v.cents), cycle: v.ciclo === "anual" ? "YEARLY" : "MONTHLY", updatePendingPayments: true, ...extra }),
  }, parseAsaasEnv(sub.asaas_env));
  criados?.push({ tipo: "assinatura (valor atualizado)", id: sub.external_subscription_id, descricao: `novo valor R$ ${reais(v.cents).toFixed(2)}` });
  return v;
}

export async function contratarAdicional(admin: SupabaseClient, sub: any, code: string, qtd: number, criados: Criados) {
  const { data: ad } = await admin.from("plan_addons").select("id,price_cents,max_quantity").eq("module", sub.module).eq("code", code).eq("is_active", true).maybeSingle();
  if (!ad) throw new BillingError(422, "Adicional inexistente para este módulo.");
  // valida no motor de preços (plano permite este adicional?)
  const { data: pl } = await admin.from("plans").select("slug").eq("id", sub.plan_id).single();
  await cotar(admin, sub.billing_account_id, [{ plano: pl!.slug, adicionais: [{ code, qtd }] }], sub.billing_cycle ?? "mensal");
  // um registro por adicional: se já existir, soma a quantidade (pró-rata recalculado pelo gatilho)
  const { data: ex } = await admin.from("subscription_addons").select("id,quantity,status").eq("subscription_id", sub.id).eq("addon_id", ad.id).maybeSingle();
  const { data: row, error } = ex
    ? await admin.from("subscription_addons").update({ quantity: (ex.status === "active" ? ex.quantity : 0) + qtd, status: "active", price_cents: ad.price_cents })
        .eq("id", ex.id).select("id,prorata_cents").single()
    : await admin.from("subscription_addons").insert({
        subscription_id: sub.id, addon_id: ad.id, quantity: qtd, price_cents: ad.price_cents, status: "active", origem: "compra",
      }).select("id,prorata_cents").single();
  if (error) throw new BillingError(500, "Falha ao registrar o adicional.", error.message);
  const v = await atualizarValorAsaas(admin, sub, criados);
  return { addon_row: row.id, prorata_cents: row.prorata_cents ?? 0, novo_valor_cents: v.cents };
}

export async function trocarPlano(admin: SupabaseClient, sub: any, plano: string, ciclo: Ciclo, forma: Forma, criados: Criados) {
  const { data: q, error } = await admin.rpc("billing_v2_plan_change_quote", { _subscription_id: sub.id, _plan_slug: plano, _billing_cycle: ciclo });
  if (error) throw new BillingError(500, "Falha ao calcular a troca.", error.message);
  if (q?.erros) throw new BillingError(422, "Troca inválida.", q.erros);
  if (!q.imediato) {
    const { error: e2 } = await admin.rpc("billing_v2_plan_change_schedule", { _subscription_id: sub.id, _plan_slug: plano, _billing_cycle: ciclo });
    if (e2) throw new BillingError(422, e2.message);
    return { agendado: true, quote: q };
  }
  const env = parseAsaasEnv(sub.asaas_env);
  if (q.cobrar_agora_cents > 0) {
    const pg = await asaasFetch("/payments", {
      method: "POST",
      body: JSON.stringify({ customer: sub.external_customer_id, billingType: billingType(forma), value: reais(q.cobrar_agora_cents),
        dueDate: hoje(1), description: `Diferença: ${q.tipo} para ${plano}`, externalReference: sub.id }),
    }, env);
    criados.push({ tipo: "cobrança avulsa", id: requireAsaasId(pg, "a cobrança da diferença"), descricao: `${q.tipo} — diferença` });
    await registrarFatura(admin, sub, pg, forma, `Diferença ${q.tipo}`);
  }
  await admin.rpc("billing_v2_apply_change", { _subscription_id: sub.id, _plan_slug: plano, _ciclo: ciclo, _origem: "imediata" });
  const extra = q.tipo === "troca_ciclo_anual" ? { nextDueDate: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10) } : {};
  const v = await atualizarValorAsaas(admin, sub, criados, extra);
  return { agendado: false, quote: q, novo_valor_cents: v.cents };
}

export async function cancelarAgendamento(admin: SupabaseClient, sub: any) {
  const { error } = await admin.rpc("billing_v2_plan_change_cancel", { _subscription_id: sub.id });
  if (error) throw new BillingError(422, error.message);
  return { ok: true };
}

export async function cancelarFimCiclo(admin: SupabaseClient, sub: any, desfazer = false) {
  await admin.from("subscriptions").update({ cancel_at_period_end: !desfazer }).eq("id", sub.id);
  await admin.from("subscription_events").insert({ subscription_id: sub.id, tipo_evento: desfazer ? "cancelamento_desfeito" : "cancelamento_agendado", payload: { efetivo_em: sub.current_period_end } });
  return { ok: true, efetivo_em: sub.current_period_end };
}

/** Rotina de renovação para uma assinatura devida. */
export async function processarRenovacao(admin: SupabaseClient, subId: string, acao: string) {
  const { data: sub } = await admin.from("subscriptions").select("*").eq("id", subId).single();
  const env = parseAsaasEnv(sub.asaas_env);
  if (acao === "cancelar") {
    if (sub.external_subscription_id) await asaasFetch(`/subscriptions/${sub.external_subscription_id}`, { method: "DELETE" }, env);
    await admin.from("subscriptions").update({ status: "canceled", canceled_at: new Date().toISOString() }).eq("id", subId);
    await admin.from("subscription_events").insert({ subscription_id: subId, tipo_evento: "cancelamento_efetivado", payload: {} });
    return { sub, resultado: "cancelada" as const, motivo: null };
  }
  const pend = sub.pending_plan_change;
  const { data: q } = await admin.rpc("billing_v2_plan_change_quote", { _subscription_id: subId, _plan_slug: pend.plano, _billing_cycle: pend.ciclo });
  const imp = (q?.impeditivos ?? []) as any[];
  if (q?.erros || imp.length) {
    const motivo = q?.erros ? (q.erros as string[]).join("; ") : imp.map((i) => i.mensagem).join("; ");
    await admin.from("subscriptions").update({ pending_plan_change: null }).eq("id", subId);
    await admin.from("subscription_events").insert({ subscription_id: subId, tipo_evento: "troca_bloqueada_uso", payload: { pendente: pend, quote: q, motivo } });
    return { sub, resultado: "bloqueada" as const, motivo, pend };
  }
  await admin.rpc("billing_v2_apply_change", { _subscription_id: subId, _plan_slug: pend.plano, _ciclo: pend.ciclo, _origem: "agendada" });
  const v = await atualizarValorAsaas(admin, sub, null);
  return { sub, resultado: "aplicada" as const, motivo: null, pend, novo_valor_cents: v.cents };
}
