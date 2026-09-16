import { describe, it, expect, vi, beforeEach } from "vitest";

const from = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => from(t) } }));

const {
  verificarExclusaoSimples,
  verificarExclusaoContaContabil,
  contasContabeisComHistorico,
  coletarArvore,
  idsComLancamentos,
} = await import("@/lib/finance/verificarHistorico");

function transactionsRetornando(rows: Record<string, string | null>[]) {
  return {
    select: () => ({ in: () => ({ limit: () => Promise.resolve({ data: rows, error: null }) }) }),
  };
}

function categoriesRetornando(rows: unknown[]) {
  return { select: () => ({ in: () => Promise.resolve({ data: rows, error: null }) }) };
}

beforeEach(() => from.mockReset());

describe("verificação antes do delete", () => {
  it("bloqueia cadastro com lançamento vinculado", async () => {
    from.mockImplementation(() => transactionsRetornando([{ contact_id: "c1" }]));
    const r = await verificarExclusaoSimples("contact_id", "c1", "FORNECEDOR X");
    expect(r?.title).toBe("Não é possível excluir");
    expect(r?.description).toContain("FORNECEDOR X");
    expect(r?.description).toContain("inative o cadastro");
  });

  it("libera cadastro sem lançamentos", async () => {
    from.mockImplementation(() => transactionsRetornando([]));
    expect(await verificarExclusaoSimples("payment_method_id", "p1", "PIX")).toBeNull();
  });

  it("lista apenas os ids em uso no lote", async () => {
    from.mockImplementation(() => transactionsRetornando([{ category_id: "a" }, { category_id: "a" }]));
    const usados = await idsComLancamentos("category_id", ["a", "b"]);
    expect(Array.from(usados)).toEqual(["a"]);
  });

  it("conta contábil sem categorias vinculadas pode ser excluída", async () => {
    from.mockImplementation((t: string) =>
      t === "categories" ? categoriesRetornando([]) : transactionsRetornando([]),
    );
    expect(await verificarExclusaoContaContabil(["cc1"], "RECEITAS")).toBeNull();
  });

  it("conta contábil com histórico indireto é bloqueada", async () => {
    from.mockImplementation((t: string) =>
      t === "categories"
        ? categoriesRetornando([{ id: "cat1", chart_account_id: "cc-filha" }])
        : transactionsRetornando([{ category_id: "cat1" }]),
    );
    const r = await verificarExclusaoContaContabil(["cc-pai", "cc-filha"], "RECEITAS");
    expect(r?.description).toContain("RECEITAS");
    const bloqueadas = await contasContabeisComHistorico(["cc-pai", "cc-filha"]);
    expect(Array.from(bloqueadas)).toEqual(["cc-filha"]);
  });

  it("coleta a árvore da conta", () => {
    const filhos = new Map([["a", ["b", "c"]], ["b", ["d"]]]);
    expect(coletarArvore("a", filhos).sort()).toEqual(["a", "b", "c", "d"]);
  });
});
