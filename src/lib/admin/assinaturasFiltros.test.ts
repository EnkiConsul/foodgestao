import { describe, it, expect } from "vitest";
import { PADRAO_CONTRATANTES, filtrarContratantes, lerContratantes, resumo, ordenar, escrever, planoChave, PLANO_LABEL } from "./assinaturasFiltros";
import { SUBSCRIPTION_STATUS_LABELS, SUBSCRIPTION_STATUS_VARIANT } from "@/lib/billing";

const hoje = new Date(2026, 10, 7, 12);
const nome = (uid: string) => ({ u1: "Ana Souza", u2: "Bruno" } as any)[uid] ?? "";
const base = (o: any) => ({ status: "active", module: "financeiro", plan: { name: "Gestão", price_cents: 10000 }, addons: [], ...o });
const rows = [
  base({ id: "a", user_id: "u1", company: { name: "Pakerê Ltda", cnpj: "12.345.678/0001-90" }, external_subscription_id: "sub_1",
    addons: [{ status: "active", price_cents: 2000, quantity: 2 }, { status: "active", is_exempt: true, price_cents: 9999 }],
    current_period_end: "2026-11-10" }),
  base({ id: "b", user_id: "u2", company: { name: "Rancho" }, is_exempt: true, plan: { name: "Essencial", price_cents: 5000 } }),
  base({ id: "c", user_id: "u2", status: "canceled", company: { name: "Zeta" }, current_period_end: "2026-11-09" }),
];
const f = (o: any) => ({ ...PADRAO_CONTRATANTES, ...o });

describe("filtros de assinaturas", () => {
  it("valor dos pagantes soma plano + adicionais ativos não cortesia, sem isentos", () => {
    const r = resumo(filtrarContratantes(rows, f({}), nome, hoje));
    expect(r).toMatchObject({ total: 2, pagando: 1, isentos: 1, receitaEmVigorCents: 14000, aReceberCents: 0 });
  });
  it("resumo separa pagando, carência, trial e isentos e soma o total", () => {
    const g = [
      base({ id: "p1", status: "active", plan: { price_cents: 9990 } }),
      base({ id: "p2", status: "past_due", plan: { price_cents: 9990 } }),
      base({ id: "g1", status: "grace", plan: { price_cents: 18990 } }),
      base({ id: "t1", status: "trialing", plan: { price_cents: 9790 } }),
      base({ id: "i1", status: "grace", is_exempt: true }),
    ];
    const r = resumo(g);
    expect(r).toMatchObject({ total: 5, pagando: 2, pagandoCents: 19980, carencia: 1, carenciaCents: 18990, trial: 1, trialCents: 9790, isentos: 1,
      receitaEmVigorCents: 19980, aReceberCents: 28780 });
    expect(r.pagando + r.carencia + r.trial + r.isentos).toBe(r.total);
    expect(filtrarContratantes(g, f({ cobranca: "nao_cobrado" }), nome, hoje).map((s) => s.id)).toEqual(["g1", "t1"]);
    expect(filtrarContratantes(g, f({ cobranca: "pagantes" }), nome, hoje).map((s) => s.id)).toEqual(["p1", "p2"]);
  });
  it("reconhece Enterprise e rótulo de carência", () => {
    expect(planoChave({ plan: { name: "Financeiro 360° Enterprise" } })).toBe("enterprise");
    expect(PLANO_LABEL.enterprise).toBe("Enterprise");
    expect(SUBSCRIPTION_STATUS_LABELS.grace).toBe("Em carência");
    expect(SUBSCRIPTION_STATUS_VARIANT.grace).toBe("secondary");
    expect(lerContratantes(new URLSearchParams("status=grace&cobranca=nao_cobrado&plano=enterprise"), Object.keys(SUBSCRIPTION_STATUS_LABELS)))
      .toMatchObject({ status: "grace", cobranca: "nao_cobrado", plano: "enterprise" });
  });
  it("trial acabando exige status trialing", () => {
    const t = [base({ id: "t", status: "trialing", trial_ends_at: "2026-11-09" }), base({ id: "a", status: "active", trial_ends_at: "2026-11-09" })];
    expect(filtrarContratantes(t, f({ atalhos: ["trial3"] }), nome, hoje).map((s) => s.id)).toEqual(["t"]);
  });
  it("busca casa CNPJ sem pontuação e nome do titular", () => {
    expect(filtrarContratantes(rows, f({ q: "12345678" }), nome, hoje).map((s) => s.id)).toEqual(["a"]);
    expect(filtrarContratantes(rows, f({ q: "ana souza" }), nome, hoje).map((s) => s.id)).toEqual(["a"]);
  });
  it("vence em 7 dias ignora cancelada", () => {
    expect(filtrarContratantes(rows, f({ status: "all", atalhos: ["vence7"] }), nome, hoje).map((s) => s.id)).toEqual(["a"]);
  });
  it("isentos usa isExempt e forma manual exige sem assinatura externa", () => {
    expect(filtrarContratantes(rows, f({ cobranca: "isentos" }), nome, hoje).map((s) => s.id)).toEqual(["b"]);
    expect(filtrarContratantes(rows, f({ forma: "manual" }), nome, hoje).map((s) => s.id)).toEqual(["b"]);
  });
  it("URL inválida volta ao padrão e padrão não vai para a URL", () => {
    const l = lerContratantes(new URLSearchParams("status=xyz&modulo=foo&atalhos=bad,trial3&ini_de=31/12"), ["active"]);
    expect(l).toMatchObject({ status: "vigentes", modulo: "", atalhos: ["trial3"], ini_de: "" });
    expect(escrever(new URLSearchParams(), PADRAO_CONTRATANTES as any, PADRAO_CONTRATANTES as any, { status: "status", q: "q" }).toString()).toBe("");
  });
  it("ordena por valor desc", () => {
    expect(ordenar(rows, "valor", "desc", nome).map((s) => s.id)).toEqual(["a", "c", "b"]);
  });
});
