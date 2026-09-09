import { describe, expect, it } from "vitest";
import { loteConcluido } from "../bulk-import-conclusao";

describe("loteConcluido", () => {
  it("conclui quando todas as páginas vinculadas foram aprovadas", () => {
    const linhas = [
      { id: "a", status: "pending", matched_colaborador_id: "c1" },
      { id: "b", status: "imported", matched_colaborador_id: "c2" },
    ];
    expect(loteConcluido(linhas, ["a"])).toBe(true);
  });

  it("não conclui quando sobra página vinculada pendente", () => {
    const linhas = [
      { id: "a", status: "pending", matched_colaborador_id: "c1" },
      { id: "b", status: "pending", matched_colaborador_id: "c2" },
    ];
    expect(loteConcluido(linhas, ["a"])).toBe(false);
  });

  it("ignora páginas pendentes sem colaborador vinculado", () => {
    const linhas = [
      { id: "a", status: "pending", matched_colaborador_id: "c1" },
      { id: "b", status: "pending", matched_colaborador_id: null },
    ];
    expect(loteConcluido(linhas, ["a"])).toBe(true);
  });

  it("lote vazio conta como concluído", () => {
    expect(loteConcluido([], [])).toBe(true);
  });
});
