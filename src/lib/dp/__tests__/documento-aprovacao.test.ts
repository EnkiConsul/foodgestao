import { describe, expect, it } from "vitest";
import {
  PRAZO_APROVACAO_DIAS,
  atrasoAprovacao,
  atrasoGraveAprovacao,
  vencimentoAprovacao,
} from "../documento-aprovacao";

const envio = "2026-09-01T10:00:00.000Z";

describe("prazo de aprovação de documento", () => {
  it("vence 5 dias corridos depois do envio", () => {
    expect(PRAZO_APROVACAO_DIAS).toBe(5);
    const limite = vencimentoAprovacao(envio);
    expect(limite.toISOString().slice(0, 10)).toBe("2026-09-06");
  });

  it("dentro do prazo não tem atraso", () => {
    expect(atrasoAprovacao(envio, new Date("2026-09-02T09:00:00.000Z"))).toBeLessThan(0);
    expect(atrasoGraveAprovacao(envio, new Date("2026-09-05T09:00:00.000Z"))).toBe(false);
  });

  it("no dia do vencimento ainda não é atraso grave", () => {
    expect(atrasoAprovacao(envio, new Date("2026-09-06T09:00:00.000Z"))).toBe(0);
    expect(atrasoGraveAprovacao(envio, new Date("2026-09-06T09:00:00.000Z"))).toBe(false);
  });

  it("passado o prazo vira atraso grave contando os dias", () => {
    expect(atrasoAprovacao(envio, new Date("2026-09-09T09:00:00.000Z"))).toBe(3);
    expect(atrasoGraveAprovacao(envio, new Date("2026-09-07T09:00:00.000Z"))).toBe(true);
  });
});
