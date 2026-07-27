import { describe, it, expect } from "vitest";
import {
  resolverCoberturaMinima,
  regraVigente,
  avaliarCobertura,
  diaSemanaDe,
  type RegraCobertura,
} from "@/lib/dp/cobertura-utils";

const base: RegraCobertura = {
  id: "r1",
  unidade_id: null,
  cargo_id: null,
  dia_semana: null,
  turno_id: null,
  minimo: 2,
  ativo: true,
  vigencia_inicio: null,
  vigencia_fim: null,
};

describe("cobertura-utils", () => {
  it("calcula o dia da semana sem drift de fuso", () => {
    expect(diaSemanaDe("2026-07-27")).toBe(1); // segunda
  });

  it("respeita ativo e vigência", () => {
    expect(regraVigente({ ...base, ativo: false }, "2026-07-27")).toBe(false);
    expect(regraVigente({ ...base, vigencia_inicio: "2026-08-01" }, "2026-07-27")).toBe(false);
    expect(regraVigente({ ...base, vigencia_fim: "2026-07-01" }, "2026-07-27")).toBe(false);
    expect(regraVigente(base, "2026-07-27")).toBe(true);
  });

  it("aplica regra sem turno a todos os turnos", () => {
    const r = resolverCoberturaMinima({
      regras: [base],
      data: "2026-07-27",
      turnoIds: ["t1", "t2"],
    });
    expect(r).toEqual({ t1: 2, t2: 2 });
  });

  it("mantém a exigência mais alta e filtra por dia e unidade", () => {
    const r = resolverCoberturaMinima({
      regras: [
        base,
        { ...base, id: "r2", turno_id: "t1", minimo: 4 },
        { ...base, id: "r3", turno_id: "t2", minimo: 9, dia_semana: 0 },
        { ...base, id: "r4", turno_id: "t1", minimo: 7, unidade_id: "u2" },
      ],
      data: "2026-07-27",
      unidadeId: "u1",
      turnoIds: ["t1", "t2"],
    });
    expect(r).toEqual({ t1: 4, t2: 2 });
  });

  it("avalia descoberto por turno", () => {
    const linhas = avaliarCobertura(
      [
        { id: "t1", nome: "Manhã" },
        { id: "t2", nome: "Noite" },
        { id: "t3", nome: "Sem regra" },
      ],
      { t1: 1, t2: 5 },
      { t1: 3, t2: 2 },
    );
    expect(linhas.map((l) => l.turno_id)).toEqual(["t1", "t2"]);
    expect(linhas[0].descoberto).toBe(2);
    expect(linhas[1].descoberto).toBe(0);
  });
});
