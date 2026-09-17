/**
 * Incremento 5 — payload manipulado na raiz/familiares e higienização antes da gravação.
 * Todos os dados são fictícios.
 */
import { describe, it, expect } from "vitest";
import {
  CAMPOS_PESSOA,
  CAMPOS_RAIZ_CANDIDATO,
  camposNaoPermitidosPessoas,
  camposNaoPermitidosRaiz,
  filtrarPessoasCandidato,
} from "../../../supabase/functions/_shared/preadmissao";
import { normaliza } from "../../../supabase/functions/_shared/preadmissao-checklist";

describe("payload da raiz", () => {
  it("aceita apenas as chaves previstas", () => {
    expect(
      camposNaoPermitidosRaiz({ t: "x", c: "y", action: "salvar", dados: {}, pessoas: [], versao: 3 }),
    ).toEqual([]);
  });

  it("aponta chave estranha na raiz", () => {
    expect(camposNaoPermitidosRaiz({ t: "x", action: "salvar", status: "concluido" })).toEqual(["status"]);
    expect(camposNaoPermitidosRaiz({ t: "x", action: "salvar", company_id: "abc" })).toEqual(["company_id"]);
  });

  it("mantém a allowlist estável", () => {
    expect(CAMPOS_RAIZ_CANDIDATO).toContain("dados");
    expect(CAMPOS_RAIZ_CANDIDATO).not.toContain("admin_dados");
  });
});

describe("payload dos familiares", () => {
  it("aceita somente os campos do familiar", () => {
    expect(camposNaoPermitidosPessoas([{ nome: "FILHO UM", parentesco: "filho" }])).toEqual([]);
    expect(CAMPOS_PESSOA).not.toContain("company_id");
  });

  it("aponta campo estranho com o número do familiar", () => {
    const fora = camposNaoPermitidosPessoas([
      { nome: "FILHO UM", parentesco: "filho" },
      { nome: "FILHO DOIS", parentesco: "filho", preadmissao_id: "outra" },
    ]);
    expect(fora.length).toBe(1);
    expect(fora[0]).toContain("preadmissao_id");
    expect(fora[0]).toContain("2");
  });

  it("descarta o excedente ao preparar a gravação", () => {
    const [pessoa] = filtrarPessoasCandidato([
      { nome: "FILHO UM", parentesco: "filho", removido_em: "2026-01-01", company_id: "x" },
    ]) as Record<string, unknown>[];
    expect(Object.keys(pessoa).sort()).toEqual(["nome", "parentesco"]);
  });
});

describe("faixas de idade valem só para filiação", () => {
  it("normaliza o parentesco gravado pelo formulário", () => {
    expect(normaliza("Menor_Guarda")).toBe("menor guarda");
    expect(normaliza(" Enteado ")).toBe("enteado");
  });
});
