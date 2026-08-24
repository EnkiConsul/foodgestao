import { describe, expect, it } from "vitest";
import {
  adicionarDiasUteis,
  antecedenciaDias,
  cargaPrevistaHoras,
  compatibilidadeIntegral,
  coberturaDoDia,
  diagnosticarRemuneracao,
  grupoPersistivel,
  ocorrenciaPersistivel,
  ordenarOcorrencias,
  payloadHorario,
  prazosDaOferta,
  reservarPorOptionA,
  valorPrevisto,
  type RascunhoOcorrencia,
} from "@/lib/dp/convocacoes-planejamento";

describe("carga e compatibilidade", () => {
  it("desconta intervalo e atravessa a meia-noite", () => {
    expect(cargaPrevistaHoras({ entrada: "18:00", saida: "23:00", intervalo_minutos: 60 })).toBe(4);
    expect(cargaPrevistaHoras({ entrada: "22:00", saida: "02:00", intervalo_minutos: 0 })).toBe(4);
  });

  it("só aceita cobertura integral", () => {
    const need = { entrada: "18:00", saida: "23:00" };
    expect(compatibilidadeIntegral(need, { entrada: "17:00", saida: "23:30" })).toBe("integral");
    expect(compatibilidadeIntegral(need, { entrada: "19:00", saida: "23:00" })).toBe("incompativel");
    expect(compatibilidadeIntegral(need, null)).toBe("incompativel");
  });
});

describe("prazos", () => {
  it("pula fim de semana preservando a hora", () => {
    const sexta = new Date("2026-03-06T18:00:00Z"); // sexta
    const r = adicionarDiasUteis(sexta, 1);
    expect(r.getDay()).toBe(1);
  });

  it("prazo de resposta não é encurtado pelo início do turno", () => {
    const p = prazosDaOferta({
      disponibilizadaEm: new Date("2026-03-04T10:00:00Z"),
      prazoDiasUteis: 2,
      inicioPrevisto: new Date("2026-03-05T18:00:00Z"),
    });
    expect(p.encerra_primeiro).toBe("inicio_ocorrencia");
    expect(p.prazo_resposta.getTime()).toBeGreaterThan(p.encerramento_operacional.getTime());
  });

  it("antecedência conta dias corridos", () => {
    expect(antecedenciaDias("2026-03-10", new Date("2026-03-07T23:00:00Z"))).toBe(3);
  });
});

describe("Option A", () => {
  it("reserva a primeira ocorrência elegível do dia e registra conflito", () => {
    const ocs = [
      { id: "b", data: "2026-03-10", necessidade_entrada: "18:00", necessidade_saida: "23:00", cargo_id: "c1" },
      { id: "a", data: "2026-03-10", necessidade_entrada: "12:00", necessidade_saida: "17:00", cargo_id: "c1" },
    ];
    expect(ordenarOcorrencias(ocs).map((o) => o.id)).toEqual(["a", "b"]);
    const { reservas, conflitos } = reservarPorOptionA(
      ocs,
      new Map([
        ["a", ["p1"]],
        ["b", ["p1", "p2"]],
      ]),
    );
    expect(reservas.get("a")).toEqual(["p1"]);
    expect(reservas.get("b")).toEqual(["p2"]);
    expect(conflitos).toEqual([{ ocorrencia_id: "b", colaborador_id: "p1" }]);
  });
});

describe("remuneração", () => {
  it("diarista sem valor da diária não é elegível", () => {
    const d = diagnosticarRemuneracao({
      regime: "freelancer",
      forma_pagamento: "diarista",
      valor_hora: 30,
      valor_diaria: null,
    });
    expect(d.elegivel).toBe(false);
    expect(d.unidade).toBe("diaria");
  });

  it("não converte mensalista em hora ou diária", () => {
    const d = diagnosticarRemuneracao({
      regime: "freelancer",
      forma_pagamento: "mensalista",
      valor_hora: null,
      valor_diaria: null,
    });
    expect(d.elegivel).toBe(false);
    expect(d.valor_unitario).toBeNull();
  });

  it("diária não é multiplicada por horas", () => {
    const d = diagnosticarRemuneracao({
      regime: "freelancer",
      forma_pagamento: "diarista",
      valor_hora: null,
      valor_diaria: 150,
    });
    expect(valorPrevisto(d, 8)).toBe(150);
  });

  it("horista multiplica pelas horas previstas", () => {
    const d = diagnosticarRemuneracao({
      regime: "intermitente",
      forma_pagamento: "horista",
      valor_hora: 20,
      valor_diaria: null,
    });
    expect(valorPrevisto(d, 4)).toBe(80);
  });
});

describe("cobertura", () => {
  it("pendente nunca conta como confirmado", () => {
    expect(coberturaDoDia({ minimo: 3, confirmados: 1, aguardando: 5 }).faltam).toBe(2);
    expect(coberturaDoDia({ minimo: null, confirmados: 0, aguardando: 0 }).faltam).toBeNull();
  });
});

describe("persistência do rascunho", () => {
  const base: RascunhoOcorrencia = {
    id: "o1",
    cargo_id: "c1",
    data: "2026-03-10",
    necessidade_entrada: "18:00",
    necessidade_saida: "23:00",
    necessidade_termina_no_dia_seguinte: false,
    horario_modo: "horario_unico",
    entrada: "18:00",
    saida: "23:00",
    intervalo_minutos: 0,
    vagas: 1,
    colaborador_alvo_id: null,
  };

  it("grupo exige unidade, competência válida e modalidade", () => {
    expect(grupoPersistivel({ unidade_id: "u", competencia: "2026-03", modalidade: "aberta" })).toBe(true);
    expect(grupoPersistivel({ unidade_id: "u", competencia: "2026-13", modalidade: "aberta" })).toBe(false);
    expect(grupoPersistivel({ unidade_id: "u", competencia: "2026-03", modalidade: null })).toBe(false);
  });

  it("individual exige alvo e uma vaga; aberta recusa alvo", () => {
    expect(ocorrenciaPersistivel(base, "aberta")).toBe(true);
    expect(ocorrenciaPersistivel(base, "individual")).toBe(false);
    expect(ocorrenciaPersistivel({ ...base, colaborador_alvo_id: "p1" }, "individual")).toBe(true);
    expect(ocorrenciaPersistivel({ ...base, colaborador_alvo_id: "p1" }, "aberta")).toBe(false);
  });

  it("jornada individual não inventa horário", () => {
    const o = { ...base, horario_modo: "jornada_individual" as const };
    expect(payloadHorario(o)).toMatchObject({
      entrada: null,
      saida: null,
      intervalo_minutos: null,
      carga_prevista_horas: null,
    });
    expect(ocorrenciaPersistivel(o, "aberta")).toBe(true);
  });

  it("horário único incoerente não é gravável", () => {
    expect(ocorrenciaPersistivel({ ...base, intervalo_minutos: 600 }, "aberta")).toBe(false);
  });
});
