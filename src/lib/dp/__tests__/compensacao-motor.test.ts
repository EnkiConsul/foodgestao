import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  parseHoras, formatarMinutos, simularCompensacao, sugerirCombinacoes, arredondarMinuto,
} from "@/lib/dp/compensacao/motor";

const min = (s: string) => {
  const r = parseHoras(s);
  if (!r.ok) throw new Error(r.erro);
  return r.minutos;
};

describe("parseHoras", () => {
  it("aceita decimal com vírgula e ponto", () => {
    expect(min("10,5")).toBe(630);
    expect(min("10.5")).toBe(630);
  });
  it("arredonda fração ao minuto mais próximo (10,333h = 10h20min)", () => {
    expect(min("10,333")).toBe(620);
    expect(min("0,0083")).toBe(0); // 0,498 min → 0
    expect(min("0,0084")).toBe(1); // 0,504 min → 1
  });
  it("aceita HH:MM e 10h30", () => {
    expect(min("10:30")).toBe(630);
    expect(min("10h30")).toBe(630);
    expect(min("10h30min")).toBe(630);
    expect(min("8h")).toBe(480);
    expect(min("45min")).toBe(45);
  });
  it("aceita saldo negativo", () => {
    expect(min("-2:15")).toBe(-135);
    expect(min("-1,5")).toBe(-90);
  });
  it("rejeita entradas inválidas", () => {
    expect(parseHoras("").ok).toBe(false);
    expect(parseHoras("abc").ok).toBe(false);
    expect(parseHoras("10:75").ok).toBe(false);
    expect(parseHoras("-").ok).toBe(false);
    expect(parseHoras("1,2,3").ok).toBe(false);
  });
});

describe("formatarMinutos", () => {
  it("formata em h/min", () => {
    expect(formatarMinutos(620)).toBe("10h20min");
    expect(formatarMinutos(600)).toBe("10h");
    expect(formatarMinutos(45)).toBe("45min");
    expect(formatarMinutos(-135)).toBe("-2h15min");
    expect(formatarMinutos(0)).toBe("0h");
  });
  it("ida e volta preserva o valor", () => {
    fc.assert(fc.property(fc.integer({ min: -600000, max: 600000 }), (m) => {
      const r = parseHoras(formatarMinutos(m));
      return r.ok && r.minutos === m;
    }));
  });
});

describe("simularCompensacao", () => {
  const dias = [
    { data: "2026-10-20", minutos: 440 },
    { data: "2026-10-21", minutos: 440 },
  ];
  it("saldo 10h com uma folga de 7h20 sobra 2h40", () => {
    const r = simularCompensacao({ saldoMinutos: 600, dias: [dias[0]] });
    expect(r.saldoFinal).toBe(160);
    expect(r.status).toBe("positivo");
  });
  it("saldo negativo dentro do limite é permitido", () => {
    const r = simularCompensacao({ saldoMinutos: 800, dias, limiteNegativo: 120 });
    expect(r.saldoFinal).toBe(-80);
    expect(r.status).toBe("negativo_permitido");
  });
  it("saldo negativo além do limite é sinalizado", () => {
    const r = simularCompensacao({ saldoMinutos: 800, dias, limiteNegativo: 60 });
    expect(r.status).toBe("excede_limite");
  });
  it("zerado exato", () => {
    expect(simularCompensacao({ saldoMinutos: 880, dias }).status).toBe("zerado");
  });
  it("ignora dias repetidos e sem carga", () => {
    const r = simularCompensacao({
      saldoMinutos: 1000,
      dias: [...dias, dias[0], { data: "2026-10-22", minutos: 0 }],
    });
    expect(r.dias).toHaveLength(2);
    expect(r.minutosUsados).toBe(880);
  });
});

describe("sugerirCombinacoes", () => {
  const dias = [
    { data: "2026-10-20", minutos: 480 },
    { data: "2026-10-21", minutos: 360 },
    { data: "2026-10-22", minutos: 240 },
  ];
  it("primeira sugestão zera o saldo quando possível", () => {
    const s = sugerirCombinacoes({ saldoMinutos: 840, dias });
    expect(s[0].saldoFinal).toBe(0);
    expect(s[0].dias.map((d) => d.data)).toEqual(["2026-10-20", "2026-10-21"]);
  });
  it("sem saldo não sugere nada", () => {
    expect(sugerirCombinacoes({ saldoMinutos: 0, dias })).toEqual([]);
    expect(sugerirCombinacoes({ saldoMinutos: -100, dias })).toEqual([]);
  });
  it("respeita o limite negativo", () => {
    const s = sugerirCombinacoes({ saldoMinutos: 1000, dias, limiteNegativo: 80 });
    expect(s[0].saldoFinal).toBe(-80);
  });
  it("nunca ultrapassa saldo + limite (propriedade)", () => {
    fc.assert(fc.property(
      fc.integer({ min: 0, max: 6000 }),
      fc.integer({ min: 0, max: 600 }),
      fc.array(fc.integer({ min: 1, max: 720 }), { maxLength: 40 }),
      (saldo, limite, cargas) => {
        const ds = cargas.map((m, i) => ({ data: `2026-11-${String(i + 1).padStart(2, "0")}`, minutos: m }));
        const s = sugerirCombinacoes({ saldoMinutos: saldo, dias: ds, limiteNegativo: limite, maxNos: 5000 });
        return s.every((x) => x.minutosUsados <= saldo + limite && x.saldoFinal >= -limite);
      },
    ));
  });
  it("arredondamento simétrico", () => {
    expect(arredondarMinuto(-0.5)).toBe(-1);
    expect(arredondarMinuto(0.5)).toBe(1);
  });
});
