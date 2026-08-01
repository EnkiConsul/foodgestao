/**
 * Fábrica de fixtures sintéticas de grande volume para os testes de
 * performance/robustez dos relatórios contábeis.
 *
 * Gera um plano de contas realista (5 raízes da DRE × sintéticas × analíticas)
 * e lançamentos distribuídos ao longo de 12 meses, permitindo medir custo de
 * recomputação ao trocar período/regime.
 */
import type { ReportNode } from "@/hooks/useContabeisReport";
import type { MirrorAccount, MirrorTransaction } from "@/lib/relatorios/reportRpcMirror";

const ROOTS: Array<{ code: string; name: string; nature: string; sign: number }> = [
  { code: "4", name: "RECEITAS", nature: "receita", sign: 1 },
  { code: "5", name: "CUSTOS", nature: "custo", sign: -1 },
  { code: "6", name: "DESPESAS OPERACIONAIS", nature: "despesa_operacional", sign: -1 },
  { code: "7", name: "DESPESAS FINANCEIRAS", nature: "despesa_financeira", sign: -1 },
  { code: "8", name: "IMPOSTOS", nature: "imposto", sign: -1 },
];

/** PRNG determinístico para fixtures reprodutíveis. */
export function seededRandom(seed = 42) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export interface AccountPlan {
  nodes: ReportNode[];
  mirrorAccounts: MirrorAccount[];
  analyticIds: string[];
}

/**
 * Plano de contas com `syntheticsPerRoot` sintéticas e `analyticsPerSynthetic`
 * analíticas em cada uma (total = 5 * s * (1 + a) + 5).
 */
export function buildAccountPlan(syntheticsPerRoot = 8, analyticsPerSynthetic = 25): AccountPlan {
  const nodes: ReportNode[] = [];
  const mirrorAccounts: MirrorAccount[] = [];
  const analyticIds: string[] = [];

  const push = (n: ReportNode) => {
    nodes.push(n);
    mirrorAccounts.push({ id: n.id, code: n.code, name: n.name });
  };

  const base = (over: Partial<ReportNode> & { id: string; code: string; name: string }): ReportNode => ({
    parent_id: null,
    level: 1,
    is_analytic: false,
    is_active: true,
    root_code: over.code.split(".")[0],
    nature: null,
    dre_sign: null,
    in_dre: true,
    in_balance: false,
    debitos: 0,
    creditos: 0,
    saldo_proprio: 0,
    saldo_consolidado: 0,
    has_movement: false,
    ...over,
  });

  for (const root of ROOTS) {
    const rootId = `acc-${root.code}`;
    push(
      base({
        id: rootId,
        code: root.code,
        name: root.name,
        level: 1,
        nature: root.nature,
        dre_sign: root.sign,
      })
    );

    for (let s = 1; s <= syntheticsPerRoot; s++) {
      const sCode = `${root.code}.${s}`;
      const sId = `acc-${sCode}`;
      push(
        base({
          id: sId,
          code: sCode,
          name: `${root.name} — Grupo ${s}`,
          parent_id: rootId,
          level: 2,
          nature: root.nature,
          dre_sign: root.sign,
        })
      );

      for (let a = 1; a <= analyticsPerSynthetic; a++) {
        const aCode = `${sCode}.${a}`;
        const aId = `acc-${aCode}`;
        analyticIds.push(aId);
        push(
          base({
            id: aId,
            code: aCode,
            name: `Conta ${aCode}`,
            parent_id: sId,
            level: 3,
            is_analytic: true,
            nature: root.nature,
            dre_sign: root.sign,
          })
        );
      }
    }
  }

  return { nodes, mirrorAccounts, analyticIds };
}

/** Lançamentos distribuídos em 12 meses do ano informado. */
export function buildTransactions(
  analyticIds: string[],
  count: number,
  year = 2026,
  seed = 7
): MirrorTransaction[] {
  const rnd = seededRandom(seed);
  const txs: MirrorTransaction[] = new Array(count);

  for (let i = 0; i < count; i++) {
    const accountId = analyticIds[i % analyticIds.length];
    const isReceita = accountId.startsWith("acc-4");
    const month = String(1 + Math.floor(rnd() * 12)).padStart(2, "0");
    const day = String(1 + Math.floor(rnd() * 28)).padStart(2, "0");
    const date = `${year}-${month}-${day}`;
    const amount = Math.round((50 + rnd() * 250_000) * 100) / 100;
    // 20% sem pagamento → diferencia competência de caixa
    const paid = rnd() < 0.2 ? 0 : amount;

    txs[i] = {
      account_id: accountId,
      transaction_type: isReceita ? "entrada" : "saida",
      status: rnd() < 0.03 ? "cancelado" : "confirmado",
      amount,
      amount_paid: paid,
      due_date: date,
      transaction_date: date,
      payment_date: paid ? date : null,
    };
  }

  return txs;
}

/**
 * Aplica os saldos do espelho da RPC sobre os nós do relatório, produzindo o
 * mesmo payload que o front-end recebe do banco.
 */
export function applyBalances(
  nodes: ReportNode[],
  rows: Array<{ code: string; debitos: number; creditos: number; saldo_proprio: number; saldo_consolidado: number; has_movement: boolean }>
): ReportNode[] {
  const byCode = new Map(rows.map((r) => [r.code, r]));
  return nodes.map((n) => {
    const r = byCode.get(n.code);
    if (!r) return { ...n, debitos: 0, creditos: 0, saldo_proprio: 0, saldo_consolidado: 0, has_movement: false };
    return {
      ...n,
      debitos: r.debitos,
      creditos: r.creditos,
      saldo_proprio: r.saldo_proprio,
      saldo_consolidado: r.saldo_consolidado,
      has_movement: r.has_movement,
    };
  });
}
