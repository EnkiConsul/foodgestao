import { describe, it, expect } from "vitest";
import { montarCsv } from "@/lib/dp/portal-csv";

describe("montarCsv", () => {
  it("usa ponto e vírgula e aspas em todas as células", () => {
    const csv = montarCsv(["Data", "Tipo"], [["01/09/2026", "Troca"]]);
    expect(csv).toBe('"Data";"Tipo"\n"01/09/2026";"Troca"');
  });

  it("escapa aspas internas e trata vazios", () => {
    const csv = montarCsv(["A"], [['diz "oi"'], [null]]);
    expect(csv).toBe('"A"\n"diz ""oi"""\n""');
  });
});
