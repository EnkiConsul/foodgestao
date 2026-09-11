import { describe, expect, it } from "vitest";
import { newNegotiationForm } from "./UnidadeNegociacoesPanel";

describe("newNegotiationForm", () => {
  it("reaproveita os sindicatos e o mês da negociação mais recente no ano seguinte", () => {
    const form = newNegotiationForm({
      ano: 2025,
      mes: 5,
      data_base: "2025-05-01",
      sindicato_id: "patronal-1",
      sindicato_laboral_id: "laboral-1",
    } as Parameters<typeof newNegotiationForm>[0]);

    expect(form).toMatchObject({
      sindicato_patronal_id: "patronal-1",
      sindicato_laboral_id: "laboral-1",
      ano: "2026",
      mes: "5",
      arquivo: null,
      arquivo_nome: null,
    });
  });

  it("mantém os padrões atuais quando não há negociação anterior", () => {
    const form = newNegotiationForm();

    expect(form.ano).toBe(String(new Date().getFullYear()));
    expect(form.mes).toBe(String(new Date().getMonth() + 1));
    expect(form.sindicato_patronal_id).toBe("");
    expect(form.sindicato_laboral_id).toBe("");
  });
});