import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { DP_COL_MIN_WIDTH } from "@/components/dp/DpTableColumnHeader";
import { useDpUserPrefs } from "@/hooks/useDpUserPrefs";
import { supabase } from "@/integrations/supabase/client";
import {
  mergeTableLayoutExtras,
  removeTableLayoutExtras,
  sanitizeHidden as sanitizeHiddenLib,
  sanitizeOrder as sanitizeOrderLib,
  sanitizeWidths as sanitizeWidthsLib,
  toggleHiddenKey,
} from "@/lib/table-layouts";

interface TableLayout {
  screen_key: string;
  column_order: string[];
  column_widths: Record<string, number>;
  updated_at: string;
}

/** Layout individual salvo em dp_user_prefs.extras.table_layouts[screenKey]. */
interface IndividualLayout<K extends string> {
  order: K[];
  widths: Record<K, number>;
  hidden: K[];
}

/**
 * Estado de colunas em formato de planilha para as listas densas:
 * ordem (drag & drop), largura (arraste da alça), mostrar/ocultar, ordenação
 * e filtros por valor.
 *
 * Persistência (ordem de prioridade):
 * 1. Preferência individual em dp_user_prefs.extras.table_layouts[screenKey]
 *    (por usuário + empresa + tela, com autosave e merge seguro);
 * 2. Padrão global em app_table_layouts (definido por super admin);
 * 3. localStorage (cache local / telas sem screenKey);
 * 4. Defaults da tela.
 *
 * O autosave é feito por debounce — nunca a cada pixel do resize — e filtros
 * temporários nunca são persistidos.
 */
export function useDpTableColumns<K extends string, S extends string>(opts: {
  /** Prefixo das chaves de localStorage, ex.: "dp_colabs_col". */
  storageKey: string;
  /** Identificador da tela no padrão global e na preferência individual. */
  screenKey?: string;
  defaultOrder: K[];
  defaultWidths: Record<K, number>;
  /** Colunas ocultas por padrão. */
  hiddenByDefault?: K[];
  /** Colunas essenciais: não podem ser ocultadas (ex.: Nome). */
  essentialKeys?: K[];
  /** Largura fixa da coluna de ações (somada ao total). */
  acoesWidth?: number;
  defaultSortKey: S;
  defaultSortDir?: "asc" | "desc";
}) {
  const {
    storageKey, screenKey, defaultOrder, defaultWidths,
    hiddenByDefault = [], essentialKeys = [], acoesWidth = 0, defaultSortKey,
  } = opts;
  const orderStorage = `${storageKey}_order`;
  const widthStorage = `${storageKey}_width`;
  const hiddenStorage = `${storageKey}_hidden`;
  const layoutTsStorage = `${storageKey}_layout_ts`;

  const { prefs, isLoading: prefsLoading, available: prefsAvailable, save: savePrefs } = useDpUserPrefs();

  const [sortKey, setSortKey] = useState<S>(defaultSortKey);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(opts.defaultSortDir ?? "asc");

  const emptyFilters = useMemo(() => {
    const base = {} as Record<K, string[]>;
    defaultOrder.forEach((k) => { base[k] = []; });
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [colFilters, setColFilters] = useState<Record<K, string[]>>(emptyFilters);

  const sanitizeOrder = useCallback((raw: unknown): K[] => {
    return sanitizeOrderLib(raw, defaultOrder);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sanitizeWidths = useCallback((raw: unknown): Record<K, number> => {
    return sanitizeWidthsLib(raw, defaultWidths, DP_COL_MIN_WIDTH);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sanitizeHidden = useCallback((raw: unknown): K[] => {
    return sanitizeHiddenLib(raw, defaultOrder, essentialKeys, hiddenByDefault);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [colOrder, setColOrder] = useState<K[]>(() => {
    try {
      const raw = localStorage.getItem(orderStorage);
      if (raw) return sanitizeOrder(JSON.parse(raw));
    } catch { /* ignora storage inválido */ }
    return defaultOrder;
  });

  const [colWidths, setColWidths] = useState<Record<K, number>>(() => {
    try {
      const raw = localStorage.getItem(widthStorage);
      if (raw) return sanitizeWidths(JSON.parse(raw));
    } catch { /* ignora storage inválido */ }
    return defaultWidths;
  });

  const [hidden, setHidden] = useState<K[]>(() => {
    try {
      const raw = localStorage.getItem(hiddenStorage);
      if (raw) return sanitizeHidden(JSON.parse(raw));
    } catch { /* ignora storage inválido */ }
    return hiddenByDefault;
  });

  const [dragCol, setDragCol] = useState<K | null>(null);

  /** Serialização do layout atual — base para detectar mudanças reais. */
  const serialize = useCallback(
    (order: K[], widths: Record<K, number>, hid: K[]) =>
      JSON.stringify({ order, widths, hidden: hid }),
    [],
  );

  /** Último layout aplicado ou salvo; evita loops e gravações redundantes. */
  const lastSyncedRef = useRef<string>(serialize(colOrder, colWidths, hidden));
  /** Estado mais recente para o autosave debounced. */
  const latestRef = useRef({ colOrder, colWidths, hidden });
  latestRef.current = { colOrder, colWidths, hidden };

  // ── Preferência individual (backend) ───────────────────────────────────
  const individual = useMemo(() => {
    if (!screenKey) return null;
    const layouts = (prefs.extras as any)?.table_layouts;
    const raw = layouts && typeof layouts === "object" ? layouts[screenKey] : null;
    if (!raw || typeof raw !== "object") return null;
    return raw as IndividualLayout<K>;
  }, [prefs.extras, screenKey]);

  // Aplica a preferência individual quando ela existe (prioridade máxima).
  useEffect(() => {
    if (!screenKey || prefsLoading || !individual) return;
    const order = sanitizeOrder(individual.order);
    const widths = sanitizeWidths(individual.widths);
    const hid = sanitizeHidden(individual.hidden);
    const sig = serialize(order, widths, hid);
    if (sig === lastSyncedRef.current) return;
    lastSyncedRef.current = sig;
    setColOrder(order);
    setColWidths(widths);
    setHidden(hid);
    try {
      localStorage.setItem(orderStorage, JSON.stringify(order));
      localStorage.setItem(widthStorage, JSON.stringify(widths));
      localStorage.setItem(hiddenStorage, JSON.stringify(hid));
    } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [individual, prefsLoading, screenKey]);

  // ── Padrão global (app_table_layouts) — só quando não há pref individual ──
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
    if (!layout || !screenKey || prefsLoading) return;
    if (individual) return; // preferência individual vence o padrão global

    try {
      const storedTs = localStorage.getItem(layoutTsStorage);
      const dbTs = new Date(layout.updated_at).getTime();
      if (storedTs && Number(storedTs) >= dbTs) return; // local já reflete o padrão atual

      const order = sanitizeOrder(layout.column_order);
      const widths = sanitizeWidths(layout.column_widths);
      lastSyncedRef.current = serialize(order, widths, hiddenByDefault);
      setColOrder(order);
      setColWidths(widths);
      setHidden(hiddenByDefault);
      localStorage.setItem(orderStorage, JSON.stringify(order));
      localStorage.setItem(widthStorage, JSON.stringify(widths));
      localStorage.setItem(hiddenStorage, JSON.stringify(hiddenByDefault));
      localStorage.setItem(layoutTsStorage, String(dbTs));
    } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutQuery.data, screenKey, prefsLoading, individual]);

  // ── Cache local ────────────────────────────────────────────────────────
  useEffect(() => {
    try { localStorage.setItem(orderStorage, JSON.stringify(colOrder)); } catch { /* noop */ }
  }, [colOrder, orderStorage]);

  useEffect(() => {
    try { localStorage.setItem(widthStorage, JSON.stringify(colWidths)); } catch { /* noop */ }
  }, [colWidths, widthStorage]);

  useEffect(() => {
    try { localStorage.setItem(hiddenStorage, JSON.stringify(hidden)); } catch { /* noop */ }
  }, [hidden, hiddenStorage]);

  // ── Autosave individual (debounce; nunca a cada pixel) ─────────────────
  useEffect(() => {
    if (!screenKey || !prefsAvailable || prefsLoading) return;
    const { colOrder: o, colWidths: w, hidden: h } = latestRef.current;
    const sig = serialize(o, w, h);
    if (sig === lastSyncedRef.current) return;

    const timer = setTimeout(() => {
      const cur = latestRef.current;
      const curSig = serialize(cur.colOrder, cur.colWidths, cur.hidden);
      if (curSig === lastSyncedRef.current) return;
      lastSyncedRef.current = curSig;

      // Merge seguro: preserva favoritos, atalhos, avisos e layouts de outras telas.
      const currentExtras = (prefs.extras ?? {}) as Record<string, unknown>;
      savePrefs({
        extras: mergeTableLayoutExtras(currentExtras, screenKey, {
          order: cur.colOrder,
          widths: cur.colWidths,
          hidden: cur.hidden,
        }),
      });
    }, 700);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colOrder, colWidths, hidden, screenKey, prefsAvailable, prefsLoading]);

  const larguraTotal = useMemo(
    () => colOrder.reduce((acc, k) => (hidden.includes(k) ? acc : acc + colWidths[k]), acoesWidth),
    [colOrder, colWidths, hidden, acoesWidth],
  );

  /** Colunas visíveis na ordem atual (para renderizar cabeçalho e células). */
  const visibleOrder = useMemo(() => colOrder.filter((k) => !hidden.includes(k)), [colOrder, hidden]);

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

  /** Mostra/oculta uma coluna. Essenciais e a última visível não podem ser ocultadas. */
  const toggleHidden = useCallback((k: K) => {
    setHidden((prev) => toggleHiddenKey(prev, latestRef.current.colOrder, k, essentialKeys) ?? prev);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Restaura o padrão da tela: remove a preferência individual e o cache local. */
  const resetLayout = useCallback(() => {
    lastSyncedRef.current = serialize(defaultOrder, defaultWidths, hiddenByDefault);
    setColOrder(defaultOrder);
    setColWidths(defaultWidths);
    setHidden(hiddenByDefault);
    try {
      localStorage.removeItem(orderStorage);
      localStorage.removeItem(widthStorage);
      localStorage.removeItem(hiddenStorage);
      localStorage.removeItem(layoutTsStorage);
    } catch { /* noop */ }

    if (screenKey && prefsAvailable) {
      savePrefs({
        extras: removeTableLayoutExtras((prefs.extras ?? {}) as Record<string, unknown>, screenKey),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenKey, prefsAvailable, prefs.extras]);

  return {
    colOrder, setColOrder,
    colWidths, setColWidths, resize, resetWidth,
    hidden, toggleHidden, resetLayout, visibleOrder,
    dragCol, setDragCol, soltarSobre,
    colFilters, setColFilters, toggleColValue, limparFiltros,
    sortKey, sortDir, aplicarSort,
    larguraTotal,
    layoutLoading: layoutQuery.isLoading,
  };
}
