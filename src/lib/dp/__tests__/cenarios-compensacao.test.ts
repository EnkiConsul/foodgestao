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
    const c = cenariosCompensacao(cris, saldo)[0];
    expect(c.tipo).toBe("meio_semana");
    expect(c.itens).toEqual([{ rotulo: "SEG, TER, QUA", minutos: 425, pico: false, n: 4 }]);
    expect(c.saldoFinal).toBe(1974 - 1700);
  });

  it("opção 2 é a de menor saldo restante", () => {
    const c = cenariosCompensacao(cris, saldo).find((x) => x.tipo === "menor_sobra")!;
    // 2×425 + 2×455 = 1760 → resta 214, menor que 274 da opção 1
    expect(c.saldoFinal).toBe(214);
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
