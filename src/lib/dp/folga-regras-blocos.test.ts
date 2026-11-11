import { describe, expect, it } from "vitest";
import { erroPeriodoEscolha, resumoTravas, trocaLiberadaNoPortal } from "./folga-regras-blocos";

const base = {
  folga_marcacao_portal: true,
  folga_janela_ativa: true,
  folga_janela_abre_dia: 10,
  folga_janela_fecha_dia: 20,
  troca_folga_modo: "aprovacao_admin" as const,
};

describe("troca de folga independente da escolha pelo app", () => {
  it("escolha desligada mantém a troca liberada quando a regra de troca permite", () => {
    expect(trocaLiberadaNoPortal({ ...base, folga_marcacao_portal: false } as never)).toBe(true);
  });
  it("troca 'Não permitida' bloqueia mesmo com a escolha ligada", () => {
    expect(trocaLiberadaNoPortal({ troca_folga_modo: "proibida" })).toBe(false);
  });
});

describe("período mensal de escolha", () => {
  it("datas invertidas não travam o salvamento quando a escala é da gerência", () => {
    expect(
      erroPeriodoEscolha({ ...base, folga_marcacao_portal: false, folga_janela_abre_dia: 20, folga_janela_fecha_dia: 10 }),
    ).toBeNull();
  });
  it("datas invertidas travam quando o colaborador escolhe no app", () => {
    expect(erroPeriodoEscolha({ ...base, folga_janela_abre_dia: 20, folga_janela_fecha_dia: 10 })).not.toBeNull();
  });
});

describe("contagem de travas", () => {
  it("conta só as travas ativas", () => {
    expect(resumoTravas([{ ativo: true }, { ativo: false }, { ativo: true }])).toBe("2 travas ativas");
  });
});
