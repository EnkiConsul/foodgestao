import { useCallback, useEffect, useMemo, useState } from "react";

import { DP_COL_MIN_WIDTH } from "@/components/dp/DpTableColumnHeader";

/**
 * Estado de colunas em formato de planilha para as listas do módulo Pessoas:
 * ordem (drag & drop), largura (arraste da alça), ordenação e filtros por valor.
 * Tudo persistido no navegador a partir de uma chave de tela.
 */
export function useDpTableColumns<K extends string, S extends string>(opts: {
  /** Prefixo das chaves de localStorage, ex.: "dp_colabs_col". */
  storageKey: string;
  defaultOrder: K[];
  defaultWidths: Record<K, number>;
  /** Largura fixa da coluna de ações (somada ao total). */
  acoesWidth?: number;
  defaultSortKey: S;
  defaultSortDir?: "asc" | "desc";
}) {
  const { storageKey, defaultOrder, defaultWidths, acoesWidth = 0, defaultSortKey } = opts;
  const orderStorage = `${storageKey}_order`;
  const widthStorage = `${storageKey}_width`;

  const [sortKey, setSortKey] = useState<S>(defaultSortKey);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(opts.defaultSortDir ?? "asc");

  const emptyFilters = useMemo(() => {
    const base = {} as Record<K, string[]>;
    defaultOrder.forEach((k) => { base[k] = []; });
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [colFilters, setColFilters] = useState<Record<K, string[]>>(emptyFilters);

  const [colOrder, setColOrder] = useState<K[]>(() => {
    try {
      const raw = localStorage.getItem(orderStorage);
      if (raw) {
        const parsed = JSON.parse(raw) as K[];
        const validos = parsed.filter((k) => defaultOrder.includes(k));
        const faltantes = defaultOrder.filter((k) => !validos.includes(k));
        if (validos.length) return [...validos, ...faltantes];
      }
    } catch { /* ignora storage inválido */ }
    return defaultOrder;
  });

  const [colWidths, setColWidths] = useState<Record<K, number>>(() => {
    try {
      const raw = localStorage.getItem(widthStorage);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Record<K, number>>;
        const merged = { ...defaultWidths };
        (Object.keys(defaultWidths) as K[]).forEach((k) => {
          const v = Number(parsed[k]);
          if (Number.isFinite(v) && v >= DP_COL_MIN_WIDTH) merged[k] = v;
        });
        return merged;
      }
    } catch { /* ignora storage inválido */ }
    return defaultWidths;
  });

  const [dragCol, setDragCol] = useState<K | null>(null);

  useEffect(() => {
    try { localStorage.setItem(orderStorage, JSON.stringify(colOrder)); } catch { /* noop */ }
  }, [colOrder, orderStorage]);

  useEffect(() => {
    try { localStorage.setItem(widthStorage, JSON.stringify(colWidths)); } catch { /* noop */ }
  }, [colWidths, widthStorage]);

  const larguraTotal = useMemo(
    () => colOrder.reduce((acc, k) => acc + colWidths[k], acoesWidth),
    [colOrder, colWidths, acoesWidth],
  );

  /** Reordena colocando a coluna arrastada na posição do alvo. */
  const soltarSobre = useCallback((alvo: K) => {
    setColOrder((prev) => {
      if (!dragCol || dragCol === alvo) return prev;
      const arr = prev.filter((k) => k !== dragCol);
      const idx = arr.indexOf(alvo);
      arr.splice(idx < 0 ? arr.length : idx, 0, dragCol);
      return arr;
    });
    setDragCol(null);
  }, [dragCol]);

  const toggleColValue = useCallback((k: K, v: string) => {
    setColFilters((prev) => {
      const sel = prev[k] ?? [];
      return { ...prev, [k]: sel.includes(v) ? sel.filter((x) => x !== v) : [...sel, v] };
    });
  }, []);

  const resize = useCallback((k: K, largura: number) => {
    setColWidths((p) => ({ ...p, [k]: largura }));
  }, []);

  const resetWidth = useCallback((k: K) => {
    setColWidths((p) => ({ ...p, [k]: defaultWidths[k] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const aplicarSort = useCallback((key: S, dir: "asc" | "desc") => {
    setSortKey(key);
    setSortDir(dir);
  }, []);

  const limparFiltros = useCallback(() => setColFilters(emptyFilters), [emptyFilters]);

  return {
    colOrder, setColOrder,
    colWidths, setColWidths, resize, resetWidth,
    dragCol, setDragCol, soltarSobre,
    colFilters, setColFilters, toggleColValue, limparFiltros,
    sortKey, sortDir, aplicarSort,
    larguraTotal,
  };
}
