import { describe, expect, it } from "vitest";
import { ciclosValePendentes, unidadesSemFeriados } from "@/lib/dp/pendencias-vales";

const base = { diaPagamento: 25, competenciasFechadas: new Set<string>() };

describe("ciclosValePendentes", () => {
  it("não alerta antes de 2 dias", () => {
    expect(ciclosValePendentes({ ...base, hojeISO: "2026-09-22" })).toEqual([]);
  });
  it("2 dias antes aparece como próxima", () => {
    const [c] = ciclosValePendentes({ ...base, hojeISO: "2026-09-23" });
    expect(c).toMatchObject({ vencimento: "2026-09-25", atrasoDias: -2, urgente: false });
  });
  it("no dia do pagamento é urgente", () => {
    const [c] = ciclosValePendentes({ ...base, hojeISO: "2026-09-25" });
    expect(c).toMatchObject({ atrasoDias: 0, urgente: true });
  });
  it("depois do dia fica atrasada, inclusive no mês seguinte", () => {
    const r = ciclosValePendentes({ ...base, hojeISO: "2026-10-01" });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ vencimento: "2026-09-25", atrasoDias: 6 });
  });
  it("apuração fechada dá baixa", () => {
    const r = ciclosValePendentes({
      ...base,
      hojeISO: "2026-10-01",
      competenciasFechadas: new Set(["2026-09-01"]),
    });
    expect(r).toEqual([]);
  });
  it("dia 31 em mês curto usa o último dia", () => {
    const [c] = ciclosValePendentes({ ...base, diaPagamento: 31, hojeISO: "2026-02-28" });
    expect(c.vencimento).toBe("2026-02-28");
  });
});

describe("unidadesSemFeriados", () => {
  it("lista só unidades sem feriado", () => {
    const r = unidadesSemFeriados([{ id: "a" }, { id: "b" }], new Set(["a"]));
    expect(r.map((u) => u.id)).toEqual(["b"]);
  });
});
