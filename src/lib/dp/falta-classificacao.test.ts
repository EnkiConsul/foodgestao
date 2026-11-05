import { describe, expect, it } from "vitest";
import { prepararFalta } from "./falta-classificacao";
import { padraoAssiduidade } from "./assiduidade-risco";
describe("falta e comunicação independentes", () => {
  it.each(["sim", "nao", "nao_informado"] as const)("comunicação %s não transforma injustificada em justificada", comunicacao => expect(prepararFalta("injustificada", comunicacao, "Motivo").tipo).toBe("falta"));
  it("justificada mantém prêmio por padrão, sem decidir desconto", () => {
    const r = prepararFalta("justificada", "nao", "Motivo acolhido");
    expect(r.tipo).toBe("ausencia_justificada");
    expect(padraoAssiduidade(r.evento)).toBe(false);
    expect(r).not.toHaveProperty("descontar_dsr");
  });
  it("injustificada conserva padrão e decisão explícita", () => expect(padraoAssiduidade(prepararFalta("injustificada", "sim", "").evento)).toBe(true));
});