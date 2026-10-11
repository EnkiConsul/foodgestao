import { describe, it, expect } from "vitest";
import { buildBloqueiosDeRegras, regraAplicaPessoa, type RegraRow } from "../bloqueio-rules";
import { podeEscolherFolgaFds } from "../escolha-folga-elegibilidade";

const regraGerente: RegraRow = {
  id: "r1", company_id: "c", nome: "Gerente 1º domingo", tipo: "dinamica", mes: null, dia: null, ativo: true,
  regra_json: { meses: [11], ordinal: 1, dia_semana: 0, alvo_tipo: "cargo", cargo_id: "gerente" },
};
const nov = { from: new Date(2026, 10, 1), to: new Date(2026, 10, 30) };

describe("público-alvo das regras de bloqueio", () => {
  it("regra por cargo bloqueia o 1º domingo só para o gerente", () => {
    const m = buildBloqueiosDeRegras({ regras: [regraGerente], vinculos: [], unidadeId: null, ...nov, pessoa: { cargoId: "gerente" } });
    expect([...m.keys()]).toEqual(["2026-11-01"]);
  });
  it("outro cargo não é bloqueado", () => {
    expect(regraAplicaPessoa(regraGerente, { cargoId: "garcom" })).toBe(false);
  });
  it("visão geral (sem pessoa) não fecha o dia por regra direcionada", () => {
    const m = buildBloqueiosDeRegras({ regras: [regraGerente], vinculos: [], unidadeId: null, ...nov });
    expect(m.size).toBe(0);
  });
  it("sem público definido vale para todos (padrão)", () => {
    expect(regraAplicaPessoa({ regra_json: { meses: [11] } }, null)).toBe(true);
  });
});

describe("quem vê o card de escolha de folga", () => {
  it("CLT e freelancer mensalista sim", () => {
    expect(podeEscolherFolgaFds("clt", "mensalista", null)).toBe(true);
    expect(podeEscolherFolgaFds("freelancer", "mensalista", null)).toBe(true);
  });
  it("freelancer diarista, intermitente e sócio não", () => {
    expect(podeEscolherFolgaFds("freelancer", "diaria", null)).toBe(false);
    expect(podeEscolherFolgaFds("intermitente", null, null)).toBe(false);
    expect(podeEscolherFolgaFds("clt", null, "Sócio")).toBe(false);
  });
});
