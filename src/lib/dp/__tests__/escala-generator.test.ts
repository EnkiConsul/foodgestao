import { describe, it, expect } from "vitest";
import { gerarEscala, semanasDoPeriodo, intervaloDatas } from "@/lib/dp/escala-generator";

const colab = (over: Partial<Parameters<typeof gerarEscala>[0]["colaboradores"][number]> = {}) => ({
  id: "c1",
  nome: "Ana",
  diasFolga: [1], // segunda
  ...over,
});

const base = {
  inicio: "2026-08-02", // domingo
  fim: "2026-08-29",
  periodicidadeDomingo: 3,
  periodicidadeDomingoMulher: 2,
};

describe("intervaloDatas / semanasDoPeriodo", () => {
  it("gera o intervalo inclusivo", () => {
    expect(intervaloDatas("2026-08-02", "2026-08-04")).toEqual(["2026-08-02", "2026-08-03", "2026-08-04"]);
  });

  it("fatia em blocos de 7 dias", () => {
    const s = semanasDoPeriodo("2026-08-02", "2026-08-29");
    expect(s).toHaveLength(4);
    expect(s[0][0]).toBe("2026-08-02");
    expect(s[3][6]).toBe("2026-08-29");
  });
});

describe("gerarEscala", () => {
  it("propõe uma folga por semana no dia da jornada", () => {
    const { propostas, alertas } = gerarEscala({ ...base, colaboradores: [colab()] });
    expect(propostas).toHaveLength(4);
    // na 3ª semana a periodicidade dominical vence e a folga migra para o domingo
    expect(propostas.map((p) => p.data)).toEqual(["2026-08-03", "2026-08-10", "2026-08-16", "2026-08-24"]);
    expect(alertas).toHaveLength(0);
  });

  it("respeita o override de dia fixo do colaborador", () => {
    const { propostas } = gerarEscala({
      ...base,
      colaboradores: [colab({ folgaFixa: 2 })], // terça
    });
    expect(propostas[0].data).toBe("2026-08-04");
    expect(propostas[0].motivo).toContain("Dia fixo");
  });

  it("aloca domingo quando a periodicidade vence", () => {
    const { propostas } = gerarEscala({ ...base, colaboradores: [colab()], periodicidadeDomingo: 2 });
    const domingos = propostas.filter((p) => p.motivo.includes("dominical"));
    expect(domingos.length).toBeGreaterThan(0);
  });

  it("usa a periodicidade feminina quando mais protetiva", () => {
    const { propostas } = gerarEscala({
      ...base,
      periodicidadeDomingo: 4,
      periodicidadeDomingoMulher: 2,
      colaboradores: [colab({ sexo: "F" })],
    });
    expect(propostas.some((p) => p.motivo.includes("dominical"))).toBe(true);
  });

  it("pula datas bloqueadas e cai no próximo dia disponível", () => {
    const { propostas } = gerarEscala({
      ...base,
      colaboradores: [colab()],
      bloqueadas: new Set(["2026-08-03"]),
    });
    expect(propostas[0].data).not.toBe("2026-08-03");
  });

  it("ignora semanas em que o colaborador está de férias e alerta", () => {
    const semana1 = intervaloDatas("2026-08-02", "2026-08-08");
    const { alertas } = gerarEscala({
      ...base,
      colaboradores: [colab()],
      ausencias: new Set(semana1.map((d) => `c1|${d}`)),
    });
    expect(alertas.some((a) => a.tipo === "dsr")).toBe(true);
  });

  it("não duplica folga já existente na semana", () => {
    const { propostas } = gerarEscala({
      ...base,
      colaboradores: [colab()],
      folgasExistentes: new Set(["c1|2026-08-03"]),
    });
    expect(propostas.some((p) => p.data.startsWith("2026-08-0"))).toBe(false);
    expect(propostas).toHaveLength(3);
  });

  it("respeita o limite diário de folgas", () => {
    const { propostas } = gerarEscala({
      ...base,
      colaboradores: [colab(), colab({ id: "c2", nome: "Bia" })],
      limitePorDia: new Map([["2026-08-03", 1]]),
    });
    const noDia = propostas.filter((p) => p.data === "2026-08-03");
    expect(noDia).toHaveLength(1);
  });
});
