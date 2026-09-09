import { describe, expect, it } from "vitest";
import { filtrarAniversariantesPortal } from "../aniversariantes-portal";
import { tituloDocumento } from "../documento-titulo";
import { portalRoutesForaDoVinculo } from "@/lib/nav/hiddenScreens";

describe("aniversariantes no portal", () => {
  const eu = { colaboradorId: "c1", unidadeId: "u1" };
  const itens = [
    { colaboradorId: "c1", unidadeId: "u1", tipo: "contratacao" as const },
    { colaboradorId: "c2", unidadeId: "u1", tipo: "contratacao" as const },
    { colaboradorId: "c2", unidadeId: "u1", tipo: "nascimento" as const },
    { colaboradorId: "c3", unidadeId: "u2", tipo: "nascimento" as const },
  ];

  it("mostra só o próprio aniversário de contratação", () => {
    const r = filtrarAniversariantesPortal(itens, eu);
    expect(r.filter((i) => i.tipo === "contratacao")).toEqual([itens[0]]);
  });

  it("mostra nascimento apenas de colegas da mesma unidade", () => {
    const r = filtrarAniversariantesPortal(itens, eu);
    expect(r.filter((i) => i.tipo === "nascimento")).toEqual([itens[2]]);
  });
});

describe("título de documento", () => {
  it("usa tipo e competência", () => {
    expect(tituloDocumento({ tipoLabel: "Contracheque", competenciaLabel: "08/2026" })).toBe(
      "Contracheque · 08/2026",
    );
  });

  it("cai para a data de envio quando não há competência", () => {
    expect(
      tituloDocumento({ tipoLabel: "Contrato", competenciaLabel: "—", createdAt: "2026-09-05T10:00:00Z" }),
    ).toContain("Contrato · enviado em");
  });
});

describe("telas fora do vínculo", () => {
  it("esconde convocações de quem não é convocável", () => {
    expect(portalRoutesForaDoVinculo({ podeSerConvocado: false })).toEqual(["/dp/meu/convocacoes"]);
  });

  it("mantém convocações para intermitentes", () => {
    expect(portalRoutesForaDoVinculo({ podeSerConvocado: true })).toEqual([]);
  });
});
