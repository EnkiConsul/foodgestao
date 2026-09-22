import { describe, expect, it } from "vitest";
import {
  diasParaRemarcar,
  mensagemErroRemarcacao,
  pedirAoDp,
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
