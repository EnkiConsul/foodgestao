import { describe, it, expect } from "vitest";
import {
  CONDICOES_FREELA_VAZIAS,
  comporObservacaoFreela,
  lerCondicoesFreela,
  separarObservacaoFreela,
  temCondicoesFreela,
  textoCondicoesFreela,
} from "@/lib/dp/convocacao-freela";

const cheias = {
  diaria: 150,
  refeicao: "vale" as const,
  refeicaoValor: 25,
  transporteValor: 12.5,
  gorjeta: true,
};

describe("condições do freelancer", () => {
  it("nada preenchido não gera texto", () => {
    expect(temCondicoesFreela(CONDICOES_FREELA_VAZIAS)).toBe(false);
    expect(textoCondicoesFreela(CONDICOES_FREELA_VAZIAS)).toBe("");
    expect(comporObservacaoFreela("levar avental", CONDICOES_FREELA_VAZIAS)).toBe("levar avental");
  });

  it("descreve tudo que foi combinado", () => {
    const t = textoCondicoesFreela(cheias);
    expect(t).toContain("Diária: R$ 150,00");
    expect(t).toContain("Vale-alimentação: R$ 25,00 por dia");
    expect(t).toContain("Ajuda de transporte: R$ 12,50 por dia");
    expect(t).toContain("Participa da gorjeta");
  });

  it("refeição na loja não pede valor", () => {
    const t = textoCondicoesFreela({ ...CONDICOES_FREELA_VAZIAS, refeicao: "loja" });
    expect(t).toContain("fornecida na loja");
    expect(t).not.toContain("Vale-alimentação");
  });

  it("ida e volta pelo texto do rascunho", () => {
    const texto = comporObservacaoFreela("chegar 10 min antes", cheias);
    expect(separarObservacaoFreela(texto)).toBe("chegar 10 min antes");
    const lido = lerCondicoesFreela(texto);
    expect(lido).toEqual(cheias);
    // Recompor não duplica o bloco.
    const recomposto = comporObservacaoFreela(separarObservacaoFreela(texto), lido);
    expect(recomposto).toBe(texto);
  });
});
