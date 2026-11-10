import { describe, expect, it } from "vitest";
import {
  diasParaRemarcar,
  mensagemErroRemarcacao,
  pedirAoDp,
  meuPedidoPendenteNoDia,
  ehMudancaDeFolga,
} from "@/lib/dp/folga-remarcacao";

// Setembro/2026: sábados 5, 12, 19, 26 — domingos 6, 13, 20, 27.
const base = { dataAtualIso: "2026-09-20", hojeIso: "2026-09-17", diasElegiveis: [0, 6] };

describe("diasParaRemarcar", () => {
  it("oferece os fins de semana futuros do mês, sem o dia atual", () => {
    const dias = diasParaRemarcar(base).map((d) => d.iso);
    expect(dias).toEqual(["2026-09-19", "2026-09-26", "2026-09-27"]);
  });

  it("marca o motivo de cada dia indisponível", () => {
    const dias = diasParaRemarcar({
      ...base,
      lotadas: ["2026-09-19"],
      bloqueadas: ["2026-09-26"],
      minhasFolgas: ["2026-09-27"],
    });
    expect(dias.map((d) => [d.iso, d.disponivel, d.motivo])).toEqual([
      ["2026-09-19", false, "Limite de pessoas em folga atingido"],
      ["2026-09-26", false, "Data bloqueada pelo DP"],
      ["2026-09-27", false, "Você já tem folga neste dia"],
    ]);
  });

  it("respeita os dias de descanso da unidade (só domingo)", () => {
    const dias = diasParaRemarcar({ ...base, diasElegiveis: [0] }).map((d) => d.iso);
    expect(dias).toEqual(["2026-09-27"]);
  });

  it("não oferece datas passadas", () => {
    const dias = diasParaRemarcar({ ...base, hojeIso: "2026-09-25" }).map((d) => d.iso);
    expect(dias).toEqual(["2026-09-26", "2026-09-27"]);
  });
});

describe("mensagens de erro", () => {
  it("traduz o limite do dia e indica pedir ao DP", () => {
    const raw = "FOLGA_REMARCAR_LIMITE_DIA: o novo dia já atingiu o limite";
    expect(mensagemErroRemarcacao(raw)).toContain("limite de pessoas em folga");
    expect(pedirAoDp(raw)).toBe(true);
  });

  it("usa a mensagem do conflito de colegas", () => {
    expect(
      mensagemErroRemarcacao("FOLGA_REMARCAR_CONFLITO: MARIA já está de folga neste dia."),
    ).toBe("MARIA já está de folga neste dia.");
  });

  it("não sugere o DP para erro de data passada", () => {
    expect(pedirAoDp("PAST_DATE_NOT_EDITABLE: ...")).toBe(false);
    expect(mensagemErroRemarcacao("PAST_DATE_NOT_EDITABLE: ...")).toContain("datas passadas");
  });
});

describe("pedido próprio pendente no dia", () => {
  const pendentes = [
    { id: "a", colaborador_id: "eu", data_alvo: "2026-12-26", data_fim: "2026-12-27", motivo: "MUDANCA_DE_FOLGA" },
    { id: "b", colaborador_id: "colega", data_alvo: "2026-12-19", data_fim: null, motivo: "Folga extra" },
  ];
  it("só devolve o meu pedido do dia, nunca o de um colega", () => {
    expect(meuPedidoPendenteNoDia(pendentes, "eu", "2026-12-26")?.id).toBe("a");
    expect(meuPedidoPendenteNoDia(pendentes, "eu", "2026-12-19")).toBeNull();
    expect(meuPedidoPendenteNoDia(pendentes, null, "2026-12-26")).toBeNull();
  });
  it("reconhece a mudança de folga só com o dia de origem", () => {
    expect(ehMudancaDeFolga(pendentes[0])).toBe(true);
    expect(ehMudancaDeFolga(pendentes[1])).toBe(false);
    expect(ehMudancaDeFolga({ motivo: "MUDANCA_DE_FOLGA", data_fim: null })).toBe(false);
  });
});
