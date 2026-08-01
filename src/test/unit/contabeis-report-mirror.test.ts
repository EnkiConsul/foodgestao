/**
 * Testes do espelho puro da RPC `chart_accounts_report`.
 *
 * Rodam sempre (sem rede) e garantem que a lógica usada nos testes de
 * integração — regime, recorte de período e consolidação hierárquica — está
 * correta antes de ser comparada com o banco.
 */
import { describe, it, expect } from "vitest";
import {
  mirrorReport,
  mirrorEntry,
  type MirrorAccount,
  type MirrorTransaction,
} from "@/lib/relatorios/reportRpcMirror";

const ACCOUNTS: MirrorAccount[] = [
  { id: "a3", code: "3", name: "Receitas" },
  { id: "a31", code: "3.1", name: "Comissões" },
  { id: "a4", code: "4", name: "Custos" },
  { id: "a41", code: "4.1", name: "Custos Diversos" },
  { id: "a5", code: "5", name: "Despesas" },
];

const tx = (o: Partial<MirrorTransaction>): MirrorTransaction => ({
  account_id: "a31",
  transaction_type: "entrada",
  status: "confirmado",
  amount: 100,
  amount_paid: 100,
  due_date: "2026-07-10",
  transaction_date: "2026-07-10",
  payment_date: "2026-07-10",
  ...o,
});

const JUL = { from: "2026-07-01", to: "2026-07-31" };

describe("espelho da RPC: regime", () => {
  it("competência usa due_date e amount", () => {
    expect(
      mirrorEntry(tx({ amount: 250, due_date: "2026-08-02", payment_date: null }), "competencia")
    ).toEqual({ date: "2026-08-02", value: 250 });
  });

  it("competência cai para transaction_date quando não há vencimento", () => {
    expect(
      mirrorEntry(tx({ due_date: null, transaction_date: "2026-07-05" }), "competencia")
    ).toEqual({ date: "2026-07-05", value: 100 });
  });

  it("caixa exige pagamento e usa amount_paid", () => {
    expect(mirrorEntry(tx({ amount_paid: 0, payment_date: null }), "caixa")).toBeNull();
    expect(
      mirrorEntry(tx({ amount: 300, amount_paid: 120, payment_date: "2026-07-20" }), "caixa")
    ).toEqual({ date: "2026-07-20", value: 120 });
  });

  it("ignora cancelados e transferências", () => {
    expect(mirrorEntry(tx({ status: "cancelado" }), "competencia")).toBeNull();
    expect(mirrorEntry(tx({ transaction_type: "transferencia" }), "competencia")).toBeNull();
  });
});

describe("espelho da RPC: consolidação e filtros", () => {
  const TX: MirrorTransaction[] = [
    tx({ account_id: "a31", amount: 1000, amount_paid: 1000 }),
    tx({ account_id: "a41", transaction_type: "saida", amount: 400, amount_paid: 400 }),
    tx({
      account_id: "a41",
      transaction_type: "saida",
      amount: 80,
      amount_paid: 0,
      payment_date: null,
      due_date: "2026-07-25",
    }),
  ];

  it("saldo consolidado sobe para a conta sintética", () => {
    const rows = mirrorReport(ACCOUNTS, TX, { ...JUL, regime: "competencia" });
    const map = new Map(rows.map((r) => [r.code, r]));
    expect(map.get("3")!.saldo_proprio).toBe(0);
    expect(map.get("3")!.saldo_consolidado).toBe(1000);
    expect(map.get("4")!.saldo_consolidado).toBe(-480);
    expect(map.get("4.1")!.debitos).toBe(480);
  });

  it("caixa remove o pendente do consolidado", () => {
    const rows = mirrorReport(ACCOUNTS, TX, { ...JUL, regime: "caixa" });
    const map = new Map(rows.map((r) => [r.code, r]));
    expect(map.get("4")!.saldo_consolidado).toBe(-400);
  });

  it("sem include_zero oculta contas sem movimento (própria e filhos)", () => {
    const rows = mirrorReport(ACCOUNTS, TX, { ...JUL, regime: "competencia" });
    expect(rows.map((r) => r.code)).toEqual(["3", "3.1", "4", "4.1"]);
    const all = mirrorReport(ACCOUNTS, TX, { ...JUL, regime: "competencia", include_zero: true });
    expect(all.map((r) => r.code)).toEqual(["3", "3.1", "4", "4.1", "5"]);
    expect(all.find((r) => r.code === "5")!.has_movement).toBe(false);
  });

  it("período fora do intervalo zera tudo", () => {
    const rows = mirrorReport(ACCOUNTS, TX, {
      from: "2026-10-01",
      to: "2026-10-31",
      regime: "competencia",
    });
    expect(rows).toHaveLength(0);
  });

  it("filtro de centro de custo restringe os lançamentos", () => {
    const withCc = [tx({ account_id: "a31", amount: 500, cost_center_id: "cc1" })];
    const inScope = mirrorReport(ACCOUNTS, withCc, {
      ...JUL,
      regime: "competencia",
      cost_center_ids: ["cc1"],
    });
    const outScope = mirrorReport(ACCOUNTS, withCc, {
      ...JUL,
      regime: "competencia",
      cost_center_ids: ["cc2"],
    });
    expect(inScope.find((r) => r.code === "3.1")!.creditos).toBe(500);
    expect(outScope).toHaveLength(0);
  });
});
