import { describe, expect, it } from "vitest";
import { viraNoDiaSeguinte } from "@/lib/dp/convocacoes-planejamento";
import { MOTIVOS_DE_HORARIO, textoDoErroDePublicacao, textoDoMotivo } from "@/lib/dp/convocacoes-motivos";

describe("viraNoDiaSeguinte", () => {
  it("marca virada quando a saída é anterior à entrada", () => {
    expect(viraNoDiaSeguinte("16:30", "00:35")).toBe(true);
    expect(viraNoDiaSeguinte("22:00", "06:00")).toBe(true);
  });

  it("marca virada quando entrada e saída são iguais (24h)", () => {
    expect(viraNoDiaSeguinte("08:00", "08:00")).toBe(true);
  });

  it("não marca virada em turno dentro do mesmo dia", () => {
    expect(viraNoDiaSeguinte("08:00", "17:00")).toBe(false);
  });

  it("ignora horários incompletos", () => {
    expect(viraNoDiaSeguinte("", "00:35")).toBe(false);
    expect(viraNoDiaSeguinte("16:30", "")).toBe(false);
  });
});

describe("textoDoMotivo", () => {
  it("explica incompatibilidade com os dois horários", () => {
    expect(
      textoDoMotivo("COMPATIBILIDADE_INCOMPATIVEL", { jornada: "16:30–00:20", necessidade: "16:30–00:35" }),
    ).toContain("16:30–00:20");
  });

  it("trata motivo vazio como apta", () => {
    expect(textoDoMotivo(null)).toMatch(/Pode receber/);
  });

  it("classifica motivos resolvidos pelo horário informado", () => {
    expect(MOTIVOS_DE_HORARIO.has("COMPATIBILIDADE_INCOMPATIVEL")).toBe(true);
    expect(MOTIVOS_DE_HORARIO.has("ALOCADO_EM_ESCALA")).toBe(false);
  });
});

describe("textoDoErroDePublicacao", () => {
  it("inclui a data quando a mensagem traz uma", () => {
    expect(textoDoErroDePublicacao("PUBLICATION_TARGET_INELIGIBLE 2026-09-12")).toContain("12/09");
  });

  it("mantém a mensagem original quando não reconhece o código", () => {
    expect(textoDoErroDePublicacao("erro estranho")).toBe("erro estranho");
  });
});
