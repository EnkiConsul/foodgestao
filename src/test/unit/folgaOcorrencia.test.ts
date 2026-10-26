import { describe, expect, it } from "vitest";
import { diretrizPonto, ocorrenciaPedeAtencao, tratativaJaDecididaPorAtestado, tratativaPendente } from "@/lib/dp/ocorrencias";

const base = {
  tipo: "ausencia_justificada", estado: "confirmada", origem: "sistema",
  analise_status: "analisada", impacta_assiduidade: "nao", impacta_ferias: "nao",
  folga_id: "folga", tratativa_ponto: true, tratativa_status: "pendente",
};

describe("justificativas de folgas autorizadas", () => {
  it.each(["compensacao_feriado", "folga_extra", "troca_folga"])("%s tem diretriz abonar mesmo com tratativa pendente", (subtipo) => {
    expect(diretrizPonto({ ...base, subtipo })).toBe("abonar");
  });
  it("folga já aprovada é evento definido, sem pendência de tratativa", () => {
    expect(tratativaPendente(base)).toBe(false);
    expect(ocorrenciaPedeAtencao(base)).toBe(false);


    expect(tratativaJaDecididaPorAtestado(base)).toBe(false);
  });
  it("confirmação da justificativa encerra a pendência sem mudar o abono", () => {
    const concluida = { ...base, tratativa_status: "concluida" };
    expect(tratativaPendente(concluida)).toBe(false);
    expect(diretrizPonto(concluida)).toBe("abonar");
  });
  it("o dia trabalhado por troca é ajustar, não abonar ausência", () => {
    expect(diretrizPonto({ ...base, tipo: "divergencia_jornada", troca_id: "troca", subtipo: "troca_trabalho" })).toBe("ajustar");
  });
  it("folga cancelada não mantém abono nem pendência", () => {
    const cancelada = { ...base, estado: "cancelada" };
    expect(diretrizPonto(cancelada)).toBeNull();
    expect(tratativaPendente(cancelada)).toBe(false);
    expect(ocorrenciaPedeAtencao(cancelada)).toBe(false);
  });
});