import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  parseHoras, formatarMinutos, simularCompensacao, sugerirCombinacoes, arredondarMinuto,
} from "@/lib/dp/compensacao/motor";

const min = (s: string) => {
  const r = parseHoras(s);
  if ("erro" in r) throw new Error(r.erro);
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

describe("sugerirCombinacoes — critérios", () => {
  const dias = [
    { data: "a1", minutos: 480 },
    { data: "a2", minutos: 480 },
    { data: "b1", minutos: 600 },
    { data: "c1", minutos: 360 },
  ];
  it("sem critério mantém o padrão menor_sobra", () => {
    const a = sugerirCombinacoes({ saldoMinutos: 960, dias });
    const b = sugerirCombinacoes({ saldoMinutos: 960, dias, criterio: "menor_sobra" });
    expect(a).toEqual(b);
    expect(a[0].saldoFinal).toBe(0);
  });
  it("menor_folgas segue a mesma hierarquia (sobra antes de quantidade)", () => {
    const a = sugerirCombinacoes({ saldoMinutos: 960, dias, criterio: "menor_folgas" });
    expect(a[0].saldoFinal).toBe(0);
    expect(a).toEqual(sugerirCombinacoes({ saldoMinutos: 960, dias }));
  });
  it("menor_folgas respeita o limite negativo", () => {
    const s = sugerirCombinacoes({ saldoMinutos: 900, dias, limiteNegativo: 60, criterio: "menor_folgas", maxSugestoes: 50 });
    expect(s.every((x) => x.saldoFinal >= -60)).toBe(true);
  });
  it("ordem determinística em repetições", () => {
    const r1 = sugerirCombinacoes({ saldoMinutos: 1500, dias, criterio: "menor_folgas" });
    const r2 = sugerirCombinacoes({ saldoMinutos: 1500, dias: [...dias].reverse(), criterio: "menor_folgas" });
    expect(r1).toEqual(r2);
  });
});

const gerar = (cargasH: number[], porCarga: number) =>
  cargasH.flatMap((h, j) => Array.from({ length: porCarga }, (_, i) => ({
    data: `2026-1${j}-${String(i + 1).padStart(2, "0")}`, minutos: h * 60,
  })));
const H = (h: number) => h * 60;

describe("Fase 2.2 — hierarquia de recomendação", () => {
  it("1. saldo 40h com 4h/6h/8h zera o saldo com o mínimo de folgas", () => {
    const s = sugerirCombinacoes({ saldoMinutos: H(40), dias: gerar([4, 6, 8], 10), maxDias: 10 });
    expect(s[0].saldoFinal).toBe(0);
    expect(s[0].dias).toHaveLength(5);
    expect(s[0].dias.every((d) => d.minutos === H(8))).toBe(true);
    expect(s.every((x) => x.saldoFinal >= 0)).toBe(true);
  });
  it("2. saldo 20h com 5h/10h prefere duas folgas de 10h", () => {
    const s = sugerirCombinacoes({ saldoMinutos: H(20), dias: gerar([5, 10], 4), maxDias: 10 });
    expect(s[0].dias.map((d) => d.minutos)).toEqual([H(10), H(10)]);
    expect(s[0].saldoFinal).toBe(0);
    expect(s[1].dias).toHaveLength(3);
    expect(s[2].dias).toHaveLength(4);
  });
  it("3. saldo 16h com limite negativo 2h nunca passa de -2h", () => {
    const dias = [...gerar([8], 3), { data: "2026-12-01", minutos: 440 }, { data: "2026-12-02", minutos: 440 }];
    const s = sugerirCombinacoes({ saldoMinutos: H(16), dias, limiteNegativo: H(2), maxSugestoes: 50 });
    expect(s[0].saldoFinal).toBe(0);
    expect(s[0].dias).toHaveLength(2);
    expect(s.every((x) => x.saldoFinal >= -H(2))).toBe(true);
    expect(s.some((x) => x.saldoFinal < 0)).toBe(true);
  });
  it("4. limite zero nunca compensa acima do saldo", () => {
    const s = sugerirCombinacoes({ saldoMinutos: H(10), dias: gerar([4, 7], 5), limiteNegativo: 0, maxSugestoes: 100 });
    expect(s.length).toBeGreaterThan(0);
    expect(s.every((x) => x.saldoFinal >= 0 && x.minutosUsados <= H(10))).toBe(true);
  });
  it("5. empate de sobra e quantidade desempata pela data mais cedo", () => {
    const dias = [
      { data: "2026-10-05", minutos: H(6) },
      { data: "2026-10-01", minutos: H(4) },
    ];
    const s = sugerirCombinacoes({ saldoMinutos: H(5), dias });
    // |5-6| = 1 = |5-4| → mesma sobra e 1 folga: vence a data mais cedo
    expect(s.map((x) => x.dias[0].data)).toEqual(["2026-10-01", "2026-10-05"]);
  });
  it("6. ordem de entrada das datas não muda o ranking", () => {
    const dias = gerar([4, 6, 8], 4);
    const a = sugerirCombinacoes({ saldoMinutos: H(22), dias, maxSugestoes: 20 });
    const b = sugerirCombinacoes({ saldoMinutos: H(22), dias: [...dias].reverse(), maxSugestoes: 20 });
    const c = sugerirCombinacoes({ saldoMinutos: H(22), dias: [...dias.slice(5), ...dias.slice(0, 5)], maxSugestoes: 20 });
    expect(a).toEqual(b);
    expect(a).toEqual(c);
    const chaves = a.map((x) => x.dias.map((d) => d.minutos).join(","));
    expect(new Set(chaves).size).toBe(chaves.length);
  });
  it("7. maxNos interrompe e marca buscaCompleta = false", () => {
    const dias = gerar([1, 2, 3], 10);
    const curta = sugerirCombinacoes({ saldoMinutos: H(30), dias, maxDias: 10, maxNos: 20 });
    expect(curta.buscaCompleta).toBe(false);
    const cheia = sugerirCombinacoes({ saldoMinutos: H(8), dias: gerar([8], 2) });
    expect(cheia.buscaCompleta).toBe(true);
  });
  it("8. maxDias limita a quantidade de folgas", () => {
    const s = sugerirCombinacoes({ saldoMinutos: H(40), dias: gerar([4], 10), maxDias: 3, maxSugestoes: 50 });
    expect(s.every((x) => x.dias.length <= 3)).toBe(true);
    expect(s[0].dias).toHaveLength(3);
    expect(s[0].saldoFinal).toBe(H(28));
  });
  it("9. saldo zero ou sem dias elegíveis não sugere nada", () => {
    const z = sugerirCombinacoes({ saldoMinutos: 0, dias: gerar([8], 2) });
    expect(z).toEqual([]);
    expect(z.buscaCompleta).toBe(true);
    expect(sugerirCombinacoes({ saldoMinutos: H(4), dias: gerar([8], 2) })).toEqual([]);
    expect(sugerirCombinacoes({ saldoMinutos: H(4), dias: [{ data: "2026-10-01", minutos: 0 }] })).toEqual([]);
  });
});
