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

/** Bloqueia o uso de um cliente do Asaas que já pertence a outra conta de cobrança. */
export async function assertClienteExclusivo(admin: SupabaseClient, conta: Conta, customerId: string) {
  const { data } = await admin.from("billing_accounts").select("id")
    .eq("asaas_env", conta.asaas_env).eq("asaas_customer_id", customerId).neq("id", conta.id).limit(1);
  if (data && data.length) {
    throw new BillingError(409, "Este pagador já está vinculado a outra conta de cobrança. Nenhuma cobrança foi criada. Fale com o suporte.");
  }
}

export async function garantirCliente(admin: SupabaseClient, conta: Conta, email: string): Promise<string> {
  if (conta.asaas_customer_id) return conta.asaas_customer_id;
  const doc = (conta.documento_pagador ?? "").replace(/\D/g, "");
  if (!doc) throw new BillingError(422, "Informe o CNPJ/CPF do pagador antes de contratar.");
  // Se o Asaas já tem cliente com este documento ligado a outra conta, aborta sem criar nada.
  const busca = await asaasFetch(`/customers?cpfCnpj=${doc}`, { method: "GET" }, conta.asaas_env);
  for (const c of (busca?.data ?? []) as any[]) {
    if (c?.deleted) continue;
    await assertClienteExclusivo(admin, conta, c.id);
    if (c.externalReference && c.externalReference !== conta.id) {
      throw new BillingError(409, "Este CPF/CNPJ já é pagador de outra conta de cobrança. Nenhuma cobrança foi criada. Fale com o suporte.");
    }
  }
  const c = await asaasFetch("/customers", {
    method: "POST",
    body: JSON.stringify({ name: conta.nome, cpfCnpj: doc, email: conta.email_cobranca ?? email, externalReference: conta.id, notificationDisabled: true }),
  }, conta.asaas_env);
  const id = requireAsaasId(c, "o cliente");
  await assertClienteExclusivo(admin, conta, id);
  const { error } = await admin.from("billing_accounts").update({ asaas_customer_id: id }).eq("id", conta.id);
  if (error) throw new BillingError(409, "Este pagador já está vinculado a outra conta de cobrança. Fale com o suporte.", error.message);
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
  const { error } = await admin.from("invoices").insert({
    subscription_id: sub.id, user_id: sub.user_id, billing_account_id: sub.billing_account_id,
    amount_cents: Math.round(Number(pg.value ?? 0) * 100), status: "open", due_date: pg.dueDate,
    payment_method: forma === "cartao" ? "card" : forma, external_invoice_id: pg.id,
    external_payment_url: pg.invoiceUrl ?? null, boleto_url: pg.bankSlipUrl ?? null,
    notes: nota, asaas_env: sub.asaas_env,
  });
  if (error) throw new Error(`fatura ${pg.id}: ${error.message}`);
}

export type Criados = { tipo: string; id: string; descricao: string }[];

/** Mínimo aceito pelo Asaas para uma cobrança avulsa (R$ 5,00). */
export const ASAAS_MINIMO_CENTS = 500;

/** Assinatura com cortesia integral vigente (ou isenta): nada é cobrado no Asaas. */
export async function cortesiaIntegral(admin: SupabaseClient, sub: any): Promise<boolean> {
  if (sub.is_exempt) return true;
  const agora = new Date().toISOString();
  const { data } = await admin.from("subscription_grants").select("id,ends_at,starts_at")
    .eq("subscription_id", sub.id).eq("tipo", "cortesia_total").is("revoked_at", null).lte("starts_at", agora);
  return (data ?? []).some((g: any) => !g.ends_at || g.ends_at > agora);
}

function fracaoRestante(sub: any): number {
  const ini = Date.parse(sub.current_period_start ?? ""), fim = Date.parse(sub.current_period_end ?? "");
  if (!ini || !fim || fim <= ini || fim <= Date.now()) return 0;
  return (fim - Math.max(Date.now(), ini)) / (fim - ini);
}

export async function opcoesParcelamento(admin: SupabaseClient, valorCents: number) {
  const { data, error } = await admin.rpc("billing_v2_parcelamento", { _valor_cents: valorCents });
  if (error) throw new BillingError(500, "Falha ao calcular o parcelamento.", error.message);
  return data as { parcelas: number; valor_parcela_cents: number; total_cents: number; juros_cents: number }[];
}

// ---------- operações ----------

export const MSG_FALHA_DESFEITA = "Não foi possível concluir a contratação. Nada foi cobrado. Tente novamente ou escolha outra forma de pagamento.";
export const MSG_FALHA_COMPENSACAO = "Não foi possível concluir a contratação. Se você receber alguma cobrança dela, desconsidere: nossa equipe vai cancelá-la.";

type Criado = { tipo: "assinatura" | "cobranca" | "parcelamento"; id: string };
export type SimularFalha = "criacao" | "apos_assinatura" | "cancelamento" | "timeout" | "timeout_busca" | "gravacao_desfazimento";

const INATIVO = ["INACTIVE", "CANCELLED", "DELETED", "REFUNDED"];
const CRIACAO_TIMEOUT_MS = 25000;

/** Erro de rede/timeout/5xx: o Asaas pode ter criado o item sem nos responder. */
function respostaIncerta(e: unknown): boolean {
  const m = String((e as Error)?.message ?? e);
  const http = m.match(/\[(\d{3})\]/);
  if (http) return Number(http[1]) >= 500;
  return true; // sem status HTTP = timeout, conexão caída, resposta perdida
}

/** Cria no Asaas com tempo limite; em teste simula a resposta perdida DEPOIS de criar. */
async function criarNoAsaas(path: string, body: unknown, env: AsaasEnv, simularPerda: boolean) {
  const r = await asaasFetch(path, { method: "POST", body: JSON.stringify(body), signal: AbortSignal.timeout(CRIACAO_TIMEOUT_MS) }, env);
  if (simularPerda) throw new Error("timeout simulado: resposta do Asaas perdida após a criação (teste Sandbox)");
  return r;
}

/** Procura no Asaas tudo que tenha externalReference = assinatura local. */
async function buscarPorReferencia(ref: string, env: AsaasEnv, simularFalha: boolean): Promise<Criado[]> {
  if (simularFalha) throw new Error("busca por externalReference indisponível (teste Sandbox)");
  const achados: Criado[] = [];
  const subs = await asaasFetch(`/subscriptions?externalReference=${encodeURIComponent(ref)}&limit=100`, { method: "GET" }, env);
  for (const s of subs?.data ?? []) if (!s?.deleted) achados.push({ tipo: "assinatura", id: s.id });
  const pays = await asaasFetch(`/payments?externalReference=${encodeURIComponent(ref)}&limit=100`, { method: "GET" }, env);
  for (const p of pays?.data ?? []) {
    if (p?.deleted) continue;
    if (p.installment) achados.push({ tipo: "parcelamento", id: p.installment });
    else if (!p.subscription) achados.push({ tipo: "cobranca", id: p.id });
  }
  return achados;
}

const rotaDe = (it: Criado) => it.tipo === "assinatura" ? `/subscriptions/${it.id}` : it.tipo === "parcelamento" ? `/installments/${it.id}` : `/payments/${it.id}`;

/** Confere por GET que o item não tem mais nada ativo. Devolve motivo se ainda ativo. */
async function conferirInativo(it: Criado, env: AsaasEnv): Promise<string | null> {
  try {
    if (it.tipo === "parcelamento") {
      const ps = await asaasFetch(`/payments?installment=${it.id}&limit=100`, { method: "GET" }, env);
      const ativas = (ps?.data ?? []).filter((p: any) => !p.deleted && !INATIVO.includes(String(p.status ?? "").toUpperCase()));
      return ativas.length ? `${ativas.length} parcela(s) ainda ativa(s)` : null;
    }
    const r = await asaasFetch(rotaDe(it), { method: "GET" }, env);
    const ativo = !(r?.deleted === true || INATIVO.includes(String(r?.status ?? "").toUpperCase()));
    return ativo ? `ainda ativo no Asaas (status ${r?.status})` : null;
  } catch (e) {
    const m = String((e as Error).message ?? e);
    return /\[404\]/.test(m) ? null : `conferência falhou: ${m}`;
  }
}

/** Cancela no Asaas cada item da tentativa (assinatura e parcelamento inteiro) e confere por GET. */
async function compensarAsaas(itens: Criado[], env: AsaasEnv, falharCancelamento: boolean) {
  const desfeitos: Criado[] = []; const pendentes: (Criado & { motivo: string })[] = [];
  const ordem = { assinatura: 0, parcelamento: 1, cobranca: 2 } as const;
  const unicos = [...new Map(itens.map((i) => [`${i.tipo}:${i.id}`, i])).values()].sort((a, b) => ordem[a.tipo] - ordem[b.tipo]);
  for (const it of unicos) {
    let motivo = "";
    try {
      if (falharCancelamento) throw new Error("falha de cancelamento simulada (teste Sandbox)");
      await asaasFetch(rotaDe(it), { method: "DELETE" }, env);
    } catch (e) { motivo = String((e as Error).message ?? e); }
    const ativo = await conferirInativo(it, env);
    if (ativo) { pendentes.push({ ...it, motivo: motivo ? `${motivo} | ${ativo}` : ativo }); continue; }
    desfeitos.push(it);
  }
  return { desfeitos, pendentes };
}

/** Executa uma gravação do desfazimento com 1 nova tentativa; devolve o erro final ou null. */
async function gravarComRetry(nome: string, fn: () => PromiseLike<{ error: any }>, simular: boolean): Promise<string | null> {
  let ultimo = "";
  for (let t = 0; t < 2; t++) {
    try {
      if (simular) throw new Error("falha de gravação simulada (teste Sandbox)");
      const { error } = await fn();
      if (!error) return null;
      ultimo = error.message ?? String(error);
    } catch (e) { ultimo = String((e as Error).message ?? e); }
  }
  console.error(`[contratar] desfazimento: ${nome} falhou 2x`, ultimo);
  return `${nome}: ${ultimo}`;
}

export async function contratar(admin: SupabaseClient, conta: Conta, userEmail: string, companyId: string, p: {
  plano: string; ciclo: Ciclo; forma: Forma; parcelas?: number; adicionais?: { code: string; qtd: number }[]; modo?: "empresa" | "grupo";
  empresas?: string[]; simular_falha?: SimularFalha;
}, criados: Criados) {
  // falha simulada só em conta [TESTE] do Sandbox; em qualquer outra é ignorada
  const falha = conta.is_test && conta.asaas_env === "sandbox" ? p.simular_falha : undefined;
  const { data: plano } = await admin.from("plans").select("id,module,slug,name").eq("slug", p.plano).eq("is_active", true).maybeSingle();
  if (!plano) throw new BillingError(422, "Plano indisponível.");
  const { data: ativa } = await admin.from("subscriptions").select("id")
    .eq("billing_account_id", conta.id).eq("module", plano.module)
    .in("status", ["active", "trialing", "past_due", "pending", "grace"]).limit(1);
  if (ativa?.length) throw new BillingError(409, "Já existe assinatura deste módulo para a conta. Use troca de plano.");
  if (p.parcelas && p.parcelas > 1 && !(p.ciclo === "anual" && p.forma === "cartao")) {
    throw new BillingError(422, "Parcelamento só no plano anual pago com cartão.");
  }
  // "grupo": uma assinatura cobre as empresas escolhidas da conta; "empresa": só a empresa informada.
  let cobertas = [companyId];
  if (p.modo === "grupo") {
    const { data: ba } = await admin.from("billing_accounts").select("tipo").eq("id", conta.id).single();
    if ((ba as any)?.tipo !== "grupo") throw new BillingError(422, "Esta conta não é de grupo.");
    const { data: vs } = await admin.from("billing_account_companies").select("company_id").eq("billing_account_id", conta.id).is("removed_at", null);
    const naConta = (vs ?? []).map((v: any) => v.company_id as string);
    cobertas = p.empresas?.length ? p.empresas.filter((e) => naConta.includes(e)) : naConta;
    if (p.empresas?.length && cobertas.length !== p.empresas.length) throw new BillingError(422, "Empresa escolhida fora da conta de grupo.");
  }
  const q = await cotar(admin, conta.id, [{ plano: p.plano, empresas: cobertas.length, adicionais: p.adicionais ?? [] }], p.ciclo);
  let parc: { parcelas: number; valor_parcela_cents: number; total_cents: number; juros_cents: number } | null = null;
  if (p.parcelas && p.parcelas > 1) {
    parc = (await opcoesParcelamento(admin, q.total_ciclo_cents)).find((o) => o.parcelas === p.parcelas) ?? null;
    if (!parc) throw new BillingError(422, "Número de parcelas inválido.");
  }
  // Sempre o pagador ATUAL da conta (nunca um valor lido antes da troca de pagador).
  // Se a releitura falhar, aborta ANTES de qualquer chamada ao Asaas.
  const { data: atual, error: eAtual } = await admin.from("billing_accounts").select("asaas_customer_id,documento_pagador,email_cobranca").eq("id", conta.id).single();
  if (eAtual || !atual) throw new BillingError(500, "Não foi possível conferir os dados do pagador. Nada foi cobrado. Tente novamente.", eAtual?.message);
  conta.asaas_customer_id = (atual as any).asaas_customer_id ?? null;
  conta.documento_pagador = (atual as any).documento_pagador ?? conta.documento_pagador;
  conta.email_cobranca = (atual as any).email_cobranca ?? conta.email_cobranca;
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

  // Tudo ou nada: qualquer falha daqui em diante desfaz o que foi gravado.
  let asId: string | null = null;
  const tentativa: Criado[] = [];
  let tentouAsaas = false; let incerto = false;
  const perder = falha === "timeout" || falha === "timeout_busca";
  try {
    const { error: eC } = await admin.from("subscription_companies").insert(cobertas.map((c) => ({ subscription_id: sub.id, company_id: c })));
    if (eC) throw new Error(`cobertura: ${eC.message}`);
    for (const a of p.adicionais ?? []) {
      const { data: ad } = await admin.from("plan_addons").select("id,price_cents").eq("module", plano.module).eq("code", a.code).single();
      if (!ad) throw new Error(`adicional ${a.code} inexistente`);
      const { error: eA } = await admin.from("subscription_addons").insert({ subscription_id: sub.id, addon_id: ad.id, quantity: a.qtd, price_cents: ad.price_cents, status: "active", origem: "compra" });
      if (eA) throw new Error(`adicional: ${eA.message}`);
    }

    if (falha === "criacao") throw new Error("falha simulada antes de criar no Asaas (teste Sandbox)");
    tentouAsaas = true;
    if (p.parcelas && p.parcelas > 1) {
      let pg: any;
      try {
        pg = await criarNoAsaas("/payments", { customer: cliente, billingType: "CREDIT_CARD", installmentCount: p.parcelas,
          totalValue: reais(parc!.total_cents), dueDate: hoje(1), description: `${plano.name} — anual em ${p.parcelas}x (juros do cartão inclusos)`, externalReference: sub.id }, conta.asaas_env, perder);
      } catch (e) { if (respostaIncerta(e)) incerto = true; throw e; }
      const pgId = requireAsaasId(pg, "a cobrança");
      if (pg.installment) tentativa.push({ tipo: "parcelamento", id: pg.installment });
      tentativa.push({ tipo: "cobranca", id: pgId });
      criados.push({ tipo: "cobrança parcelada", id: pg.installment ?? pgId, descricao: `${plano.name} anual ${p.parcelas}x` });
      // todas as parcelas viram faturas locais (o webhook não as recria)
      const parcelas = pg.installment ? (await asaasFetch(`/payments?installment=${pg.installment}&limit=100`, {}, conta.asaas_env))?.data ?? [pg] : [pg];
      for (const x of parcelas) await registrarFatura(admin, sub, x, "cartao", `Contratação anual ${p.parcelas}x — parcela ${x.installmentNumber ?? 1}`);
    } else {
      let as: any;
      try {
        const corpo = { customer: cliente, billingType: billingType(p.forma), value: reais(q.total_ciclo_cents),
          nextDueDate: hoje(1), cycle: p.ciclo === "anual" ? "YEARLY" : "MONTHLY", description: plano.name, externalReference: sub.id };
        try {
          as = await criarNoAsaas("/subscriptions", corpo, conta.asaas_env, perder);
        } catch (e) {
          // Conta Asaas sem PIX habilitado para assinaturas recusa (400, nada criado): cria com "UNDEFINED",
          // e a fatura continua aceitando PIX na página de pagamento.
          const msg = String((e as Error)?.message ?? "");
          if (p.forma !== "pix" || respostaIncerta(e) || !/\[400\]/.test(msg) || !/forma de pagamento|billingType/i.test(msg)) throw e;
          console.warn("[contratar] PIX recusado em assinatura; recriando como UNDEFINED", sub.id);
          as = await criarNoAsaas("/subscriptions", { ...corpo, billingType: "UNDEFINED" }, conta.asaas_env, perder);
        }
      } catch (e) { if (respostaIncerta(e)) incerto = true; throw e; }
      asId = requireAsaasId(as, "a assinatura");
      tentativa.push({ tipo: "assinatura", id: asId });
      const { error: eU } = await admin.from("subscriptions").update({ external_subscription_id: asId }).eq("id", sub.id);
      if (eU) throw new Error(eU.message);
      criados.push({ tipo: "assinatura", id: asId, descricao: `${plano.name} ${p.ciclo}` });
      const pays = await asaasFetch(`/subscriptions/${asId}/payments`, {}, conta.asaas_env);
      for (const pg of pays?.data ?? []) {
        tentativa.push({ tipo: "cobranca", id: pg.id });
        criados.push({ tipo: "cobrança", id: pg.id, descricao: `1ª cobrança ${plano.name}` });
        await registrarFatura(admin, { ...sub, external_subscription_id: asId }, pg, p.forma, "Contratação");
      }
    }
    if (falha === "apos_assinatura" || falha === "cancelamento" || falha === "gravacao_desfazimento") {
      throw new Error("falha simulada após criar no Asaas (teste Sandbox)");
    }
  } catch (e) {
    const detalhe = e instanceof BillingError ? `${e.message} ${JSON.stringify((e as any).detalhes ?? "")}` : String((e as any)?.message ?? e);
    const agora = new Date().toISOString();
    // 0) resposta incerta (ou qualquer tentativa no Asaas): procura pelo externalReference
    let buscaFalhou: string | null = null;
    if (tentouAsaas) {
      try { tentativa.push(...await buscarPorReferencia(sub.id, conta.asaas_env, falha === "timeout_busca")); }
      catch (eb) { buscaFalhou = String((eb as Error).message ?? eb); }
    }
    // 1) compensação no Asaas, conferida por GET
    const { desfeitos, pendentes } = await compensarAsaas(tentativa, conta.asaas_env, falha === "cancelamento");
    if (buscaFalhou && incerto) pendentes.push({ tipo: "assinatura", id: `externalReference=${sub.id}`, motivo: `resposta incerta e busca falhou: ${buscaFalhou}` });
    const ok = pendentes.length === 0;
    // 2) desfazimento local SEM exclusão, cada gravação conferida (1 nova tentativa)
    const simG = falha === "gravacao_desfazimento";
    const falhas = (await Promise.all([
      gravarComRetry("assinatura cancelada", () => admin.from("subscriptions").update({ status: "canceled", canceled_at: agora }).eq("id", sub.id), false),
      gravarComRetry("coberturas encerradas", () => admin.from("subscription_companies").update({ removed_at: agora }).eq("subscription_id", sub.id).is("removed_at", null), simG),
      gravarComRetry("adicionais cancelados", () => admin.from("subscription_addons").update({ status: "canceled" }).eq("subscription_id", sub.id), false),
      gravarComRetry("faturas canceladas", () => admin.from("invoices").update({ status: "canceled" }).eq("subscription_id", sub.id).in("status", ["draft", "open", "overdue"]), false),
      gravarComRetry("evento contratacao_desfeita", () => admin.from("subscription_events").insert({ subscription_id: sub.id, tipo_evento: "contratacao_desfeita",
        payload: { erro: detalhe.slice(0, 800), cliente, criados_asaas: tentativa, desfeitos_asaas: desfeitos, pendentes_asaas: pendentes, resposta_incerta: incerto, busca_falhou: buscaFalhou } }), false),
      gravarComRetry(ok ? "evento contratacao_falhou" : "evento contratacao_falhou_compensacao_pendente", () => admin.from("billing_account_events").insert({ billing_account_id: conta.id, actor_id: conta.titular_user_id,
        tipo_evento: ok ? "contratacao_falhou" : "contratacao_falhou_compensacao_pendente",
        payload: { plano: p.plano, forma: p.forma, ciclo: p.ciclo, subscription_id: sub.id, cliente, asaas_env: conta.asaas_env,
          desfeitos: desfeitos.map((d) => d.id), pendentes, resposta_incerta: incerto, erro: detalhe.slice(0, 800) } }), false),
    ])).filter((x): x is string => !!x);
    if (falhas.length) {
      await gravarComRetry("evento desfazimento_incompleto", () => admin.from("billing_account_events").insert({ billing_account_id: conta.id, actor_id: conta.titular_user_id,
        tipo_evento: "desfazimento_incompleto", payload: { subscription_id: sub.id, asaas_env: conta.asaas_env, falhas, erro: detalhe.slice(0, 400) } }), false);
    }
    criados.length = 0;
    console.error("[contratar] falha", ok ? "desfeita" : "COMPENSAÇÃO PENDENTE", sub.id, detalhe, JSON.stringify(pendentes), falhas.length ? `LOCAL INCOMPLETO ${JSON.stringify(falhas)}` : "");
    throw new BillingError(502, ok ? MSG_FALHA_DESFEITA : MSG_FALHA_COMPENSACAO, { subscription_id: sub.id, compensacao_pendente: !ok, desfazimento_incompleto: falhas.length > 0 });
  }
  await admin.from("subscription_events").insert({ subscription_id: sub.id, tipo_evento: "contratacao_v2", payload: { quote: q, forma: p.forma, parcelas: p.parcelas ?? 1, parcelamento: parc, empresas: cobertas } });
  return { subscription_id: sub.id, total_cents: q.total_ciclo_cents, empresas_cobertas: cobertas.length, parcelamento: parc };
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
  const cortesia = await cortesiaIntegral(admin, sub);
  const antes = (await valorRecorrente(admin, sub.id)).cents;
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
  const v = await atualizarValorAsaas(admin, sub, cortesia ? null : criados);
  // Pró-rata = diferença do ciclo (plano + adicionais) proporcional aos dias restantes.
  const prorata = cortesia ? 0 : Math.max(0, Math.round((v.cents - antes) * fracaoRestante(sub)));
  let prorataCobranca: "imediata" | "proxima_mensalidade" | "nenhuma" = "nenhuma";
  let somadaAgora = false;
  if (prorata > 0) {
    const env = parseAsaasEnv(sub.asaas_env);
    const mensal = (sub.billing_cycle ?? "mensal") !== "anual";
    if (!mensal || prorata >= ASAAS_MINIMO_CENTS) {
      const pg = await asaasFetch("/payments", { method: "POST", body: JSON.stringify({
        customer: sub.external_customer_id, billingType: "UNDEFINED", value: reais(prorata), dueDate: hoje(1),
        description: `Pró-rata do adicional ${code} (${qtd})`, externalReference: sub.id }) }, env);
      criados.push({ tipo: "cobrança avulsa (pró-rata)", id: requireAsaasId(pg, "a cobrança da pró-rata"), descricao: `pró-rata ${code}` });
      await registrarFatura(admin, sub, pg, "pix", `Pró-rata do adicional ${code}`);
      prorataCobranca = "imediata";
    } else {
      // abaixo do mínimo do Asaas: vira pendência somada à próxima mensalidade quando o Asaas gerá-la
      // (aplicarPendentes marca como cobrada só depois que o Asaas aceitar o novo valor)
      await admin.from("billing_v2_cobrancas_pendentes").upsert({
        subscription_id: sub.id, origem: "prorata", referencia: `addon:${row.id}:${Date.now()}`,
        descricao: `Pró-rata do adicional ${code} (${qtd})`, valor_cents: prorata,
        detalhe: { addon_row: row.id, code, qtd }, asaas_env: sub.asaas_env,
      }, { onConflict: "subscription_id,origem,referencia", ignoreDuplicates: true });
      prorataCobranca = "proxima_mensalidade";
    }
    await admin.from("subscription_addons").update({ prorata_billed_at: prorataCobranca === "imediata" || somadaAgora ? new Date().toISOString() : null, notes: `pró-rata R$ ${reais(prorata).toFixed(2)} — ${prorataCobranca}` }).eq("id", row.id);
    await admin.from("subscription_events").insert({ subscription_id: sub.id, tipo_evento: "prorata_adicional", payload: { code, qtd, prorata_cents: prorata, cobranca: prorataCobranca } });
  }
  return { addon_row: row.id, prorata_cents: prorata, prorata_cobranca: prorataCobranca, novo_valor_cents: v.cents };
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
  const cortesia = await cortesiaIntegral(admin, sub);
  if (q.cobrar_agora_cents > 0 && !cortesia) {
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

/** Plano em vigor antes da última troca imediata (eventos troca_aplicada / contratacao_v2). */
async function planoAntesDaTroca(admin: SupabaseClient, sub: any): Promise<{ plano: string; ciclo: string } | null> {
  const { data: evs } = await admin.from("subscription_events").select("tipo_evento,payload,created_at")
    .eq("subscription_id", sub.id).in("tipo_evento", ["troca_aplicada", "contratacao_v2"]).order("created_at", { ascending: false }).limit(20);
  const lista = evs ?? [];
  const idx = lista.findIndex((e: any) => e.tipo_evento === "troca_aplicada" && e.payload?.origem === "imediata");
  if (idx < 0) return null;
  for (const e of lista.slice(idx + 1) as any[]) {
    if (e.tipo_evento === "troca_aplicada" && e.payload?.plano) return { plano: e.payload.plano, ciclo: e.payload.ciclo };
    if (e.tipo_evento === "contratacao_v2") {
      const it = (e.payload?.quote?.itens ?? []).find((i: any) => i.tipo === "plano" && i.modulo === sub.module);
      if (it?.codigo) return { plano: it.codigo, ciclo: e.payload?.quote?.ciclo === "yearly" || e.payload?.quote?.ciclo === "anual" ? "anual" : "mensal" };
    }
  }
  return null;
}

/** Desiste de um upgrade imediato ainda não pago: cancela a cobrança da diferença e volta ao plano anterior. */
export async function desfazerUpgrade(admin: SupabaseClient, sub: any, criados: Criados) {
  const { data: fat } = await admin.from("invoices").select("id,external_invoice_id,status,notes,amount_cents")
    .eq("subscription_id", sub.id).in("status", ["open", "overdue"]).like("notes", "Diferença%")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!fat) throw new BillingError(422, "Não há cobrança de diferença em aberto para desfazer. Se já foi paga, fale com o suporte.");
  const ant = await planoAntesDaTroca(admin, sub);
  if (!ant) throw new BillingError(422, "Não foi possível identificar o plano anterior. Fale com o suporte.");
  if (ant.ciclo !== (sub.billing_cycle ?? "mensal")) throw new BillingError(422, "A troca mudou o ciclo de cobrança; fale com o suporte para desfazer.");
  const env = parseAsaasEnv(sub.asaas_env);
  if (fat.external_invoice_id) {
    const pg = await asaasFetch(`/payments/${fat.external_invoice_id}`, {}, env);
    if (["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(pg?.status)) throw new BillingError(409, "Essa diferença já foi paga e não pode ser desfeita por aqui. Fale com o suporte.");
    if (!pg?.deleted) await asaasFetch(`/payments/${fat.external_invoice_id}`, { method: "DELETE" }, env);
    criados.push({ tipo: "cobrança cancelada", id: fat.external_invoice_id, descricao: "diferença do upgrade" });
  }
  const { error: eF } = await admin.from("invoices").update({ status: "canceled", notes: `${fat.notes} — desfeita pelo cliente` }).eq("id", fat.id);
  if (eF) throw new BillingError(500, "Cobrança cancelada no provedor, mas falhou ao registrar. Fale com o suporte.", eF.message);
  const { error: eA } = await admin.rpc("billing_v2_apply_change", { _subscription_id: sub.id, _plan_slug: ant.plano, _ciclo: ant.ciclo, _origem: "desfeita" });
  if (eA) throw new BillingError(500, "Falha ao voltar ao plano anterior.", eA.message);
  const v = await atualizarValorAsaas(admin, sub, criados);
  await admin.from("subscription_events").insert({ subscription_id: sub.id, tipo_evento: "upgrade_desfeito",
    payload: { invoice_id: fat.id, valor_cents: fat.amount_cents, plano_restaurado: ant.plano, novo_valor_cents: v.cents } });
  return { ok: true, plano: ant.plano, novo_valor_cents: v.cents };
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
