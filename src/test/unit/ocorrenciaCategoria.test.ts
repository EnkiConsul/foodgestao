import { describe, expect, it } from "vitest";
import { categoriaDaOcorrencia } from "@/lib/dp/operacao-panorama";

describe("classificação de ocorrências no calendário", () => {
  it("erro no relógio de ponto não vira falta", () => {
    expect(categoriaDaOcorrencia("divergencia_jornada")).toBeUndefined();
  });
  it("esquecimento de marcação não vira falta", () => {
    expect(categoriaDaOcorrencia("esquecimento_marcacao")).toBeUndefined();
  });
  it("atraso no intervalo conta como atraso", () => {
    expect(categoriaDaOcorrencia("atraso_intervalo")).toBe("atrasado");
    expect(categoriaDaOcorrencia("previsao_atraso_intervalo")).toBe("atrasado");
  });
  it("falta continua falta e atestado continua atestado", () => {
    expect(categoriaDaOcorrencia("falta")).toBe("ausente");
    expect(categoriaDaOcorrencia("previsao_falta")).toBe("ausente");
    expect(categoriaDaOcorrencia("atestado")).toBe("atestado");
    expect(categoriaDaOcorrencia("ausencia_justificada")).toBe("atestado");
  });
});
