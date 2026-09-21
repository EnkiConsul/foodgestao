/**
 * Regressão: categorias do formulário de lançamentos.
 *
 * 1. O filtro do formulário não pode mais depender do mapa local de vínculos
 *    (ele descartava categorias-pai e, quando incompleto, escondia categorias).
 * 2. A leitura de vínculos por empresa precisa paginar além de 1000 linhas.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const range = vi.fn();
const order2 = vi.fn(() => ({ range }));
const order1 = vi.fn(() => ({ order: order2 }));
const eq = vi.fn(() => ({ order: order1 }));
const select = vi.fn(() => ({ eq, order: order1 }));
const from = vi.fn(() => ({ select }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...args: unknown[]) => from(...(args as [])) },
}));

import { lerVinculos, PAGINA_VINCULOS } from "@/lib/companyLinks";

type Cat = { id: string; transaction_type: string; visible_pf?: boolean };

/** Mesma regra aplicada em TransactionFormDialog. */
function filtrar(categories: Cat[], type: string, contextType: "pf" | "pj") {
  return categories.filter((c) => {
    if (type === "transferencia") return true;
    if (c.transaction_type !== type) return false;
    if (contextType === "pf") return c.visible_pf !== false;
    return true;
  });
}

describe("filtro de categorias do formulário", () => {
  const cats: Cat[] = [
    { id: "pai", transaction_type: "saida" },
    { id: "filha", transaction_type: "saida" },
    { id: "receita", transaction_type: "entrada" },
  ];

  it("mantém pai e filha em PJ mesmo sem mapa de vínculos", () => {
    expect(filtrar(cats, "saida", "pj").map((c) => c.id)).toEqual(["pai", "filha"]);
  });

  it("continua filtrando por tipo de lançamento", () => {
    expect(filtrar(cats, "entrada", "pj").map((c) => c.id)).toEqual(["receita"]);
  });

  it("em PF respeita visible_pf", () => {
    const comOculta = [...cats, { id: "oculta", transaction_type: "saida", visible_pf: false }];
    expect(filtrar(comOculta, "saida", "pf").map((c) => c.id)).toEqual(["pai", "filha"]);
  });
});

describe("lerVinculos", () => {
  beforeEach(() => {
    range.mockReset();
    eq.mockClear();
  });

  it("pagina até esgotar quando há mais de 1000 vínculos", async () => {
    const pagina1 = Array.from({ length: PAGINA_VINCULOS }, (_, i) => ({
      category_id: `c${i}`,
      company_id: "emp",
    }));
    const pagina2 = [{ category_id: "extra", company_id: "emp" }];
    range
      .mockResolvedValueOnce({ data: pagina1, error: null })
      .mockResolvedValueOnce({ data: pagina2, error: null });

    const res = await lerVinculos("category_companies", "category_id", "emp");
    expect(res).toHaveLength(PAGINA_VINCULOS + 1);
    expect(range).toHaveBeenCalledTimes(2);
    expect(eq).toHaveBeenCalledWith("company_id", "emp");
  });

  it("propaga erro em vez de devolver lista vazia", async () => {
    range.mockResolvedValueOnce({ data: null, error: { message: "falhou" } });
    await expect(lerVinculos("category_companies", "category_id", "emp")).rejects.toEqual({
      message: "falhou",
    });
  });

  it("sem empresa em uso não filtra por company_id", async () => {
    range.mockResolvedValueOnce({ data: [], error: null });
    await lerVinculos("contact_companies", "contact_id", null);
    expect(eq).not.toHaveBeenCalled();
  });
});
