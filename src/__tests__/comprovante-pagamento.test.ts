import { describe, it, expect } from "vitest";
import { TIPOS_COM_COMPROVANTE, aceitaComprovante } from "@/lib/dp/documentoTipos";
import { DP_PENDENCIAS_CONFIG_DEFAULT } from "@/hooks/useDpPendenciasConfig";
import { atrasoEmDias } from "@/lib/dp/pendencias-documentos";

/** Espelha a regra do banco: só documento de pagamento aceita comprovante. */
describe("comprovante de pagamento — allowlist", () => {
  it("aceita os documentos de pagamento", () => {
    for (const tipo of TIPOS_COM_COMPROVANTE) {
      expect(aceitaComprovante(tipo)).toBe(true);
    }
  });

  it("recusa documentos que não são de pagamento", () => {
    for (const tipo of ["ponto", "contrato", "disciplinar", "atestado", "admissao", "identidade"]) {
      expect(aceitaComprovante(tipo)).toBe(false);
    }
    expect(aceitaComprovante(null)).toBe(false);
    expect(aceitaComprovante("")).toBe(false);
  });
});

describe("comprovante de pagamento — cobrança", () => {
  it("vem ligado por padrão, com prazo de 5 dias e início em 01/09/2026", () => {
    expect(DP_PENDENCIAS_CONFIG_DEFAULT.exigir_comprovante_pagamento).toBe(true);
    expect(DP_PENDENCIAS_CONFIG_DEFAULT.alerta_comprovante_dias).toBe(5);
    expect(DP_PENDENCIAS_CONFIG_DEFAULT.comprovante_vigencia_inicio).toBe("2026-09-01");
  });

  it("não cobra documentos anteriores à data de início", () => {
    const inicio = DP_PENDENCIAS_CONFIG_DEFAULT.comprovante_vigencia_inicio;
    expect("2026-08-31" < inicio).toBe(true);
    expect("2026-09-01" < inicio).toBe(false);
  });

  it("fica atrasada somente depois do prazo", () => {
    // Documento de 05/09/2026, prazo de 5 dias → vence em 10/09/2026.
    expect(atrasoEmDias("2026-09-10", "2026-09-08")).toBeLessThan(0);
    expect(atrasoEmDias("2026-09-10", "2026-09-10")).toBe(0);
    expect(atrasoEmDias("2026-09-10", "2026-09-13")).toBe(3);
  });
});
