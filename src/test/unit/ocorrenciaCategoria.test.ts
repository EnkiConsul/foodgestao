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
  });
  it("ausência justificada é falta justificada, nunca atestado médico", () => {
    expect(categoriaDaOcorrencia("ausencia_justificada")).toBe("ausente");
  });
  it("dispensa do aviso (Art. 488) nunca vira atestado nem falta", () => {
    expect(categoriaDaOcorrencia("ausencia_justificada", { subtipo: "dispensa_aviso_art488" })).toBeUndefined();
  });
  it("descansos vinculados a folga ou troca não viram atestado", () => {
    expect(categoriaDaOcorrencia("ausencia_justificada", { subtipo: "banco_horas_aviso" })).toBeUndefined();
    expect(categoriaDaOcorrencia("ausencia_justificada", { subtipo: "compensacao_feriado" })).toBeUndefined();
    expect(categoriaDaOcorrencia("ausencia_justificada", { folga_id: "f1" })).toBeUndefined();
    expect(categoriaDaOcorrencia("ausencia_justificada", { troca_id: "t1" })).toBeUndefined();
  });
});
