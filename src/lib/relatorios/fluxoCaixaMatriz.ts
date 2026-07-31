/**
 * Motor puro do Relatório de Fluxo de Caixa (matriz Categoria × Mês).
 * Sem dependência de React/Supabase para ser testável isoladamente.
 */

export type DateBasis = "pagamento" | "vencimento";

export type MatrizCategory = {
  id: string;
  name: string;
  parent_id: string | null;
  transaction_type: string | null;
};

export type MatrizTransaction = {
  category_id: string | null;
  amount: number | string | null;
  amount_paid: number | string | null;
  transaction_type: string | null;
  parcel_direction?: string | null;
  transaction_date: string | null;
  due_date: string | null;
  payment_date: string | null;
  status: string | null;
};

export type MatrizRowKind = "group" | "category" | "saldo" | "transferencia";

export type MatrizRow = {
  /** id único da linha (categoria, "__sem_categoria_entrada__", "__grp_entrada__"...) */
  id: string;
  parentId: string | null;
  kind: MatrizRowKind;
  /** "entrada" | "saida" | null (linha de saldo) */
  side: "entrada" | "saida" | null;
  index: string;
  name: string;
  depth: number;
  hasChildren: boolean;
  values: number[];
  total: number;
  media: number;
};

export type MatrizResult = {
  months: string[]; // "yyyy-MM"
  rows: MatrizRow[];
  totals: {
    entradas: number[];
    saidas: number[];
    saldo: number[];
    totalEntradas: number;
    totalSaidas: number;
    totalSaldo: number;
    transferencias: number[];
    totalTransferencias: number;
  };
};

export const SEM_CATEGORIA_PREFIX = "__sem_categoria__";

export function monthsBetween(from: string, to: string): string[] {
  // from/to no formato "yyyy-MM"
  const out: string[] = [];
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  let y = fy;
  let m = fm;
  let guard = 0;
  while ((y < ty || (y === ty && m <= tm)) && guard++ < 240) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

/** Tipo efetivo do lançamento para o fluxo de caixa. */
export function effectiveSide(t: MatrizTransaction): "entrada" | "saida" | null {
  const tt = t.transaction_type;
  if (tt === "entrada" || tt === "saida") return tt;
  if (tt === "parcelamento") {
    if (t.parcel_direction === "entrada" || t.parcel_direction === "saida") return t.parcel_direction;
    return null;
  }
  return null; // transferências não entram no fluxo por categoria
}

/** Data efetiva conforme a base escolhida. */
export function effectiveDate(t: MatrizTransaction, basis: DateBasis): string | null {
  if (basis === "pagamento") return t.payment_date ?? null;
  return t.due_date ?? t.transaction_date ?? null;
}

/** Valor efetivo conforme a base escolhida. */
export function effectiveAmount(t: MatrizTransaction, basis: DateBasis): number {
  const amount = Number(t.amount ?? 0);
  const paid = Number(t.amount_paid ?? 0);
  if (basis === "pagamento") return paid > 0 ? paid : amount;
  return amount;
}

type BuildParams = {
  categories: MatrizCategory[];
  transactions: MatrizTransaction[];
  months: string[];
  basis: DateBasis;
  /** oculta linhas cujo total é zero (e sem filhos com movimento) */
  hideEmpty?: boolean;
};

export function buildFluxoMatriz({
  categories,
  transactions,
  months,
  basis,
  hideEmpty = true,
}: BuildParams): MatrizResult {
  const monthIndex = new Map(months.map((m, i) => [m, i]));
  const zeros = () => months.map(() => 0);

  // ── 1. Agregação bruta por categoria/mês ────────────────────────────────
  const own = new Map<string, number[]>(); // key = categoryId | SEM_CATEGORIA_PREFIX+side
  const semCategoria: Record<"entrada" | "saida", number[]> = {
    entrada: zeros(),
    saida: zeros(),
  };
  const catById = new Map(categories.map((c) => [c.id, c]));
  const transferencias = zeros();

  for (const t of transactions) {
    if (t.status === "cancelado") continue;
    const side = effectiveSide(t);
    const date = effectiveDate(t, basis);
    if (!date) continue;
    const key = date.slice(0, 7);
    const idx = monthIndex.get(key);
    if (idx === undefined) continue;
    const value = effectiveAmount(t, basis);
    if (!value) continue;

    if (!side) {
      // Transferências entre contas: fora do fluxo por categoria, exibidas à parte.
      if (t.transaction_type === "transferencia") transferencias[idx] += value;
      continue;
    }

    if (t.category_id && catById.has(t.category_id)) {
      const arr = own.get(t.category_id) ?? zeros();
      arr[idx] += value;
      own.set(t.category_id, arr);
    } else {
      semCategoria[side][idx] += value;
    }
  }

  // ── 2. Árvore de categorias por lado ────────────────────────────────────
  const childrenOf = new Map<string | null, MatrizCategory[]>();
  const validIds = new Set(categories.map((c) => c.id));
  for (const c of categories) {
    // pai fora da lista acessível vira raiz
    const parent = c.parent_id && validIds.has(c.parent_id) ? c.parent_id : null;
    const list = childrenOf.get(parent) ?? [];
    list.push(c);
    childrenOf.set(parent, list);
  }

  /** Tipo da categoria herdado do ancestral raiz. */
  const sideOf = new Map<string, "entrada" | "saida">();
  const resolveSide = (c: MatrizCategory): "entrada" | "saida" => {
    const cached = sideOf.get(c.id);
    if (cached) return cached;
    let cur: MatrizCategory | undefined = c;
    let side: "entrada" | "saida" = "saida";
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (cur.transaction_type === "entrada" || cur.transaction_type === "saida") {
        side = cur.transaction_type;
        break;
      }
      cur = cur.parent_id ? catById.get(cur.parent_id) : undefined;
    }
    sideOf.set(c.id, side);
    return side;
  };

  const rows: MatrizRow[] = [];
  const entradas = zeros();
  const saidas = zeros();

  const sum = (a: number[], b: number[]) => a.map((v, i) => v + b[i]);

  function walk(
    node: MatrizCategory,
    depth: number,
    index: string,
    side: "entrada" | "saida",
    parentRowId: string | null,
  ): number[] {
    const kids = (childrenOf.get(node.id) ?? []).filter((k) => resolveSide(k) === side);
    const rowRef: MatrizRow = {
      id: node.id,
      parentId: parentRowId,
      kind: "category",
      side,
      index,
      name: node.name,
      depth,
      hasChildren: false,
      values: zeros(),
      total: 0,
      media: 0,
    };
    const placeholder = rows.length;
    rows.push(rowRef);

    let acc = own.get(node.id) ? [...own.get(node.id)!] : zeros();
    let visibleKids = 0;
    kids.forEach((kid, i) => {
      const kidValues = walk(kid, depth + 1, `${index}.${i + 1}`, side, node.id);
      acc = sum(acc, kidValues);
      if (kidValues.some((v) => v !== 0)) visibleKids++;
    });

    rowRef.values = acc;
    rowRef.total = acc.reduce((s, v) => s + v, 0);
    rowRef.media = months.length ? rowRef.total / months.length : 0;
    rowRef.hasChildren = rows.some((r) => r.parentId === node.id);

    if (hideEmpty && rowRef.total === 0 && visibleKids === 0) {
      // remove esta linha e as descendentes já inseridas
      rows.splice(placeholder, rows.length - placeholder);
    }
    return acc;
  }

  for (const side of ["entrada", "saida"] as const) {
    const label = side === "entrada" ? "ENTRADAS" : "SAÍDAS";
    const groupId = `__grp_${side}__`;
    const group: MatrizRow = {
      id: groupId,
      parentId: null,
      kind: "group",
      side,
      index: "",
      name: label,
      depth: 0,
      hasChildren: true,
      values: zeros(),
      total: 0,
      media: 0,
    };
    rows.push(group);

    const roots = (childrenOf.get(null) ?? []).filter((c) => resolveSide(c) === side);
    let acc = zeros();
    roots.forEach((root, i) => {
      const v = walk(root, 1, `${i + 1}`, side, groupId);
      acc = sum(acc, v);
    });

    const sc = semCategoria[side];
    if (sc.some((v) => v !== 0)) {
      const total = sc.reduce((s, v) => s + v, 0);
      rows.push({
        id: `${SEM_CATEGORIA_PREFIX}${side}`,
        parentId: groupId,
        kind: "category",
        side,
        index: "",
        name: "Sem categoria",
        depth: 1,
        hasChildren: false,
        values: [...sc],
        total,
        media: months.length ? total / months.length : 0,
      });
      acc = sum(acc, sc);
    }

    group.values = acc;
    group.total = acc.reduce((s, v) => s + v, 0);
    group.media = months.length ? group.total / months.length : 0;
    group.hasChildren = rows.some((r) => r.parentId === groupId);

    if (side === "entrada") acc.forEach((v, i) => (entradas[i] += v));
    else acc.forEach((v, i) => (saidas[i] += v));
  }

  const saldo = months.map((_, i) => entradas[i] - saidas[i]);
  const totalEntradas = entradas.reduce((s, v) => s + v, 0);
  const totalSaidas = saidas.reduce((s, v) => s + v, 0);
  const totalSaldo = totalEntradas - totalSaidas;

  rows.push({
    id: "__saldo__",
    parentId: null,
    kind: "saldo",
    side: null,
    index: "",
    name: "SALDO",
    depth: 0,
    hasChildren: false,
    values: saldo,
    total: totalSaldo,
    media: months.length ? totalSaldo / months.length : 0,
  });

  const totalTransferencias = transferencias.reduce((s, v) => s + v, 0);
  if (!hideEmpty || totalTransferencias !== 0) {
    rows.push({
      id: "__transferencias__",
      parentId: null,
      kind: "transferencia",
      side: null,
      index: "",
      name: "TRANSFERÊNCIAS",
      depth: 0,
      hasChildren: false,
      values: transferencias,
      total: totalTransferencias,
      media: months.length ? totalTransferencias / months.length : 0,
    });
  }

  return {
    months,
    rows,
    totals: {
      entradas,
      saidas,
      saldo,
      totalEntradas,
      totalSaidas,
      totalSaldo,
      transferencias,
      totalTransferencias,
    },
  };
}

/** Linhas visíveis dado um conjunto de nós recolhidos. */
export function visibleRows(rows: MatrizRow[], collapsed: Set<string>): MatrizRow[] {
  const hidden = new Set<string>();
  return rows.filter((r) => {
    if (r.parentId && (collapsed.has(r.parentId) || hidden.has(r.parentId))) {
      hidden.add(r.id);
      return false;
    }
    return true;
  });
}
