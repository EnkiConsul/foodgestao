import { describe, expect, it } from "vitest";
import { folgasDisponiveisTroca } from "@/lib/dp/troca-gestor";

const pessoa = (colaborador_id: string, categoria: string, avulso_id?: string) => ({ colaborador_id, categoria, avulso_id });
describe("folgas reais para troca pelo gestor", () => {
  it("não sugere datas passadas recusadas pelo registro oficial", () => {
    expect(folgasDisponiveisTroca([
      { data: "2026-10-25", pessoas: [pessoa("hanna", "folga_padrao"), pessoa("veronica", "fixo")] },
      { data: "2026-10-29", pessoas: [pessoa("hanna", "folga_padrao"), pessoa("veronica", "fixo")] },
    ], "hanna", "veronica", "2026-10-26", "2026-10-27")).toEqual(["2026-10-29"]);
  });
  it("oferece folga fixa e registrada do colega quando a primeira pessoa trabalha", () => {
    expect(folgasDisponiveisTroca([
      { data: "2026-10-28", pessoas: [pessoa("hanna", "folga_padrao"), pessoa("veronica", "fixo")] },
      { data: "2026-10-29", pessoas: [pessoa("hanna", "folga_extra"), pessoa("veronica", "fixo")] },
    ], "hanna", "veronica", "2026-10-26")).toEqual(["2026-10-28", "2026-10-29"]);
  });
  it("não oferece a mesma data nem dia em que ambas folgam", () => {
    expect(folgasDisponiveisTroca([
      { data: "2026-10-26", pessoas: [pessoa("hanna", "folga_padrao"), pessoa("veronica", "fixo")] },
      { data: "2026-10-28", pessoas: [pessoa("hanna", "folga_padrao"), pessoa("veronica", "folga_padrao")] },
    ], "hanna", "veronica", "2026-10-26")).toEqual([]);
  });
  it("exclui folga coberta por afastamento e participação avulsa", () => {
    expect(folgasDisponiveisTroca([
      { data: "2026-10-28", pessoas: [pessoa("hanna", "folga_padrao"), pessoa("hanna", "atestado"), pessoa("veronica", "fixo")] },
      { data: "2026-10-29", pessoas: [pessoa("hanna", "folga_padrao"), pessoa("veronica", "fixo", "extra")] },
    ], "hanna", "veronica", "2026-10-26")).toEqual([]);
  });
});