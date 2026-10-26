import { describe, it, expect } from "vitest";
import { diretrizPonto, tratativaPendente, temControlePonto } from "@/lib/dp/ocorrencias";

const base = { origem: "gestor", analise_status: "pendente", impacta_assiduidade: "nao", tratativa_ponto: false, tratativa_status: null };
describe("diretrizPonto", () => {
  it("atestado aprovado pelo sistema é abonar", () => {
    expect(diretrizPonto({ ...base, tipo: "ausencia_justificada", estado: "confirmada", origem: "sistema", analise_status: "analisada", impacta_assiduidade: "sim", tratativa_ponto: true, tratativa_status: "pendente" })).toBe("abonar");
  });
  it("atraso/falta sem decisão nunca presume desconto", () => {
    expect(diretrizPonto({ ...base, tipo: "falta", estado: "confirmada" })).toBe("decidir");
    expect(diretrizPonto({ ...base, tipo: "atraso", estado: "confirmada" })).toBe("decidir");
  });
  it("decisão do gestor define compensação, abono ou desconto", () => {
    expect(diretrizPonto({ ...base, tipo: "atraso", estado: "confirmada", tratativa_decisao: "compensacao" })).toBe("compensar");
    expect(diretrizPonto({ ...base, tipo: "atraso", estado: "confirmada", tratativa_decisao: "abono" })).toBe("abonar");
    expect(diretrizPonto({ ...base, tipo: "atraso", estado: "confirmada", tratativa_decisao: "desconto" })).toBe("descontar");
  });
  it("esquecimento é ajustar batida", () => {
    expect(diretrizPonto({ ...base, tipo: "esquecimento_marcacao", estado: "confirmada" })).toBe("ajustar");
  });
  it("previsão é a decidir", () => {
    expect(diretrizPonto({ ...base, tipo: "previsao_falta", estado: "informada" })).toBe("decidir");
  });
  it("cancelada fica fora", () => {
    expect(diretrizPonto({ ...base, tipo: "falta", estado: "cancelada" })).toBeNull();
  });
});

describe("eventos pré-definidos", () => {
  const pend = { ...base, estado: "confirmada", tratativa_ponto: true, tratativa_status: "pendente" };
  it("dispensa do Art. 488 não pede tratativa", () => {
    expect(tratativaPendente({ ...pend, tipo: "ausencia_justificada", subtipo: "dispensa_aviso_art488" })).toBe(false);
  });
  it("folga vinculada não pede tratativa", () => {
    expect(tratativaPendente({ ...pend, tipo: "ausencia_justificada", folga_id: "f1" })).toBe(false);
  });
  it("atraso pendente continua pedindo decisão", () => {
    expect(tratativaPendente({ ...pend, tipo: "atraso" })).toBe(true);
  });
});

describe("temControlePonto", () => {
  it("unidade sem relógio ou colaborador sem folha não usa linguagem de ponto", () => {
    expect(temControlePonto({ unidade: { possui_relogio_ponto: false } })).toBe(false);
    expect(temControlePonto({ colaborador: { possui_folha_ponto: false } })).toBe(false);
    expect(temControlePonto({ colaborador: { possui_folha_ponto: true }, unidade: { possui_relogio_ponto: true } })).toBe(true);
  });
});
