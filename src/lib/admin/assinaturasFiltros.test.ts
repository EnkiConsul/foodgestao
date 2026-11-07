import { describe, it, expect } from "vitest";
import { PADRAO_CONTRATANTES, filtrarContratantes, lerContratantes, resumo, ordenar, escrever } from "./assinaturasFiltros";

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
    expect(r).toEqual({ total: 2, pagantes: 1, isentos: 1, valorPagantesCents: 14000 });
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
