import { describe, expect, it } from "vitest";
import {
  colaboradoresElegiveisNoDia,
  colaboradorElegivelNoDia,
  conflitoDeHorario,
  descreverPrevisao,
  foiDesligado,
  previsaoNoDia,
  sugerirHorarioLivre,
  type PrevisaoNoDia,
} from "../operacao-extra";
import type { ResultadoDia } from "../operacao-panorama";

const DIA = "2026-09-10";

const pessoa = (over: Record<string, unknown>) => ({
  id: "c1",
  nome: "Hanna",
  ativo: true,
  data_admissao: "2026-01-10",
  data_desligamento: null,
  ...over,
});

describe("colaboradorElegivelNoDia", () => {
  it("aceita ativo dentro do vínculo", () => {
    expect(colaboradorElegivelNoDia(pessoa({}), DIA)).toBe(true);
  });

  it("rejeita desligado antes do dia lançado", () => {
    expect(
      colaboradorElegivelNoDia(
        pessoa({ ativo: false, data_desligamento: "2026-08-01" }),
        DIA,
      ),
    ).toBe(false);
  });

  it("aceita desligado em dia até a data de saída (correção de registro passado)", () => {
    const c = pessoa({ ativo: false, data_desligamento: "2026-08-01" });
    expect(colaboradorElegivelNoDia(c, "2026-08-01")).toBe(true);
    expect(colaboradorElegivelNoDia(c, "2026-07-15")).toBe(true);
  });

  it("rejeita inativo sem data de saída", () => {
    expect(colaboradorElegivelNoDia(pessoa({ ativo: false }), DIA)).toBe(false);
  });

  it("rejeita dia antes da admissão", () => {
    expect(
      colaboradorElegivelNoDia(pessoa({ data_admissao: "2026-09-29" }), DIA),
    ).toBe(false);
  });

  it("marca desligado para o selo da lista", () => {
    expect(foiDesligado(pessoa({ data_desligamento: "2026-09-10" }), DIA)).toBe(true);
    expect(foiDesligado(pessoa({}), DIA)).toBe(false);
  });

  it("filtra a lista mantendo a ordem", () => {
    const lista = [
      pessoa({ id: "a", nome: "Ativo" }),
      pessoa({ id: "b", nome: "Saiu", ativo: false, data_desligamento: "2026-08-01" }),
      pessoa({ id: "c", nome: "Novo", data_admissao: "2026-09-29" }),
    ];
    expect(colaboradoresElegiveisNoDia(lista, DIA).map((c) => c.id)).toEqual(["a"]);
  });
});

const prev = (over: Partial<PrevisaoNoDia>): PrevisaoNoDia => ({
  entrada: "10:00",
  saida: "18:00",
  termina_no_dia_seguinte: false,
  origem: "escala",
  origemLabel: "escala publicada",
  ...over,
});

describe("conflitoDeHorario", () => {
  it("detecta sobreposição parcial", () => {
    expect(conflitoDeHorario([prev({})], "17:00", "23:00", false)).not.toBeNull();
  });

  it("aceita horário logo após o turno previsto", () => {
    expect(conflitoDeHorario([prev({})], "18:00", "23:00", false)).toBeNull();
  });

  it("detecta conflito com turno que vira o dia", () => {
    const p = prev({ entrada: "22:00", saida: "06:00", termina_no_dia_seguinte: true });
    expect(conflitoDeHorario([p], "23:00", "23:59", false)).not.toBeNull();
  });

  it("ignora horário incompleto", () => {
    expect(conflitoDeHorario([prev({})], "", "23:00", false)).toBeNull();
  });
});

describe("sugerirHorarioLivre", () => {
  it("sugere começar no fim do turno conflitante mantendo a duração", () => {
    const s = sugerirHorarioLivre([prev({})], "16:00", "22:00", false);
    expect(s).toEqual({ entrada: "18:00", saida: "00:00", termina_no_dia_seguinte: true });
  });

  it("sem horário digitado, sugere 6h a partir do fim do turno", () => {
    const s = sugerirHorarioLivre([prev({})], "", "", false);
    expect(s).toEqual({ entrada: "18:00", saida: "00:00", termina_no_dia_seguinte: true });
  });

  it("retorna null quando não há conflito", () => {
    expect(sugerirHorarioLivre([prev({})], "19:00", "23:00", false)).toBeNull();
  });
});

describe("previsaoNoDia", () => {
  const dia = {
    data: DIA,
    pessoas: [
      {
        colaborador_id: "c1",
        entrada: "10:00",
        saida: "18:00",
        termina_no_dia_seguinte: false,
        origem: "escala",
        categoria: "fixo",
      },
      {
        colaborador_id: "c1",
        entrada: "20:00",
        saida: "23:00",
        termina_no_dia_seguinte: false,
        origem: "registro_manual",
        categoria: "fixo",
        avulso_id: "av-1",
      },
      {
        colaborador_id: "c2",
        entrada: "08:00",
        saida: "14:00",
        termina_no_dia_seguinte: false,
        origem: "jornada",
        categoria: "fixo",
      },
    ],
  } as unknown as ResultadoDia;

  it("traz só as previsões da pessoa, com rótulo da origem", () => {
    const ps = previsaoNoDia(dia, "c1");
    expect(ps).toHaveLength(2);
    expect(ps[0].origemLabel).toBe("escala publicada");
  });

  it("ignora o próprio registro ao editar", () => {
    const ps = previsaoNoDia(dia, "c1", "av-1");
    expect(ps).toHaveLength(1);
  });
});

describe("descreverPrevisao", () => {
  it("descreve escala", () => {
    expect(descreverPrevisao("Hanna", prev({}))).toBe(
      "Hanna já está prevista das 10:00 às 18:00 — escala publicada.",
    );
  });

  it("descreve convocação pendente", () => {
    expect(descreverPrevisao("Hanna", prev({ pendente: true }))).toContain(
      "convocação aguardando resposta",
    );
  });
});
