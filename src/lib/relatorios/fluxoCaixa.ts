import { eachMonthOfInterval, endOfMonth, format, startOfMonth, startOfYear, endOfYear, subMonths } from "date-fns";

export type PeriodPreset = "month" | "3months" | "6months" | "year" | "custom";

export type FluxoCategory = {
  id: string;
  name: string;
  color?: string | null;
  transaction_type: string;
  parent_id: string | null;
  sort_order: number | null;
};

export type FluxoTransaction = {
  amount: number | string;
  amount_paid?: number | string | null;
  transaction_type: string;
  transaction_date: string;
  category_id: string | null;
  account_id: string | null;
  status: string;
  due_date?: string | null;
  parcel_direction?: string | null;

  payment_method_id?: string | null;
  contact_id?: string | null;
};

export type FluxoNode = {
  id: string;
  name: string;
  type: string;
  months: number[];
  children: FluxoNode[];
  depth: number;
};

export type FluxoCaixaData = {
  MONTH_LABELS: string[];
  totalReceitas: number[];
  totalDespesas: number[];
  totalSaldo: number[];
  receitaTree: FluxoNode[];
  despesaTree: FluxoNode[];
  sumArr: (arr: number[]) => number;
  avgArr: (arr: number[]) => number;
};

export function getPeriodRange(preset: PeriodPreset): { from: Date; to: Date } {
  const now = new Date();
  switch (preset) {
    case "month":
      return { from: startOfMonth(now), to: endOfMonth(now) };
    case "3months":
      return { from: startOfMonth(subMonths(now, 2)), to: endOfMonth(now) };
    case "6months":
      return { from: startOfMonth(subMonths(now, 5)), to: endOfMonth(now) };
    case "year":
    default:
      return { from: startOfYear(now), to: endOfYear(now) };
  }
}

export function computeFluxoCaixa(
  filteredTransactions: FluxoTransaction[],
  categories: FluxoCategory[],
  activeRange: { from: Date; to: Date }
): FluxoCaixaData {
  const monthIntervals = eachMonthOfInterval({
    start: startOfMonth(activeRange.from),
    end: endOfMonth(activeRange.to),
  });
  const MONTH_SHORT = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
  const monthKeys = monthIntervals.map((d) => format(d, "yyyy-MM"));
  const MONTH_LABELS = monthIntervals.map((d) => {
    const m = d.getMonth();
    const y = d.getFullYear().toString().slice(2);
    return monthKeys.length > 12 ? `${MONTH_SHORT[m]}/${y}` : MONTH_SHORT[m];
  });
  const numMonths = monthKeys.length;

  const catMap: Record<string, FluxoCategory> = Object.fromEntries(categories.map((c) => [c.id, c]));

  const monthIndexMap: Record<string, number> = {};
  monthKeys.forEach((k, i) => { monthIndexMap[k] = i; });

  // Acumula por TIPO efetivo do lançamento (receita/despesa), não pelo tipo
  // cadastrado na categoria — assim categorias "ambos" ou de tipo divergente
  // continuam aparecendo no detalhamento.
  const catMonthly: Record<"receita" | "despesa", Record<string, number[]>> = {
    receita: {},
    despesa: {},
  };
  const uncategorized: Record<"receita" | "despesa", number[]> = {
    receita: new Array(numMonths).fill(0),
    despesa: new Array(numMonths).fill(0),
  };
  const totalReceitas = new Array(numMonths).fill(0);
  const totalDespesas = new Array(numMonths).fill(0);

  for (const t of filteredTransactions) {
    if (t.transaction_type === "transferencia") continue;
    // Data efetiva: vencimento quando existe, senão a data do lançamento
    // (mesma regra usada em Lançamentos e no Dashboard).
    const key = (t.due_date ?? t.transaction_date).slice(0, 7);
    const idx = monthIndexMap[key];
    if (idx === undefined) continue;
    const amt = Number(t.amount);
    const isReceita =
      t.transaction_type === "receita" ||
      (t.transaction_type === "parcelado" && t.parcel_direction === "entrada");
    const type: "receita" | "despesa" = isReceita ? "receita" : "despesa";
    if (isReceita) totalReceitas[idx] += amt;
    else totalDespesas[idx] += amt;

    if (t.category_id && catMap[t.category_id]) {
      const bucket = catMonthly[type];
      if (!bucket[t.category_id]) bucket[t.category_id] = new Array(numMonths).fill(0);
      bucket[t.category_id][idx] += amt;
    } else {
      uncategorized[type][idx] += amt;
    }
  }

  const totalSaldo = totalReceitas.map((r, i) => r - totalDespesas[i]);
  const sumArr = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  const avgArr = (arr: number[]) => {
    const nonZero = arr.filter((v) => v > 0);
    return nonZero.length > 0 ? sumArr(nonZero) / nonZero.length : 0;
  };

  const buildTree = (type: "receita" | "despesa"): FluxoNode[] => {
    const monthlyByCat = catMonthly[type];

    const catsWithData = new Set<string>();
    for (const catId of Object.keys(monthlyByCat)) {
      let current: string | null = catId;
      while (current) {
        catsWithData.add(current);
        current = catMap[current]?.parent_id ?? null;
      }
    }

    // Ordena do mesmo modo que a página de Categorias (sort_order, depois name),
    // para que a hierarquia coincida com o cadastro.
    const sortSiblings = (arr: FluxoCategory[]) =>
      arr.slice().sort((a, b) => {
        // Postgres ORDER BY sort_order ASC coloca NULL por último — replicamos aqui
        // para casar exatamente com a ordem exibida em /categorias.
        const sa = a.sort_order ?? Number.POSITIVE_INFINITY;
        const sb = b.sort_order ?? Number.POSITIVE_INFINITY;
        if (sa !== sb) return sa - sb;
        return (a.name || "").localeCompare(b.name || "");
      });

    const buildNodes = (parentId: string | null): FluxoNode[] => {
      const siblings = sortSiblings(
        categories.filter((c) => (c.parent_id ?? null) === parentId && catsWithData.has(c.id))
      );
      return siblings.map((c) => {
        const children = buildNodes(c.id);
        const leafMonths = monthlyByCat[c.id] || new Array(numMonths).fill(0);
        const months = children.length > 0
          ? leafMonths.map((v: number, i: number) => v + children.reduce((sum, ch) => sum + ch.months[i], 0))
          : [...leafMonths];
        return {
          id: `${type}:${c.id}`,
          name: c.name,
          type,
          months,
          children,
          depth: 0,
        };
      });
    };

    const nodes = buildNodes(null);
    if (uncategorized[type].some((v) => v !== 0)) {
      nodes.push({
        id: `${type}:sem-categoria`,
        name: "Sem categoria",
        type,
        months: [...uncategorized[type]],
        children: [],
        depth: 0,
      });
    }
    return nodes;
  };



  return {
    MONTH_LABELS,
    totalReceitas,
    totalDespesas,
    totalSaldo,
    receitaTree: buildTree("receita"),
    despesaTree: buildTree("despesa"),
    sumArr,
    avgArr,
  };
}

export function flattenFluxoTree(
  nodes: FluxoNode[],
  depth: number,
  collapsedIds: Set<string>
): FluxoNode[] {
  const result: FluxoNode[] = [];
  for (const node of nodes) {
    result.push({ ...node, depth });
    if (node.children.length > 0 && !collapsedIds.has(node.id)) {
      result.push(...flattenFluxoTree(node.children, depth + 1, collapsedIds));
    }
  }
  return result;
}

export function collectParentIds(nodes: FluxoNode[]): string[] {
  const ids: string[] = [];
  for (const n of nodes) {
    if (n.children && n.children.length > 0) {
      ids.push(n.id);
      ids.push(...collectParentIds(n.children));
    }
  }
  return ids;
}
