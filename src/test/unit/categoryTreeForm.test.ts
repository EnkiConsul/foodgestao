import { describe, expect, it } from "vitest";
import { buildCategoryTree, flattenCategoryTree } from "@/lib/transactions/formHelpers";
import type { Tables } from "@/integrations/supabase/types";

type Cat = Tables<"categories">;

let seq = 0;
function cat(partial: Partial<Cat> & { name: string }): Cat {
  seq += 1;
  return {
    id: partial.id ?? `id-${seq}`,
    parent_id: null,
    sort_order: 0,
    is_active: true,
    ...partial,
  } as Cat;
}

describe("buildCategoryTree (formHelpers)", () => {
  it("calcula profundidade correta quando o pai vem depois do filho na lista", () => {
    // RPC ordena por nome: filho "Consorcio" antes do pai "INVESTIMENTOS".
    const pai = cat({ id: "p1", name: "INVESTIMENTOS" });
    const filho = cat({ id: "f1", name: "Consorcio", parent_id: "p1" });
    const tree = buildCategoryTree([filho, pai]);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("p1");
    expect(tree[0].depth).toBe(0);
    expect(tree[0].children[0].id).toBe("f1");
    expect(tree[0].children[0].depth).toBe(1);
  });

  it("propaga profundidade para netos independentemente da ordem de entrada", () => {
    const avo = cat({ id: "a", name: "Z-Grupo" });
    const pai = cat({ id: "p", name: "B-Pai", parent_id: "a" });
    const neto = cat({ id: "n", name: "A-Neto", parent_id: "p" });
    const tree = buildCategoryTree([neto, pai, avo]);
    expect(tree[0].depth).toBe(0);
    expect(tree[0].children[0].depth).toBe(1);
    expect(tree[0].children[0].children[0].depth).toBe(2);
  });

  it("preserva a ordem de entrada dentro de cada nível (sort_order da RPC)", () => {
    const r1 = cat({ id: "r1", name: "Raiz 1", sort_order: 0 });
    const r2 = cat({ id: "r2", name: "Raiz 2", sort_order: 1 });
    const tree = buildCategoryTree([r2, r1].sort((a, b) => a.sort_order - b.sort_order));
    expect(tree.map((n) => n.id)).toEqual(["r1", "r2"]);
  });

  it("envia órfãos (pai ausente) para o fim com recuo, sem rebaixar para raiz numerada", () => {
    const raiz = cat({ id: "r", name: "Raiz" });
    const orfao = cat({ id: "o", name: "Orfão", parent_id: "pai-inexistente" });
    const tree = buildCategoryTree([orfao, raiz]);
    expect(tree.map((n) => n.id)).toEqual(["r", "o"]);
    expect(tree[1].depth).toBe(1);
  });

  it("flatten reflete a hierarquia com depths corretos", () => {
    const pai = cat({ id: "p", name: "Grupo" });
    const filho = cat({ id: "f", name: "Item", parent_id: "p" });
    const flat = flattenCategoryTree(buildCategoryTree([filho, pai]));
    expect(flat.map((o) => [o.value, o.depth])).toEqual([
      ["p", 0],
      ["f", 1],
    ]);
  });
});
