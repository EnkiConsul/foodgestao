import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { DP_COL_MIN_WIDTH } from "@/components/dp/DpTableColumnHeader";
import { supabase } from "@/integrations/supabase/client";

interface TableLayout {
  screen_key: string;
  column_order: string[];
  column_widths: Record<string, number>;
  updated_at: string;
}

/**
 * Estado de colunas em formato de planilha para as listas do módulo Pessoas:
 * ordem (drag & drop), largura (arraste da alça), ordenação e filtros por valor.
 * Tudo persistido no navegador a partir de uma chave de tela.
 *
 * Quando `screenKey` é informado, o layout padrão global salvo no banco
 * (app_table_layouts) é aplicado automaticamente. Super admins podem salvar
 * o layout atual como padrão global. O localStorage continua funcionando como
 * camada pessoal de override.
 */
export function useDpTableColumns<K extends string, S extends string>(opts: {
  /** Prefixo das chaves de localStorage, ex.: "dp_colabs_col". */
  storageKey: string;
  /** Identificador da tela no padrão global, ex.: "dp_colaboradores". */
  screenKey?: string;
  defaultOrder: K[];
  defaultWidths: Record<K, number>;
  /** Largura fixa da coluna de ações (somada ao total). */
  acoesWidth?: number;
  defaultSortKey: S;
  defaultSortDir?: "asc" | "desc";
}) {
  const { storageKey, screenKey, defaultOrder, defaultWidths, acoesWidth = 0, defaultSortKey } = opts;
  const orderStorage = `${storageKey}_order`;
  const widthStorage = `${storageKey}_width`;
  const layoutTsStorage = `${storageKey}_layout_ts`;

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

  const layoutQuery = useQuery<TableLayout | null>({
    queryKey: ["app-table-layout", screenKey],
    queryFn: async () => {
      if (!screenKey) return null;
      const { data, error } = await supabase
        .from("app_table_layouts")
        .select("screen_key, column_order, column_widths, updated_at")
        .eq("screen_key", screenKey)
        .single();
      if (error) {
        if (error.code === "PGRST116") return null; // nenhum registro encontrado
        throw error;
      }
      return data as TableLayout;
    },
    enabled: !!screenKey,
    staleTime: 5 * 60 * 1000,
  });

  /** Aplica o layout global quando ele for mais recente que o armazenado localmente. */
  useEffect(() => {
    const layout = layoutQuery.data;
    if (!layout || !screenKey) return;

    try {
      const storedTs = localStorage.getItem(layoutTsStorage);
      const dbTs = new Date(layout.updated_at).getTime();
      if (storedTs && Number(storedTs) >= dbTs) return; // local já reflete o padrão atual

      const order = (layout.column_order ?? []).filter((k) => defaultOrder.includes(k as K)) as K[];
      const faltantes = defaultOrder.filter((k) => !order.includes(k));
      const nextOrder = order.length ? [...order, ...faltantes] : defaultOrder;

      const nextWidths = { ...defaultWidths };
      Object.entries(layout.column_widths ?? {}).forEach(([k, v]) => {
        if (!defaultOrder.includes(k as K)) return;
        const n = Number(v);
        if (Number.isFinite(n) && n >= DP_COL_MIN_WIDTH) nextWidths[k as K] = n;
      });

      setColOrder(nextOrder);
      setColWidths(nextWidths);
      localStorage.setItem(orderStorage, JSON.stringify(nextOrder));
      localStorage.setItem(widthStorage, JSON.stringify(nextWidths));
      localStorage.setItem(layoutTsStorage, String(dbTs));
    } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutQuery.data, screenKey]);

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
    layoutLoading: layoutQuery.isLoading,
  };
}
