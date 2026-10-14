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

import { sugerirCombinacoes as _sug } from "@/lib/dp/compensacao/motor";
describe("pico do food service", () => {
  it("prefere folgas seg–qui mesmo com carga menor que a de sex/sáb/dom", () => {
    const dias = [
      { data: "a1", minutos: 455, pico: true }, { data: "a2", minutos: 455, pico: true }, { data: "a3", minutos: 455, pico: true },
      { data: "b1", minutos: 425 }, { data: "b2", minutos: 425 }, { data: "b3", minutos: 425 },
    ];
    const [melhor] = _sug({ saldoMinutos: 32 * 60 + 54, dias, maxDias: 10 });
    expect(melhor.dias.filter((d) => d.pico)).toHaveLength(0);
    expect(melhor.dias).toHaveLength(3);
  });
  it("usa dia de pico só quando os demais não bastam", () => {
    const [melhor] = _sug({ saldoMinutos: 900, dias: [{ data: "a", minutos: 455, pico: true }, { data: "b", minutos: 425 }] });
    expect(melhor.dias.map((d) => d.data)).toEqual(["b"]);
  });
  it("conta os dias de pico na jornada (dom e sex/sáb)", () => {
    const r = jornadasDaRpc([0, 1, 5, 6].map((dow) => ({ dow, trabalha: true, minutos_liquidos: 480, incompleto: false })));
    expect(r.jornadas[0].picos).toBe(3);
  });
});
