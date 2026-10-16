import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const maybeSingle = vi.fn();
const single = vi.fn();
vi.mock("@/integrations/supabase/client", () => {
  const chain: any = {};
  chain.select = () => chain; chain.eq = () => chain;
  chain.maybeSingle = (...a: any[]) => maybeSingle(...a);
  chain.single = (...a: any[]) => single(...a);
  chain.order = () => chain; chain.limit = () => chain;
  return { supabase: { from: () => chain, auth: { getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } } };
});

import { useDpTableColumns } from "@/hooks/useDpTableColumns";

const wrap = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: any) => React.createElement(QueryClientProvider, { client: qc }, children);
};
const args: any = { screenKey: "t_layout", storageKey: "t_layout", defaultOrder: ["a", "b"], defaultWidths: { a: 100, b: 200 } };

describe("useDpTableColumns — layout global", () => {
  beforeEach(() => { localStorage.clear(); maybeSingle.mockReset(); single.mockReset(); });

  it("sem layout global usa maybeSingle (sem 406) e mantém o padrão", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => useDpTableColumns(args), { wrapper: wrap() });
    await waitFor(() => expect(maybeSingle).toHaveBeenCalled());
    expect(single).not.toHaveBeenCalled();
    expect(result.current.colOrder).toEqual(["a", "b"]);
  });

  it("layout global válido aplica ordem e largura", async () => {
    maybeSingle.mockResolvedValue({ data: { screen_key: "t_layout", column_order: ["b", "a"], column_widths: { a: 150, b: 250 }, updated_at: new Date().toISOString() }, error: null });
    const { result } = renderHook(() => useDpTableColumns(args), { wrapper: wrap() });
    await waitFor(() => expect(result.current.colOrder).toEqual(["b", "a"]));
    expect(result.current.colWidths.a).toBe(150);
  });

  it("erro real ou múltiplos registros não altera o layout padrão", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { code: "PGRST116", message: "multiple rows" } });
    const { result } = renderHook(() => useDpTableColumns(args), { wrapper: wrap() });
    await waitFor(() => expect(maybeSingle).toHaveBeenCalled());
    expect(result.current.colOrder).toEqual(["a", "b"]);
    expect(result.current.colWidths).toEqual({ a: 100, b: 200 });
  });
});
