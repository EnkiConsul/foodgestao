// Bateria de testes da contratação "tudo ou nada", SOMENTE no Sandbox do Asaas,
// com contas "[TESTE]" (is_test, asaas_env=sandbox) reutilizadas entre execuções
// e MANTIDAS ao final. Acesso: super admin autenticado com verificação em duas
// etapas (aal2) + segredo próprio (x-billing-tests-secret) + parâmetro
// system_parameters.billing_tests_habilitado = true.
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
const MSG_OK = "Não foi possível concluir a contratação. Nada foi cobrado. Tente novamente ou escolha outra forma de pagamento.";
const MSG_PEND = "Não foi possível concluir a contratação. Se você receber alguma cobrança dela, desconsidere: nossa equipe vai cancelá-la.";
const EMAIL_TESTE = "teste.billing.contratacao.fixo@aveto360.com";
const INATIVO = ["INACTIVE", "CANCELLED", "DELETED", "REFUNDED"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = serviceClient();

  // ---------- proteção de acesso ----------
  if (!secretMatches(req.headers.get("x-billing-tests-secret"), Deno.env.get("BILLING_TESTS_SECRET"))) return json({ error: "Forbidden" }, 403);
  const auth = req.headers.get("Authorization") ?? "";
  const tokenChamador = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const { data: cl } = tokenChamador ? await admin.auth.getClaims(tokenChamador) : { data: null };
  const claims = (cl as any)?.claims;
  if (!claims?.sub) return json({ error: "Faça login como super admin." }, 401);
  if (claims.aal !== "aal2") return json({ error: "Exige verificação em duas etapas concluída." }, 403);
  const { data: sa } = await admin.rpc("is_super_admin", { _user_id: claims.sub });
  if (sa !== true) return json({ error: "Somente super admin." }, 403);
  const atorId: string = claims.sub;
  const { data: hab } = await admin.from("system_parameters").select("value").eq("key", "billing_tests_habilitado").maybeSingle();
  if ((hab as any)?.value !== true) return json({ error: "Testes de cobrança desligados (billing_tests_habilitado = false)." }, 423);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const workerSecret = Deno.env.get("WEBHOOK_WORKER_SECRET") ?? Deno.env.get("PLUGGY_CRON_SECRET")!;
  const linhas: { teste: string; esperado: string; obtido: string; ok: boolean; evidencia: Record<string, unknown> }[] = [];
  const reg = (teste: string, esperado: string, ok: boolean, obtido: string, evidencia: Record<string, unknown> = {}) =>
    linhas.push({ teste, esperado, obtido, ok, evidencia });
  const sb = (path: string, init: RequestInit = {}) => asaasFetch(path, init, "sandbox");
  const body = await req.json().catch(() => ({})) as { so?: string[] };
  const roda = (k: string) => !body.so?.length || body.so.includes(k);

  try {
    // ---------- usuário [TESTE] reutilizado ----------
    const senha = crypto.randomUUID() + "Aa1!";
    let uid: string | undefined;
    for (let page = 1; page <= 20 && !uid; page++) {
      const { data: lu, error: eL } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (eL) throw new Error(`usuários: ${eL.message}`);
      uid = lu.users.find((x) => x.email === EMAIL_TESTE)?.id;
      if (lu.users.length < 200) break;
    }
    if (uid) {
      const { error } = await admin.auth.admin.updateUserById(uid, { password: senha });
      if (error) throw new Error(`usuário: ${error.message}`);
    } else {
      const { data: u, error } = await admin.auth.admin.createUser({ email: EMAIL_TESTE, password: senha, email_confirm: true, user_metadata: { full_name: "[TESTE] CONTRATACAO" } });
      if (error) throw new Error(`usuário: ${error.message}`);
      uid = u.user.id;
      await admin.rpc("billing_v2_qa_purge", { _emails: [EMAIL_TESTE] });
    }
    const cli = createClient(url, anon, { auth: { persistSession: false } });
    const { data: s, error: eS } = await cli.auth.signInWithPassword({ email: EMAIL_TESTE, password: senha });
    if (eS) throw new Error(`login teste: ${eS.message}`);
    const token = s.session!.access_token;

    const call = async (b: unknown) => {
      const r = await fetch(`${url}/functions/v1/billing-v2-contratar`, { method: "POST", headers: { Authorization: `Bearer ${token}`, apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify(b) });
      return { status: r.status, j: await r.json().catch(() => ({})) as any };
    };
    /** Empresa [TESTE] reutilizada; conta marcada como sandbox e CONFERIDA antes de qualquer contratação. */
    const mk = async (nome: string, marcar = true) => {
      const nomeEmp = `[TESTE] ${nome} FIXO LTDA`;
      let { data: emp } = await admin.from("companies").select("id,cnpj").eq("user_id", uid!).eq("name", nomeEmp).maybeSingle();
      if (!emp) {
        const r = await admin.from("companies").insert({ user_id: uid!, name: nomeEmp, cnpj: cnpj() }).select("id,cnpj").single();
        if (r.error) throw new Error(`empresa: ${r.error.message}`);
        emp = r.data;
      }
      const { data: v, error: eV } = await admin.from("billing_account_companies").select("billing_account_id").eq("company_id", emp!.id).is("removed_at", null).single();
      if (eV || !v) throw new Error(`conta da empresa ${nome}: ${eV?.message}`);
      const acc = (v as any).billing_account_id as string;
      if (marcar) {
        const { error: eM } = await admin.from("billing_accounts").update({ asaas_env: "sandbox", is_test: true, nome: `[TESTE] ${nome} FIXO` }).eq("id", acc);
        if (eM) throw new Error(`ABORTADO: marcar ${nome} como sandbox falhou: ${eM.message}`);
      }
      const { data: chk, error: eChk } = await admin.from("billing_accounts").select("asaas_env,is_test").eq("id", acc).single();
      if (eChk || (chk as any)?.asaas_env !== "sandbox" || (chk as any)?.is_test !== true) {
        throw new Error(`ABORTADO: conta de ${nome} não está como sandbox/teste (${JSON.stringify(chk)}) — nada foi contratado`);
      }
      // a conta reutilizada não pode ter assinatura viva do módulo
      const { data: vivas } = await admin.from("subscriptions").select("id").eq("billing_account_id", acc).in("status", ["active", "trialing", "past_due", "pending", "grace"]);
      if (vivas?.length) throw new Error(`conta reutilizada ${nome} tem assinatura viva: ${vivas.map((x: any) => x.id).join(",")}`);
      return { id: emp!.id as string, acc, doc: (emp as any).cnpj as string };
    };
    const ultimaSub = async (acc: string, desde: string) => ((await admin.from("subscriptions").select("id,status,external_subscription_id,external_customer_id").eq("billing_account_id", acc).gte("created_at", desde).order("created_at", { ascending: false }).limit(1)).data ?? [])[0] as any;
    const evsConta = async (acc: string, tipo: string, desde: string) => (await admin.from("billing_account_events").select("id,payload").eq("billing_account_id", acc).eq("tipo_evento", tipo).gte("created_at", desde)).data ?? [];
    const subEvs = async (sid?: string) => sid ? ((await admin.from("subscription_events").select("tipo_evento,payload").eq("subscription_id", sid)).data ?? []) : [];
    const coberturasAtivas = async (sid?: string) => sid ? ((await admin.from("subscription_companies").select("id").eq("subscription_id", sid).is("removed_at", null)).data ?? []).length : -1;
    const pagadorDe = (x: { doc: string }) => ({ documento: x.doc, email: EMAIL_TESTE });
    const agoraISO = () => new Date(Date.now() - 1000).toISOString();

    // ---- aborto: conta que não virou sandbox
    if (roda("aborto")) {
      const t0 = agoraISO();
      let abortou = ""; let chamou = false;
      try { await mk("ABORTO", false); chamou = true; } catch (e) { abortou = String((e as Error).message); }
      const { data: emp } = await admin.from("companies").select("id").eq("user_id", uid!).eq("name", "[TESTE] ABORTO FIXO LTDA").maybeSingle();
      const { data: vv } = await admin.from("billing_account_companies").select("billing_account_id").eq("company_id", (emp as any)?.id ?? "").is("removed_at", null).maybeSingle();
      const subsAb = (await admin.from("subscriptions").select("id").eq("billing_account_id", (vv as any)?.billing_account_id ?? "00000000-0000-0000-0000-000000000000").gte("created_at", t0)).data ?? [];
      reg("aborto — conta que não virou sandbox", "aborta antes de chamar a contratação; nada criado", !chamou && abortou.startsWith("ABORTADO") && subsAb.length === 0,
        `${abortou.slice(0, 160)}; assinaturas criadas: ${subsAb.length}`, { conta: (vv as any)?.billing_account_id });
      // ao final, a conta usada é SEMPRE marcada como teste/sandbox (nunca fica como produção)
      if ((vv as any)?.billing_account_id) {
        const { error: eFim } = await admin.from("billing_accounts").update({ is_test: true, asaas_env: "sandbox" }).eq("id", (vv as any).billing_account_id);
        const { data: fim } = await admin.from("billing_accounts").select("is_test,asaas_env").eq("id", (vv as any).billing_account_id).single();
        reg("aborto — conta marcada como teste ao final", "is_test = true e asaas_env = sandbox", !eFim && (fim as any)?.is_test === true && (fim as any)?.asaas_env === "sandbox", JSON.stringify(fim ?? eFim?.message));
      }
    }

    // ---- i1: falha antes de criar no Asaas
    if (roda("i1")) {
      const I1 = await mk("I1"); const t0 = agoraISO();
      const r = await call({ acao: "contratar", company_id: I1.id, plano: "financeiro-gestao", ciclo: "mensal", forma: "pix", pagador: pagadorDe(I1), simular_falha: "criacao" });
      const s1 = await ultimaSub(I1.acc, t0); const ev = await subEvs(s1?.id);
      const ok = r.status === 502 && r.j?.error === MSG_OK && s1?.status === "canceled" && ev.some((e: any) => e.tipo_evento === "contratacao_desfeita") && (await evsConta(I1.acc, "contratacao_falhou", t0)).length === 1 && (await coberturasAtivas(s1?.id)) === 0;
      reg("i1 falha antes do Asaas", "cancelada (não apagada), histórico, \"Nada foi cobrado\"", ok, `HTTP ${r.status}; "${r.j?.error}"; assinatura ${s1?.status}; eventos ${ev.map((e: any) => e.tipo_evento).join(",")}`, { conta: I1.acc, sub: s1?.id });
    }

    // ---- i2: criada no Asaas, falha depois, cancelamento OK
    if (roda("i2")) {
      const I2 = await mk("I2"); const t0 = agoraISO();
      const r = await call({ acao: "contratar", company_id: I2.id, plano: "financeiro-gestao", ciclo: "mensal", forma: "pix", pagador: pagadorDe(I2), simular_falha: "apos_assinatura" });
      const s2 = await ultimaSub(I2.acc, t0);
      let g: any = null; try { g = await sb(`/subscriptions/${s2?.external_subscription_id}`); } catch (e) { g = { erro: String((e as Error).message) }; }
      const e2 = await evsConta(I2.acc, "contratacao_falhou", t0);
      reg("i2 criada + falha, cancelamento OK", "tudo desfeito e conferido por GET", r.status === 502 && r.j?.error === MSG_OK && s2?.status === "canceled" && (g?.deleted === true || String(g?.erro ?? "").includes("404")) && e2.length === 1,
        `HTTP ${r.status}; local ${s2?.status}; GET Asaas ${g?.deleted === true ? "removida" : JSON.stringify(g).slice(0, 100)}; desfeitos ${JSON.stringify(e2[0]?.payload?.desfeitos)}`, { conta: I2.acc, sub: s2?.id, asaas_sub: s2?.external_subscription_id });
    }

    // ---- i3 + k: cancelamento falha (simulado) e webhook de pagamento dela
    if (roda("i3")) {
      const I3 = await mk("I3"); const t0 = agoraISO();
      const r = await call({ acao: "contratar", company_id: I3.id, plano: "financeiro-gestao", ciclo: "mensal", forma: "pix", pagador: pagadorDe(I3), simular_falha: "cancelamento" });
      const s3 = await ultimaSub(I3.acc, t0);
      const e3 = await evsConta(I3.acc, "contratacao_falhou_compensacao_pendente", t0);
      reg("i3 cancelamento no Asaas falha", "compensação pendente + alerta + mensagem protetiva", r.status === 502 && r.j?.error === MSG_PEND && s3?.status === "canceled" && e3.length === 1 && (e3[0].payload?.pendentes ?? []).length > 0,
        `HTTP ${r.status}; "${r.j?.error}"; pendentes ${JSON.stringify((e3[0]?.payload?.pendentes ?? []).map((p: any) => p.id))}`, { conta: I3.acc, sub: s3?.id, evento: e3[0]?.id });

      const { data: inv3 } = await admin.from("invoices").select("id,external_invoice_id,amount_cents").eq("subscription_id", s3?.id ?? "").limit(1);
      if (inv3?.[0] && roda("k")) {
        const evK = `evt_teste_k_${crypto.randomUUID().slice(0, 8)}`;
        const evC = `${evK}_created`;
        const hook = (id: string, event: string, status: string) => fetch(`${url}/functions/v1/asaas-webhook`, { method: "POST", headers: { "asaas-access-token": Deno.env.get("ASAAS_SANDBOX_WEBHOOK_TOKEN")!, "Content-Type": "application/json" }, body: JSON.stringify({ id, event, payment: { id: inv3[0].external_invoice_id, subscription: s3.external_subscription_id, value: inv3[0].amount_cents / 100, status, billingType: "PIX" } }) }).then((x) => x.status);
        const hk = await hook(evK, "PAYMENT_RECEIVED", "RECEIVED");
        for (let i = 0; i < 4; i++) {
          await fetch(`${url}/functions/v1/asaas-webhook-worker`, { method: "POST", headers: { "x-worker-secret": workerSecret, "Content-Type": "application/json" }, body: "{}" });
          await new Promise((x) => setTimeout(x, 2500));
          const n = (await admin.from("billing_v2_desfeita_eventos").select("id").eq("event_id", evK)).data ?? [];
          if (n.length) break;
        }
        const sk = (await admin.from("subscriptions").select("status").eq("id", s3.id).single()).data as any;
        const ik = (await admin.from("invoices").select("status").eq("id", inv3[0].id).single()).data as any;
        const de = (await admin.from("billing_v2_desfeita_eventos").select("id,alerta,motivo").eq("event_id", evK)).data ?? [];
        const dv = (await admin.from("asaas_env_divergencias").select("id").eq("event_id", evK)).data ?? [];
        reg("k webhook de assinatura desfeita", "não reativa; alerta em registro próprio (não em divergências)", hk === 200 && sk?.status === "canceled" && ik?.status === "canceled" && de.length === 1 && de[0].alerta === true && dv.length === 0,
          `webhook HTTP ${hk}; assinatura ${sk?.status}; fatura ${ik?.status}; registro próprio ${JSON.stringify(de)}; divergências ${dv.length}`, { sub: s3.id, evento: evK });
        // aviso de criação de cobrança de outra contratação totalmente desfeita: sem alerta
        void evC;
      }
      // limpeza: cancela o que i3 deixou vivo no Sandbox, confere por GET e marca resolvida
      if (s3?.external_subscription_id) {
        try { await sb(`/subscriptions/${s3.external_subscription_id}`, { method: "DELETE" }); } catch (_) { /* conferido abaixo */ }
        let removida = false; try { const g = await sb(`/subscriptions/${s3.external_subscription_id}`); removida = g?.deleted === true || INATIVO.includes(String(g?.status)); } catch (_) { removida = true; }
        if (removida) {
          await admin.from("billing_account_events").insert({ billing_account_id: I3.acc, actor_id: uid, tipo_evento: "compensacao_resolvida", payload: { subscription_id: s3.id, origem: "teste_sandbox" } });
          await admin.from("billing_v2_desfeita_eventos").update({ resolvido_em: new Date().toISOString(), resolvido_por: atorId }).eq("subscription_id", s3.id).is("resolvido_em", null);
        }
      }
    }

    // ---- parcelado 12x com falha após criar: parcelamento inteiro cancelado
    if (roda("p12")) {
      const P = await mk("P12"); const t0 = agoraISO();
      const r = await call({ acao: "contratar", company_id: P.id, plano: "pessoas-gestao", ciclo: "anual", forma: "cartao", parcelas: 12, pagador: pagadorDe(P), simular_falha: "apos_assinatura" });
      const sp = await ultimaSub(P.acc, t0);
      const ev = (await subEvs(sp?.id)).find((e: any) => e.tipo_evento === "contratacao_desfeita") as any;
      const inst = (ev?.payload?.criados_asaas ?? []).find((c: any) => c.tipo === "parcelamento")?.id;
      let parcelas: any[] = []; try { parcelas = inst ? (await sb(`/payments?installment=${inst}&limit=100`))?.data ?? [] : []; } catch (_) { /* */ }
      const ativas = parcelas.filter((p: any) => !p.deleted && !INATIVO.includes(String(p.status)));
      const { data: invs } = await admin.from("invoices").select("status").eq("subscription_id", sp?.id ?? "");
      reg("parcelado 12x com falha", "DELETE /installments; GET sem nenhuma parcela ativa; \"Nada foi cobrado\"", r.status === 502 && r.j?.error === MSG_OK && !!inst && ativas.length === 0 && (invs ?? []).length > 0 && (invs ?? []).every((i: any) => i.status === "canceled"),
        `HTTP ${r.status}; "${r.j?.error}"; parcelamento ${inst}; parcelas ativas no Asaas ${ativas.length} de ${parcelas.length} listadas; faturas locais ${(invs ?? []).length} (${[...new Set((invs ?? []).map((i: any) => i.status))].join(",")})`, { conta: P.acc, sub: sp?.id, parcelamento: inst });
    }

    // ---- timeout simulado na criação: busca por externalReference e compensa
    if (roda("timeout")) {
      const T = await mk("TIMEOUT"); const t0 = agoraISO();
      const r = await call({ acao: "contratar", company_id: T.id, plano: "financeiro-gestao", ciclo: "mensal", forma: "pix", pagador: pagadorDe(T), simular_falha: "timeout" });
      const st = await ultimaSub(T.acc, t0);
      const ev = (await subEvs(st?.id)).find((e: any) => e.tipo_evento === "contratacao_desfeita") as any;
      const achadas = (ev?.payload?.criados_asaas ?? []).filter((c: any) => c.tipo === "assinatura");
      let restantes = -1; try { const l = await sb(`/subscriptions?externalReference=${st?.id}`); restantes = (l?.data ?? []).filter((x: any) => !x.deleted && !INATIVO.includes(String(x.status))).length; } catch (_) { /* */ }
      reg("timeout na criação", "acha pelo externalReference, cancela e confere; \"Nada foi cobrado\"", r.status === 502 && r.j?.error === MSG_OK && ev?.payload?.resposta_incerta === true && achadas.length >= 1 && restantes === 0 && st?.status === "canceled",
        `HTTP ${r.status}; "${r.j?.error}"; resposta incerta ${ev?.payload?.resposta_incerta}; encontradas pela referência ${achadas.map((a: any) => a.id).join(",")}; ativas restantes ${restantes}`, { conta: T.acc, sub: st?.id });

      const TB = await mk("TIMEOUT BUSCA"); const t1 = agoraISO();
      const rb = await call({ acao: "contratar", company_id: TB.id, plano: "financeiro-gestao", ciclo: "mensal", forma: "pix", pagador: pagadorDe(TB), simular_falha: "timeout_busca" });
      const stb = await ultimaSub(TB.acc, t1);
      const eb = await evsConta(TB.acc, "contratacao_falhou_compensacao_pendente", t1);
      reg("timeout + busca falha", "compensação pendente, alerta e mensagem \"desconsidere\"", rb.status === 502 && rb.j?.error === MSG_PEND && eb.length === 1,
        `HTTP ${rb.status}; "${rb.j?.error}"; pendentes ${JSON.stringify((eb[0]?.payload?.pendentes ?? []).map((p: any) => p.id))}`, { conta: TB.acc, sub: stb?.id });
      // limpeza do Sandbox: o item criado sem resposta continua vivo — cancela e resolve
      try {
        const l = await sb(`/subscriptions?externalReference=${stb?.id}`);
        let tudo = true;
        for (const x of l?.data ?? []) { if (x.deleted) continue; try { await sb(`/subscriptions/${x.id}`, { method: "DELETE" }); } catch (_) { tudo = false; } }
        if (tudo) await admin.from("billing_account_events").insert({ billing_account_id: TB.acc, actor_id: uid, tipo_evento: "compensacao_resolvida", payload: { subscription_id: stb?.id, origem: "teste_sandbox" } });
      } catch (_) { /* fica no alerta */ }
    }

    // ---- falha simulada numa gravação do desfazimento
    if (roda("gravacao")) {
      const G = await mk("GRAVACAO"); const t0 = agoraISO();
      const r = await call({ acao: "contratar", company_id: G.id, plano: "financeiro-gestao", ciclo: "mensal", forma: "pix", pagador: pagadorDe(G), simular_falha: "gravacao_desfazimento" });
      const sg = await ultimaSub(G.acc, t0);
      const ei = await evsConta(G.acc, "desfazimento_incompleto", t0);
      const cob = await coberturasAtivas(sg?.id);
      reg("falha em gravação do desfazimento", "nova tentativa, evento desfazimento_incompleto e alerta no Backoffice", r.status === 502 && r.j?.detalhes?.desfazimento_incompleto === true && ei.length === 1 && (ei[0].payload?.falhas ?? []).some((f: string) => f.startsWith("coberturas encerradas")) && sg?.status === "canceled",
        `HTTP ${r.status}; "${r.j?.error}"; falhas ${JSON.stringify(ei[0]?.payload?.falhas)}; assinatura ${sg?.status}; coberturas ainda abertas ${cob}`, { conta: G.acc, sub: sg?.id, evento: ei[0]?.id });
      // correção da massa: encerra a cobertura e registra a resolução (sem apagar nada)
      if (sg?.id) {
        await admin.from("subscription_companies").update({ removed_at: new Date().toISOString() }).eq("subscription_id", sg.id).is("removed_at", null);
        await admin.from("billing_account_events").insert({ billing_account_id: G.acc, actor_id: uid, tipo_evento: "desfazimento_resolvido", payload: { subscription_id: sg.id, origem: "teste_sandbox" } });
      }
    }

    return json({ ok: linhas.every((l) => l.ok), massa_mantida: { usuario: EMAIL_TESTE }, linhas });
  } catch (e) {
    return json({ erro: String((e as Error).message ?? e), linhas }, 500);
  }
});
