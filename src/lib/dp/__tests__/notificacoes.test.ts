import { describe, expect, it } from "vitest";
import {
  notificacaoLida,
  notificacaoOrigemLabel,
  notificacaoPathGestor,
  notificacaoPathPortal,
} from "../notificacoes";

describe("notificacaoLida — leitura individual por destinatário", () => {
  it("notificação pessoal sem lida_em está não lida", () => {
    expect(notificacaoLida({ lida_em: null, user_id: "u1" }, new Set(), "n1")).toBe(false);
  });

  it("notificação pessoal com lida_em está lida", () => {
    expect(notificacaoLida({ lida_em: "2026-09-08T00:00:00Z", user_id: "u1" }, new Set(), "n1")).toBe(true);
  });

  it("compartilhada sem leitura individual está não lida para este usuário", () => {
    expect(notificacaoLida({ lida_em: null, user_id: null }, new Set(["outra"]), "n1")).toBe(false);
  });

  it("compartilhada com leitura individual está lida só para quem leu", () => {
    const leituras = new Set(["n1"]);
    expect(notificacaoLida({ lida_em: null, user_id: null }, leituras, "n1")).toBe(true);
    expect(notificacaoLida({ lida_em: null, user_id: null }, leituras, "n2")).toBe(false);
  });

  it("lida_em legado em compartilhada continua respeitado (histórico)", () => {
    expect(notificacaoLida({ lida_em: "2026-09-01T00:00:00Z", user_id: null }, new Set(), "n1")).toBe(true);
  });
});

describe("origem amigável — sem nomes técnicos", () => {
  it("traduz origens conhecidas para linguagem de negócio", () => {
    expect(notificacaoOrigemLabel("dp_solicitacoes")).toBe("Solicitações");
    expect(notificacaoOrigemLabel("dp_documentos")).toBe("Documentos");
    expect(notificacaoOrigemLabel("dp_indisponibilidades")).toBe("Disponibilidade");
    expect(notificacaoOrigemLabel("dp_convocacoes")).toBe("Convocações");
  });

  it("nunca expõe nome técnico desconhecido", () => {
    expect(notificacaoOrigemLabel("dp_tabela_secreta")).toBe("Aviso");
    expect(notificacaoOrigemLabel(null)).toBe("Aviso");
    expect(notificacaoOrigemLabel(undefined)).toBe("Aviso");
  });
});

describe("destinos (deep links)", () => {
  it("gestor cai em rotas do Pessoas 360", () => {
    expect(notificacaoPathGestor("dp_trocas")).toBe("/dp/folgas?aba=trocas");
    expect(notificacaoPathGestor("desconhecida")).toBe("/dp/notificacoes");
  });

  it("portal cai em rotas do colaborador", () => {
    expect(notificacaoPathPortal("dp_convocacoes")).toBe("/dp/meu/convocacoes");
    expect(notificacaoPathPortal(null)).toBe("/dp/meu");
  });
});
