import { describe, expect, it } from "vitest";
import { ausenciasVisiveis, filtrosSalvos, TIPOS_AUSENCIA } from "@/lib/dp/calendario-rotina";

const pessoas = [
  { colaborador_id: "1", nome: "Hanna", categoria: "folga_padrao" as const },
  { colaborador_id: "2", nome: "Thais", categoria: "ferias" as const },
  { colaborador_id: "3", nome: "Cris", categoria: "ausente" as const },
  { colaborador_id: "4", nome: "Nord", categoria: "fixo" as const },
];

describe("calendário da rotina", () => {
  it("por padrão todos os tipos ficam marcados", () => {
    expect(filtrosSalvos(undefined)).toEqual(TIPOS_AUSENCIA);
  });

  it("desmarcar um tipo esconde só esse tipo", () => {
    const r = ausenciasVisiveis(pessoas, ["ferias", "falta", "atestado", "outras"]);
    expect(r.map((a) => a.nome)).toEqual(["Thais", "Cris"]);
  });

  it("quem trabalha nunca aparece como ausente", () => {
    expect(ausenciasVisiveis(pessoas, TIPOS_AUSENCIA).some((a) => a.nome === "Nord")).toBe(false);
  });
});

describe("atraso não é ausência", () => {
  it("atrasado e saída antecipada não entram no calendário de ausências", () => {
    const r = ausenciasVisiveis(
      [
        { colaborador_id: "5", nome: "Herick", categoria: "atrasado" as const },
        { colaborador_id: "6", nome: "Ana", categoria: "saida_antecipada" as const },
      ],
      TIPOS_AUSENCIA,
    );
    expect(r).toEqual([]);
  });
});

import { periodoDoHorario, pessoaNoFiltro } from "@/lib/dp/calendario-rotina";

describe("filtro de turno e setor", () => {
  it("entrada a partir das 15h é noite", () => {
    expect(periodoDoHorario("08:30")).toBe("dia");
    expect(periodoDoHorario("17:00")).toBe("noite");
  });
  it("filtro noite esconde quem é do dia", () => {
    expect(pessoaNoFiltro({ entrada: "08:30", setor_id: "s" }, { periodo: "noite", setores: [] })).toBe(false);
  });
  it("sem horário (férias) aparece em qualquer turno", () => {
    expect(pessoaNoFiltro({ entrada: null, setor_id: "s" }, { periodo: "noite", setores: [] })).toBe(true);
  });
  it("filtro de setor esconde outros setores", () => {
    expect(pessoaNoFiltro({ entrada: "17:00", setor_id: "a" }, { periodo: "todos", setores: ["b"] })).toBe(false);
  });
});

import { periodoHabitual as _ph, pessoaNoFiltro as _pf } from "@/lib/dp/calendario-rotina";
describe("folga no filtro de turno", () => {
  it("folga de quem trabalha à noite some no filtro Dia", () => {
    const hab = _ph([{ pessoas: [{ colaborador_id: "a", entrada: "17:00" }] }]);
    expect(_pf({ colaborador_id: "a", entrada: null, setor_id: null }, { periodo: "dia", setores: [] }, hab)).toBe(false);
    expect(_pf({ colaborador_id: "a", entrada: null, setor_id: null }, { periodo: "noite", setores: [] }, hab)).toBe(true);
  });
});
