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

  it("conclui quando o que sobra é duplicado ignorado", () => {
    const linhas = [
      { id: "a", status: "pending", matched_colaborador_id: "c1" },
      { id: "b", status: "pending", matched_colaborador_id: "c2" },
    ];
    expect(loteConcluido(linhas, ["a"], ["b"])).toBe(true);
  });

  it("não conclui se o duplicado ignorado não cobre todas as pendentes", () => {
    const linhas = [
      { id: "a", status: "pending", matched_colaborador_id: "c1" },
      { id: "b", status: "pending", matched_colaborador_id: "c2" },
      { id: "c", status: "pending", matched_colaborador_id: "c3" },
    ];
    expect(loteConcluido(linhas, ["a"], ["b"])).toBe(false);
  });
});
