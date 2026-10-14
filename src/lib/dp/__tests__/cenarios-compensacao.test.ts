import { describe, expect, it } from "vitest";
import { cenariosCompensacao, type GrupoJornada } from "@/lib/dp/compensacao/cenarios";

// Cristiane: SEG/TER/QUA 7h05 (meio de semana) e SEX/SÁB/DOM 7h35 (pico), 4 semanas.
const cris: GrupoJornada[] = [
  { rotulo: "SEG, TER, QUA", minutos: 425, pico: false, max: 12 },
  { rotulo: "DOM, SEX, SÁB", minutos: 455, pico: true, max: 12 },
];
const saldo = 32 * 60 + 54; // 1974

describe("cenários de folga compensatória", () => {
  it("opção 1 usa só meio de semana, mesmo em semanas diferentes (4 folgas, não 3)", () => {
    const c = cenariosCompensacao(cris, saldo).find((x) => x.tipo === "meio_semana")!;
    expect(c.tipo).toBe("meio_semana");
    expect(c.itens).toEqual([{ rotulo: "SEG, TER, QUA", minutos: 425, pico: false, n: 4 }]);
    expect(c.saldoFinal).toBe(1974 - 1700);
  });

  it("opção 2 mescla meio e fim de semana com o menor saldo restante", () => {
    const c = cenariosCompensacao(cris, saldo).find((x) => x.tipo === "menor_sobra")!;
    expect(c.saldoFinal).toBe(184);
  });

  it("opção 3 usa só fim de semana", () => {
    const c = cenariosCompensacao(cris, saldo).find((x) => x.tipo === "fim_semana")!;
    expect(c.itens.every((i) => i.pico)).toBe(true);
    expect(c.minutosUsados).toBe(4 * 455);
  });

  it("nunca passa do saldo sem limite negativo", () => {
    for (const c of cenariosCompensacao(cris, saldo)) expect(c.saldoFinal).toBeGreaterThanOrEqual(0);
  });

  it("sem dias de pico informados, não cria opção de fim de semana", () => {
    const r = cenariosCompensacao([{ rotulo: "A", minutos: 480, pico: false, max: 4 }], 1000);
    expect(r.map((c) => c.tipo)).toEqual(["meio_semana"]);
  });
});

describe("menor saldo com saldo de um dia", () => {
  it("não some quando 1 folga basta", async () => {
    const { cenariosCompensacao } = await import("@/lib/dp/compensacao/cenarios");
    const r = cenariosCompensacao([
      { rotulo: "meio", minutos: 425, pico: false, max: 16 },
      { rotulo: "pico", minutos: 455, pico: true, max: 12 },
    ], 455);
    expect(r.some((c) => c.tipo === "menor_sobra" || c.saldoFinal === 0)).toBe(true);
    expect(Math.min(...r.map((c) => Math.abs(c.saldoFinal)))).toBe(0);
  });
});

describe("saldo negativo liberado", () => {
  const r = cenariosCompensacao(cris, saldo, 455);
  it("primeira opção é a de menor saldo restante absoluto", () => {
    expect(r[0].tipo).toBe("menor_sobra");
    expect(Math.abs(r[0].saldoFinal)).toBe(Math.min(...r.map((c) => Math.abs(c.saldoFinal))));
  });
  it("só fim de semana usa 5 folgas dentro do limite", () => {
    expect(r.find((c) => c.tipo === "fim_semana")!.dias).toBe(5);
  });
});
