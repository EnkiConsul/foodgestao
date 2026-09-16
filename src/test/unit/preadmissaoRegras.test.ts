/**
 * Regras da Pré-Admissão (fonte única compartilhada com as funções de servidor).
 *
 * Os dados abaixo são fictícios de propósito: nenhum candidato, CPF ou documento
 * real aparece em teste.
 */
import { describe, it, expect } from "vitest";
import {
  bloqueioMenorNoturno,
  idadeEmAnos,
  montarChecklist,
  pendenciasDocumentais,
} from "../../../supabase/functions/_shared/preadmissao-checklist";
import {
  filtrarCamposCandidato,
  linkPreadmissao,
  normalizarWhatsapp,
} from "../../../supabase/functions/_shared/preadmissao";

const HOJE = new Date("2026-09-16T12:00:00Z");
const codigos = (itens: { codigo: string }[]) => itens.map((i) => i.codigo);

describe("idade", () => {
  it("calcula pela data de nascimento e ignora idade digitada", () => {
    expect(idadeEmAnos("2009-09-17", HOJE)).toBe(16);
    expect(idadeEmAnos("2008-09-16", HOJE)).toBe(18);
    expect(idadeEmAnos(null, HOJE)).toBeNull();
  });
});

describe("bloqueio de menor com trabalho após as 22h", () => {
  it("bloqueia menor de 18 com trabalho noturno", () => {
    const r = bloqueioMenorNoturno({ data_nascimento: "2009-09-17", trabalho_apos_22h: true }, HOJE);
    expect(r.situacao).toBe("bloqueado");
    expect(r.titulo).toContain("Menor de 18");
  });
  it("libera menor de 18 sem trabalho noturno", () => {
    expect(bloqueioMenorNoturno({ data_nascimento: "2009-09-17", trabalho_apos_22h: false }, HOJE).situacao).toBe("ok");
  });
  it("libera maior de 18 com trabalho noturno", () => {
    expect(bloqueioMenorNoturno({ data_nascimento: "2000-01-10", trabalho_apos_22h: true }, HOJE).situacao).toBe("ok");
  });
  it("fica pendente sem data de nascimento e com trabalho noturno", () => {
    expect(bloqueioMenorNoturno({ data_nascimento: null, trabalho_apos_22h: true }, HOJE).situacao).toBe("pendente");
  });
});

describe("checklist documental", () => {
  const base = { data_nascimento: "1995-05-05", estado_civil: "SOLTEIRO", sexo: "F" };

  it("traz os documentos gerais", () => {
    expect(codigos(montarChecklist({ ficha: base, hoje: HOJE }))).toEqual([
      "identidade", "ctps", "foto_3x4", "titulo_eleitor", "cns_sus", "comprovante_endereco",
      "certidao_nascimento",
    ]);
  });

  it("pede certidão de casamento quando não é solteiro", () => {
    const c = codigos(montarChecklist({ ficha: { ...base, estado_civil: "CASADO" }, hoje: HOJE }));
    expect(c).toContain("certidao_estado_civil");
    expect(c).not.toContain("certidao_nascimento");
  });

  it("pede reservista para homem maior de 18", () => {
    expect(codigos(montarChecklist({ ficha: { ...base, sexo: "MASCULINO" }, hoje: HOJE }))).toContain("reservista");
  });

  it("acrescenta requisito do cargo e da unidade sem duplicar", () => {
    const c = codigos(montarChecklist({
      ficha: base,
      requisitosCargo: ["licenciamento_veiculo"],
      requisitosUnidade: ["licenciamento_veiculo"],
      hoje: HOJE,
    }));
    expect(c.filter((x) => x === "licenciamento_veiculo")).toHaveLength(1);
  });

  it("aplica as faixas de idade dos dependentes só deste fluxo", () => {
    const itens = montarChecklist({
      ficha: base,
      pessoas: [
        { id: "p1", nome: "FILHO PEQUENO", data_nascimento: "2022-01-01", finalidade_dependente: true },
        { id: "p2", nome: "FILHO ESCOLAR", data_nascimento: "2016-01-01", finalidade_dependente: true },
        { id: "p3", nome: "FILHO MAIOR", data_nascimento: "2006-01-01", finalidade_dependente: true },
      ],
      hoje: HOJE,
    });
    const por = (id: string) => codigos(itens.filter((i) => i.pessoa_id === id));
    expect(por("p1").sort()).toEqual(["dep_cpf", "dep_rg", "dep_vacina"]);
    expect(por("p2").sort()).toEqual(["dep_cpf", "dep_declaracao_escolar", "dep_rg"]);
    expect(por("p3")).toEqual([]);
  });

  it("pede RG, CPF e foto para familiar do Sesc sem duplicar quem também é dependente", () => {
    const itens = montarChecklist({
      ficha: base,
      pessoas: [
        { id: "p1", nome: "FILHO", data_nascimento: "2016-01-01", finalidade_dependente: true, finalidade_sesc: true },
        { id: "p2", nome: "MAE", data_nascimento: "1960-01-01", finalidade_sesc: true },
      ],
      hoje: HOJE,
    });
    expect(codigos(itens.filter((i) => i.pessoa_id === "p1" && i.grupo === "sesc")).sort())
      .toEqual(["sesc_cpf", "sesc_foto", "sesc_rg"]);
    expect(codigos(itens.filter((i) => i.pessoa_id === "p2")).sort())
      .toEqual(["sesc_cpf", "sesc_foto", "sesc_rg"]);
    expect(itens.filter((i) => i.pessoa_id === "p2" && i.grupo === "dependente")).toHaveLength(0);
  });

  it("aponta apenas o que ainda falta enviar", () => {
    const itens = montarChecklist({ ficha: base, hoje: HOJE });
    const faltando = pendenciasDocumentais(itens, [
      { requisito_codigo: "identidade", pessoa_id: null },
      { requisito_codigo: "ctps" },
    ]);
    expect(codigos(faltando)).toEqual(["foto_3x4", "titulo_eleitor", "cns_sus", "comprovante_endereco", "certidao_nascimento"]);
  });

  it("documento que deixa de ser obrigatório sai do checklist, sem apagar o arquivo", () => {
    const antes = codigos(montarChecklist({ ficha: base, requisitosCargo: ["licenciamento_veiculo"], hoje: HOJE }));
    const depois = codigos(montarChecklist({ ficha: base, requisitosCargo: [], hoje: HOJE }));
    expect(antes).toContain("licenciamento_veiculo");
    expect(depois).not.toContain("licenciamento_veiculo");
  });
});

describe("dados aceitos do candidato", () => {
  it("ignora qualquer campo contratual ou de identidade da empresa", () => {
    const out = filtrarCamposCandidato({
      nome: " MARIA ",
      cpf: "00000000191",
      company_id: "outra-empresa",
      cargo_previsto_id: "outro-cargo",
      unidade_prevista_id: "outra-unidade",
      trabalho_apos_22h: false,
      salario_base: 99999,
      regime: "clt",
      matricula: "123",
      status: "concluido",
      colaborador_id: "x",
    });
    expect(out).toEqual({ nome: "MARIA", cpf: "00000000191" });
  });
});

describe("convite", () => {
  it("normaliza o WhatsApp com país e DDD", () => {
    expect(normalizarWhatsapp("(62) 99236-5959")).toBe("5562992365959");
    expect(normalizarWhatsapp("5562992365959")).toBe("5562992365959");
    expect(normalizarWhatsapp("99236")).toBeNull();
  });
  it("monta o link do candidato sem expor identificadores em outro lugar", () => {
    const link = linkPreadmissao("https://exemplo.app", "convite-1", "tok+en/=");
    expect(link).toBe("https://exemplo.app/pre-admissao?t=convite-1&c=tok%2Ben%2F%3D");
  });
});
