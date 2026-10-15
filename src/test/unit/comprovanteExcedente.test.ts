import { describe, expect, it } from "vitest";
import { validarExcedente } from "@/lib/dp/comprovante-excedente";

describe("valor a maior no comprovante", () => {
  it("exige motivo", () => {
    expect(validarExcedente({ motivo: null, justificativa: "x".repeat(20), confirmado: true }).ok).toBe(false);
  });
  it("exige justificativa de 15 caracteres", () => {
    expect(validarExcedente({ motivo: "premio", justificativa: "curta demais", confirmado: true }).ok).toBe(false);
  });
  it("exige confirmação de responsabilidade", () => {
    expect(validarExcedente({ motivo: "premio", justificativa: "meta de vendas batida", confirmado: false }).ok).toBe(false);
  });
  it("aceita quando tudo foi informado", () => {
    expect(validarExcedente({ motivo: "premio", justificativa: "meta de vendas batida", confirmado: true }).ok).toBe(true);
  });
});
