import { describe, expect, it } from "vitest";
import { podeReceberFolga, podeReceberCompensatoria } from "./folga-elegibilidade";
describe("elegibilidade de folgas por vínculo", () => {
  it.each(["intermitente", "pj", "mei"])("%s não recebe folga celetista", (regime) => expect(podeReceberFolga({ regime, forma_pagamento: "mensalista" })).toBe(false));
  it.each(["diarista", "horista", "semanal", "por_turno", "servico_acordo"])("freelancer %s não recebe folga", forma_pagamento => expect(podeReceberFolga({ regime: "freelancer", forma_pagamento })).toBe(false));
  it("sócio usa ausência, nunca compensatória", () => {
    expect(podeReceberFolga({ regime: "pj", vinculo_label: "Sócio" })).toBe(false);
    expect(podeReceberCompensatoria({ regime: "pj", vinculo_label: "Sócio" }, true)).toBe(false);
  });
  it.each(["clt", "estagio", "temporario"])("%s conserva descanso semanal", regime => expect(podeReceberFolga({ regime })).toBe(true));
  it("freelancer mensalista conserva a política operacional existente", () => expect(podeReceberFolga({ regime: "freelancer", forma_pagamento: "mensalista" })).toBe(true));
  it("unidade desligada bloqueia mesmo com exceção individual true", () => expect(podeReceberCompensatoria({ regime: "clt" }, false, true)).toBe(false));
  it("exceção individual false bloqueia e null herda unidade", () => {
    expect(podeReceberCompensatoria({ regime: "clt" }, true, false)).toBe(false);
    expect(podeReceberCompensatoria({ regime: "clt" }, true, null)).toBe(true);
  });
  it.each(["estagio", "temporario", "intermitente"])("%s não recebe compensatória de feriado", regime => expect(podeReceberCompensatoria({ regime }, true)).toBe(false));
});