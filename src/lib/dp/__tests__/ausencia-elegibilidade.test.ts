import { describe, it, expect } from "vitest";
import { ativoNaData, elegiveisParaAusencia } from "@/lib/dp/ausencia-elegibilidade";

describe("elegibilidade para registrar ausência", () => {
  it("novo contratado só aparece a partir da admissão", () => {
    const c = { id: "a", data_admissao: "2026-10-05" };
    expect(ativoNaData(c, "2026-10-04")).toBe(false);
    expect(ativoNaData(c, "2026-10-05")).toBe(true);
  });
  it("desligado só aparece em dias em que estava ativo", () => {
    const c = { id: "b", data_admissao: "2026-01-01", data_desligamento: "2026-10-10" };
    expect(ativoNaData(c, "2026-10-10")).toBe(true);
    expect(ativoNaData(c, "2026-10-11")).toBe(false);
  });
  it("quem já tem ausência no dia não aparece de novo", () => {
    const lista = [{ id: "a" }, { id: "b" }];
    expect(elegiveisParaAusencia(lista, "2026-10-01", new Set(["a"])).map((c) => c.id)).toEqual(["b"]);
  });
});
