/**
 * Riscos apontados na revisão do commit f276cab — cobertos por comportamento.
 * Todos os dados são fictícios.
 */
import { describe, it, expect } from "vitest";
import {
  camposNaoPermitidos,
  candidatoPodeEditar,
  cpfValido,
  dataValida,
  emailValido,
  tipoRealDoArquivo,
  validarDadosCandidato,
} from "../../../supabase/functions/_shared/preadmissao";
import { montarChecklist } from "../../../supabase/functions/_shared/preadmissao-checklist";

const HOJE = new Date("2026-09-16T12:00:00Z");
const codigos = (itens: { codigo: string }[]) => itens.map((i) => i.codigo);

describe("fase da ficha", () => {
  it("permite gravar só enquanto a ficha está com o candidato", () => {
    for (const s of ["aguardando_preenchimento", "em_preenchimento", "correcao_solicitada", "aguardando_nova_versao"]) {
      expect(candidatoPodeEditar(s)).toBe(true);
    }
    for (const s of [
      "aguardando_revisao",
      "pronto_contabilidade",
      "enviado_contabilidade",
      "aguardando_retorno_contabilidade",
      "registro_recebido",
      "concluido",
      "cancelado",
    ]) {
      expect(candidatoPodeEditar(s)).toBe(false);
    }
  });
});

describe("payload manipulado (requisito 70)", () => {
  it("aponta campos fora da allowlist em vez de aceitar em silêncio", () => {
    expect(camposNaoPermitidos({ nome: "MARIA", salario: 9000, cargo_previsto_id: "x" }))
      .toEqual(["salario", "cargo_previsto_id"]);
  });
  it("não reclama de payload legítimo", () => {
    expect(camposNaoPermitidos({ nome: "MARIA", cpf: "52998224725" })).toEqual([]);
  });
});

describe("validação de conteúdo", () => {
  it("valida CPF pelos dígitos verificadores", () => {
    expect(cpfValido("52998224725")).toBe(true);
    expect(cpfValido("11111111111")).toBe(false);
    expect(cpfValido("52998224726")).toBe(false);
    expect(cpfValido("529982247")).toBe(false);
  });
  it("valida e-mail e data real", () => {
    expect(emailValido("ficticio@exemplo.com")).toBe(true);
    expect(emailValido("ficticio@exemplo")).toBe(false);
    expect(dataValida("2024-02-30")).toBe(false);
    expect(dataValida("2024-02-29")).toBe(true);
  });
  it("recusa nascimento futuro, impossível e idade abaixo do mínimo", () => {
    expect(validarDadosCandidato({ data_nascimento: "2030-01-01" }, HOJE).data_nascimento).toBeTruthy();
    expect(validarDadosCandidato({ data_nascimento: "1890-01-01" }, HOJE).data_nascimento).toBeTruthy();
    expect(validarDadosCandidato({ data_nascimento: "2020-01-01" }, HOJE).data_nascimento).toBeTruthy();
    expect(validarDadosCandidato({ data_nascimento: "2000-01-01" }, HOJE).data_nascimento).toBeUndefined();
  });
  it("aceita apenas sexo e estado civil da lista", () => {
    expect(validarDadosCandidato({ sexo: "outro_qualquer" }, HOJE).sexo).toBeTruthy();
    expect(validarDadosCandidato({ sexo: "feminino" }, HOJE).sexo).toBeUndefined();
    expect(validarDadosCandidato({ estado_civil: "amigado" }, HOJE).estado_civil).toBeTruthy();
  });
  it("não inventa erro para campo ausente", () => {
    expect(validarDadosCandidato({}, HOJE)).toEqual({});
  });
});

describe("checklist", () => {
  it("pede reservista somente quando a empresa configurou o requisito", () => {
    const base = { ficha: { data_nascimento: "1995-05-05", sexo: "masculino", estado_civil: "solteiro" }, hoje: HOJE };
    expect(codigos(montarChecklist(base))).not.toContain("reservista");
    expect(codigos(montarChecklist({ ...base, requisitosEmpresa: ["reservista"] }))).toContain("reservista");
  });
  it("aplica faixas de idade só para filiação, não para cônjuge", () => {
    const pessoas = [
      { id: "p1", nome: "FILHA FICTICIA", data_nascimento: "2022-01-10", parentesco: "filha", finalidade_dependente: true, finalidade_sesc: false },
      { id: "p2", nome: "CONJUGE FICTICIO", data_nascimento: "2020-01-10", parentesco: "conjuge", finalidade_dependente: true, finalidade_sesc: false },
    ];
    const itens = montarChecklist({ ficha: { data_nascimento: "1990-01-01" }, pessoas: pessoas as never, hoje: HOJE });
    expect(itens.some((i) => i.codigo === "dep_vacina" && i.pessoa_id === "p1")).toBe(true);
    expect(itens.some((i) => i.pessoa_id === "p2")).toBe(false);
  });
  it("inclui requisito personalizado de cargo/unidade no checklist", () => {
    const itens = montarChecklist({
      ficha: {},
      requisitosCargo: ["curso_manipulacao_alimentos"],
      requisitosUnidade: ["cracha_condominio"],
      hoje: HOJE,
    });
    expect(codigos(itens)).toContain("curso_manipulacao_alimentos");
    expect(codigos(itens)).toContain("cracha_condominio");
  });
});

describe("tipo real do arquivo", () => {
  const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(24).fill(0)]);
  it("reconhece PDF, JPG, PNG e WEBP pelos bytes", () => {
    expect(tipoRealDoArquivo(bytes(0x25, 0x50, 0x44, 0x46))).toBe("application/pdf");
    expect(tipoRealDoArquivo(bytes(0xff, 0xd8, 0xff))).toBe("image/jpeg");
    expect(tipoRealDoArquivo(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    const webp = new Uint8Array(24);
    webp.set([0x52, 0x49, 0x46, 0x46], 0);
    webp.set([0x57, 0x45, 0x42, 0x50], 8);
    expect(tipoRealDoArquivo(webp)).toBe("image/webp");
  });
  it("recusa executável renomeado como imagem", () => {
    expect(tipoRealDoArquivo(bytes(0x4d, 0x5a, 0x90, 0x00))).toBeNull();
    expect(tipoRealDoArquivo(bytes(0x7f, 0x45, 0x4c, 0x46))).toBeNull();
  });
});
