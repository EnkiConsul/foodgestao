import { describe, expect, it } from "vitest";
import { ausenciasVisiveis, filtrosSalvos, TIPOS_AUSENCIA } from "@/lib/dp/calendario-rotina";

const pessoas = [
  { colaborador_id: "1", nome: "Hanna", categoria: "folga_padrao" as const },
  { colaborador_id: "2", nome: "Thais", categoria: "ferias" as const },
  { colaborador_id: "3", nome: "Cris", categoria: "ausente" as const },
  { colaborador_id: "4", nome: "Nord", categoria: "fixo" as const },
];

describe("calendário da rotina", () => {
  it("por padrão todos os tipos ficam marcados", () => {
    expect(filtrosSalvos(undefined)).toEqual(TIPOS_AUSENCIA);
  });

  it("desmarcar um tipo esconde só esse tipo", () => {
    const r = ausenciasVisiveis(pessoas, ["ferias", "falta", "atestado", "outras"]);
    expect(r.map((a) => a.nome)).toEqual(["Thais", "Cris"]);
  });

  it("quem trabalha nunca aparece como ausente", () => {
    expect(ausenciasVisiveis(pessoas, TIPOS_AUSENCIA).some((a) => a.nome === "Nord")).toBe(false);
  });
});
