import { describe, it, expect } from "vitest";
import { feriadosPendentesConfirmacao, agruparPorData } from "../feriado-escala-pendente";

const f = (unidadeId: string, data: string) => ({ unidadeId, unidade: unidadeId, data, nome: "Feriado" });

describe("feriados pendentes de confirmação da escala", () => {
  it("só pede confirmação nos próximos 10 dias", () => {
    const r = feriadosPendentesConfirmacao("2026-11-05", [f("a", "2026-11-15"), f("a", "2026-11-16"), f("a", "2026-11-04")], []);
    expect(r.map((x) => x.data)).toEqual(["2026-11-15"]);
  });
  it("escala confirmada sai da lista", () => {
    const r = feriadosPendentesConfirmacao("2026-11-05", [f("a", "2026-11-15"), f("b", "2026-11-15")], [
      { unidade_id: "a", data: "2026-11-15", fechada: false, escala_confirmada_em: "2026-11-05T12:00:00Z" },
    ]);
    expect(r.map((x) => x.unidadeId)).toEqual(["b"]);
  });
  it("loja fechada no feriado não pede confirmação", () => {
    const r = feriadosPendentesConfirmacao("2026-11-05", [f("a", "2026-11-15")], [
      { unidade_id: "a", data: "2026-11-15", fechada: true, escala_confirmada_em: null },
    ]);
    expect(r).toEqual([]);
  });
  it("agrupa lojas do mesmo feriado para confirmar todas", () => {
    expect(agruparPorData([f("a", "2026-11-15"), f("b", "2026-11-15")])[0].lojas).toHaveLength(2);
  });
});
