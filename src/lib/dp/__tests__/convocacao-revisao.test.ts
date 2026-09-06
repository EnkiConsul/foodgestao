import { describe, it, expect } from "vitest";
import { resolverHorarioDestinatario, simularDia } from "@/lib/dp/convocacao-revisao";

describe("resolverHorarioDestinatario", () => {
  const geral = { entrada: "18:00", saida: "23:00", intervalo_minutos: 0, termina_no_dia_seguinte: false };
  const jornada = { entrada: "17:00", saida: "00:30", intervalo_minutos: 30, termina_no_dia_seguinte: true };

  it("dá precedência ao ajuste individual", () => {
    const r = resolverHorarioDestinatario({
      override: { entrada: "19:00", saida: "23:30", intervalo_minutos: 15 },
      geral,
      jornada,
    });
    expect(r?.origem).toBe("individual");
    expect(r?.entrada).toBe("19:00");
    expect(r?.carga_prevista_horas).toBe(4.25);
  });

  it("cai no horário padrão quando não há ajuste individual", () => {
    const r = resolverHorarioDestinatario({ override: { entrada: "", saida: "" }, geral, jornada });
    expect(r?.origem).toBe("geral");
    expect(r?.carga_prevista_horas).toBe(5);
  });

  it("usa a jornada cadastrada quando não há padrão nem ajuste", () => {
    const r = resolverHorarioDestinatario({ jornada });
    expect(r?.origem).toBe("jornada");
    expect(r?.termina_no_dia_seguinte).toBe(true);
    expect(r?.carga_prevista_horas).toBe(7);
  });

  it("devolve null sem nenhuma fonte válida", () => {
    expect(resolverHorarioDestinatario({ jornada: null })).toBeNull();
    expect(resolverHorarioDestinatario({ geral: { entrada: "18:00", saida: "18:00" } })).toBeNull();
  });
});

describe("simularDia", () => {
  const p = (id: string) => ({ colaborador_id: id });

  it("soma os convocados ao quadro previsto", () => {
    const r = simularDia([p("a"), p("b")], [p("c")]);
    expect(r).toMatchObject({ antes: 2, depois: 3, adicionados: 1 });
    expect(r.pessoas).toHaveLength(3);
  });

  it("não repete quem já está previsto no dia", () => {
    const r = simularDia([p("a")], [p("a"), p("b")]);
    expect(r).toMatchObject({ antes: 1, depois: 2, adicionados: 1 });
  });
});
