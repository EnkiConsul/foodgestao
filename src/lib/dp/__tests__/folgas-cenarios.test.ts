import { describe, it, expect } from "vitest";
import { calculateDateStatus, type FolgaRecord, type ColaboradorRecord } from "../folga-rules";
import { diasParaRemarcar, trocaExigeAprovacaoGestor, mensagemErroRemarcacao, pedirAoDp } from "../folga-remarcacao";

// Janeiro/2027: 06 qua, 09 sáb, 10 dom, 13 qua, 16 sáb, 17 dom, 20 qua
const d = (iso: string) => new Date(`${iso}T00:00:00`);
const EU = "eu";
const COLEGA = "colega";
const colabs: ColaboradorRecord[] = [
  { id: EU, folga_fixa_semana: 3, ativo: true, unidade_id: "u1" },
  { id: COLEGA, folga_fixa_semana: 1, ativo: true, unidade_id: "u1" },
];
const base = (iso: string, folgas: FolgaRecord[], extra: Partial<Parameters<typeof calculateDateStatus>[0]> = {}) =>
  calculateDateStatus({
    date: d(iso),
    myColaboradorId: EU,
    allFolgas: folgas,
    allColaboradores: colabs,
    isAdmin: false,
    diasElegiveis: [0, 6],
    tetoMensal: 1,
    dayLimits: new Map([["2027-01-10", 1], ["2027-01-16", 1], ["2027-01-17", 1]]),
    ...extra,
  });

describe("Cenários de folga", () => {
  it("folga semanal fixa coexiste com a folga de fim de semana", () => {
    const st = base("2027-01-06", [{ colaborador_id: EU, data: "2027-01-09", direito_origem: "fds" }]);
    expect(st.status).toBe("fixed");
  });

  it("folga fixa deslocada substitui a semanal da semana", () => {
    const st = base("2027-01-06", [{ colaborador_id: EU, data: "2027-01-08", direito_origem: "folga_fixa_deslocada" }]);
    expect(st.status).toBe("weekday");
  });

  it("teto do mês atingido barra nova folga de fim de semana", () => {
    const st = base("2027-01-16", [{ colaborador_id: EU, data: "2027-01-09", direito_origem: "fds" }]);
    expect(st.label).toBe("Teto do mês");
  });

  it("folga fixa deslocada para o sábado não consome o teto", () => {
    const st = base("2027-01-16", [{ colaborador_id: EU, data: "2027-01-09", direito_origem: "folga_fixa_deslocada" }]);
    expect(st.status).toBe("available");
  });

  it("folga extra não consome o teto", () => {
    const st = base("2027-01-16", [{ colaborador_id: EU, data: "2027-01-09", extra: true }]);
    expect(st.status).toBe("available");
  });

  it("dia lotado por colega da unidade fica indisponível", () => {
    const st = base("2027-01-10", [{ colaborador_id: COLEGA, data: "2027-01-10", tipo: "normal" }], { tetoMensal: 5 });
    expect(st.status).toBe("taken");
  });

  it("dia bloqueado fica bloqueado", () => {
    const st = base("2027-01-17", [], { manualBlocked: new Map([["2027-01-17", { reason: "Evento", liberada: false }]]) });
    expect(st.status).toBe("blocked");
  });

  it("bloqueio liberado volta a ficar disponível", () => {
    const st = base("2027-01-17", [], { manualBlocked: new Map([["2027-01-17", { reason: "Evento", liberada: true }]]) });
    expect(st.status).toBe("available");
  });

  it("minha folga aparece como minha", () => {
    expect(base("2027-01-09", [{ colaborador_id: EU, data: "2027-01-09" }]).status).toBe("mine");
  });

  it("dia de semana comum não é marcável", () => {
    expect(base("2027-01-07", []).status).toBe("weekday");
  });

  it("remarcação lista só fins de semana do mês, marcando lotados e bloqueados", () => {
    const dias = diasParaRemarcar({
      dataAtualIso: "2027-01-09",
      hojeIso: "2027-01-01",
      diasElegiveis: [0, 6],
      bloqueadas: ["2027-01-17"],
      lotadas: ["2027-01-10"],
      minhasFolgas: ["2027-01-09"],
    });
    expect(dias.every((x) => [0, 6].includes(x.dow))).toBe(true);
    expect(dias.find((x) => x.iso === "2027-01-09")).toBeUndefined();
    expect(dias.find((x) => x.iso === "2027-01-10")?.disponivel).toBe(false);
    expect(dias.find((x) => x.iso === "2027-01-17")?.disponivel).toBe(false);
    expect(dias.find((x) => x.iso === "2027-01-16")?.disponivel).toBe(true);
    expect(dias.every((x) => x.iso.startsWith("2027-01"))).toBe(true);
  });

  it("troca fim de semana ↔ fim de semana é direta; misturar com dia útil exige gestor", () => {
    expect(trocaExigeAprovacaoGestor("2027-01-09", "2027-01-10")).toBe(false);
    expect(trocaExigeAprovacaoGestor("2027-01-09", "2027-01-17")).toBe(true);
    expect(trocaExigeAprovacaoGestor("2027-01-09", "2027-01-13")).toBe(true);
    expect(trocaExigeAprovacaoGestor("2027-01-06", "2027-01-08")).toBe(false);
  });

  it("erros de lotação/bloqueio do servidor viram pedido ao gestor", () => {
    expect(pedirAoDp("FOLGA_REMARCAR_LIMITE_DIA: x")).toBe(true);
    expect(pedirAoDp("FOLGA_REMARCAR_BLOQUEADA: x")).toBe(true);
    expect(mensagemErroRemarcacao("FOLGA_REMARCAR_BLOQUEADA: x").length).toBeGreaterThan(0);
  });
});

describe("Folga extra (exceção)", () => {
  it("folga extra no fim de semana não consome o teto do mês", () => {
    const st = base("2027-01-16", [{ colaborador_id: EU, data: "2027-01-09", direito_origem: "excecao_gestor" }]);
    expect(st.status).toBe("available");
  });
  it("folga extra na semana não substitui a folga semanal fixa", () => {
    const st = base("2027-01-06", [{ colaborador_id: EU, data: "2027-01-08", extra: true, direito_origem: "excecao_gestor" }]);
    expect(st.status).toBe("fixed");
  });
});
