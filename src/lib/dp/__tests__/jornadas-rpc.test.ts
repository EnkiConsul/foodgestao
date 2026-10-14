import { describe, it, expect } from "vitest";
import { jornadasDaRpc } from "@/lib/dp/compensacao/jornadasColaborador";

describe("jornadasDaRpc", () => {
  it("agrupa dias com a mesma carga e ignora folgas", () => {
    const r = jornadasDaRpc([
      { dow: 1, trabalha: true, minutos_liquidos: 440, incompleto: false },
      { dow: 2, trabalha: true, minutos_liquidos: 440, incompleto: false },
      { dow: 0, trabalha: false, minutos_liquidos: 0, incompleto: false },
      { dow: 6, trabalha: true, minutos_liquidos: 240, incompleto: false },
    ]);
    expect(r.jornadas.map((j) => [j.minutos, j.qtd])).toEqual([[440, 2], [240, 1]]);
    expect(r.incompletos).toEqual([]);
  });
  it("dia incompleto ou com carga zero não vira jornada", () => {
    const r = jornadasDaRpc([
      { dow: 3, trabalha: true, minutos_liquidos: 0, incompleto: true },
      { dow: 4, trabalha: true, minutos_liquidos: 300, incompleto: true },
    ]);
    expect(r.jornadas).toEqual([]);
    expect(r.incompletos).toEqual([3, 4]);
  });
});
