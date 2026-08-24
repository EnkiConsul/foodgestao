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
  avaliarGrupo,
  dataDentroDoPeriodo,
  jornadaIndividualNaData,
  limitesDaCompetencia,
  minimoDoCargoNaData,
  ocorrenciasIncompativeis,
  periodoValido,
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
    termina_no_dia_seguinte: false,

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

describe("competência, período e cobertura", () => {
  it("período precisa caber dentro da competência", () => {
    expect(limitesDaCompetencia("2026-02")).toEqual({ inicio: "2026-02-01", fim: "2026-02-28" });
    expect(periodoValido("2026-02", { inicio: "2026-02-05", fim: "2026-02-20" })).toBe(true);
    expect(periodoValido("2026-02", { inicio: "2026-01-28", fim: "2026-02-20" })).toBe(false);
    expect(periodoValido("2026-02", { inicio: "2026-02-20", fim: "2026-02-05" })).toBe(false);
  });

  it("troca de competência isola as datas incompatíveis", () => {
    const ocorrencias = [{ data: "2026-02-10" }, { data: "2026-03-02" }, { data: null }];
    const fora = ocorrenciasIncompativeis(ocorrencias, "2026-02", {
      inicio: "2026-02-01",
      fim: "2026-02-28",
    });
    expect(fora).toHaveLength(2);
  });

  it("data fora do período escolhido não é selecionável", () => {
    const p = { inicio: "2026-02-05", fim: "2026-02-10" };
    expect(dataDentroDoPeriodo("2026-02-06", "2026-02", p)).toBe(true);
    expect(dataDentroDoPeriodo("2026-02-11", "2026-02", p)).toBe(false);
    expect(dataDentroDoPeriodo("2026-03-06", "2026-02", p)).toBe(false);
  });

  it("mínimo do cargo vem só de dp_cobertura_minima e nunca é inventado", () => {
    const regras = [
      { unidade_id: "u1", cargo_id: "c1", dia_semana: null, minimo: 2, ativo: true, vigencia_inicio: null, vigencia_fim: null },
      { unidade_id: "u1", cargo_id: "c1", dia_semana: 6, minimo: 4, ativo: true, vigencia_inicio: null, vigencia_fim: null },
      { unidade_id: "u1", cargo_id: "c1", dia_semana: null, minimo: 9, ativo: false, vigencia_inicio: null, vigencia_fim: null },
    ];
    // 2026-02-07 é sábado (dow 6): a regra mais exigente prevalece.
    expect(minimoDoCargoNaData({ regras, data: "2026-02-07", unidadeId: "u1", cargoId: "c1" })).toBe(4);
    expect(minimoDoCargoNaData({ regras, data: "2026-02-05", unidadeId: "u1", cargoId: "c1" })).toBe(2);
    expect(minimoDoCargoNaData({ regras, data: "2026-02-05", unidadeId: "u1", cargoId: "c2" })).toBeNull();
  });

  it("pendente nunca conta como confirmado", () => {
    expect(coberturaDoDia({ minimo: 3, confirmados: 1, aguardando: 5 })).toEqual({
      minimo: 3,
      confirmados: 1,
      aguardando: 5,
      faltam: 2,
    });
    expect(coberturaDoDia({ minimo: null, confirmados: 1, aguardando: 2 }).faltam).toBeNull();
  });
});

describe("virada de dia separada", () => {
  const oc = {
    id: "o1",
    cargo_id: "c1",
    data: "2026-02-10",
    necessidade_entrada: "22:00",
    necessidade_saida: "02:00",
    necessidade_termina_no_dia_seguinte: true,
    horario_modo: "horario_unico" as const,
    entrada: "22:00",
    saida: "23:30",
    intervalo_minutos: 0,
    termina_no_dia_seguinte: false,
    vagas: 1,
    colaborador_alvo_id: null,
  };

  it("necessidade pode virar o dia sem que o horário ofertado vire", () => {
    const p = payloadHorario(oc);
    expect(p.termina_no_dia_seguinte).toBe(false);
    expect(p.carga_prevista_horas).toBeCloseTo(1.5, 2);
    expect(ocorrenciaPersistivel(oc, "aberta")).toBe(true);
  });
});

describe("jornada individual e Option A no grupo", () => {
  const configDias = [
    { colaborador_id: "p1", dow: 2, trabalha: true, entrada: "18:00:00", saida: "23:00:00", intervalo_minutos: 0 },
    { colaborador_id: "p2", dow: 2, trabalha: false, entrada: null, saida: null, intervalo_minutos: null },
  ];

  it("resolve jornada real do dia e devolve null sem cadastro", () => {
    // 2026-02-10 é terça (dow 2).
    expect(jornadaIndividualNaData({ configDias, colaboradorId: "p1", data: "2026-02-10" })).toMatchObject({
      entrada: "18:00",
      saida: "23:00",
    });
    expect(jornadaIndividualNaData({ configDias, colaboradorId: "p2", data: "2026-02-10" })).toBeNull();
    expect(jornadaIndividualNaData({ configDias, colaboradorId: "p1", data: "2026-02-11" })).toBeNull();
  });

  it("Option A vale para todas as ocorrências do grupo, inclusive multi-cargo", () => {
    const colaboradores = [
      { id: "p1", nome: "Ana", regime: "intermitente", ativo: true, cargo_id: "c1", unidade_id: "u1", forma_pagamento: "horista", valor_hora: 20, valor_diaria: null },
      { id: "p2", nome: "Bia", regime: "freelancer", ativo: true, cargo_id: "c2", unidade_id: "u1", forma_pagamento: "diarista", valor_hora: null, valor_diaria: 150 },
    ];
    const comum = {
      data: "2026-02-10",
      necessidade_entrada: "18:00",
      necessidade_saida: "23:00",
      necessidade_termina_no_dia_seguinte: false,
      horario_modo: "horario_unico" as const,
      vagas: 1,
    };
    const res = avaliarGrupo({
      ocorrencias: [
        { ...comum, id: "oA", cargo_id: "c1" },
        { ...comum, id: "oB", cargo_id: "c1" },
        { ...comum, id: "oC", cargo_id: "c2" },
      ],
      colaboradores,
      unidadeId: "u1",
    });

    const porId = new Map(res.map((r) => [r.ocorrencia_id, r]));
    expect(porId.get("oA")!.reservados).toEqual(["p1"]);
    // Mesma pessoa não é reservada duas vezes no mesmo dia.
    expect(porId.get("oB")!.reservados).toEqual([]);
    expect(porId.get("oB")!.reservados_em_outra.map((c) => c.nome)).toEqual(["Ana"]);
    // Outro cargo é avaliado de forma independente.
    expect(porId.get("oC")!.reservados).toEqual(["p2"]);
  });

  it("indisponibilidade e alocação existente removem a pessoa da prévia", () => {
    const res = avaliarGrupo({
      ocorrencias: [
        {
          id: "o1",
          data: "2026-02-10",
          cargo_id: "c1",
          necessidade_entrada: "18:00",
          necessidade_saida: "23:00",
          necessidade_termina_no_dia_seguinte: false,
          horario_modo: "horario_unico",
          vagas: 2,
        },
      ],
      colaboradores: [
        { id: "p1", nome: "Ana", regime: "intermitente", ativo: true, cargo_id: "c1", unidade_id: "u1", forma_pagamento: "horista", valor_hora: 20, valor_diaria: null },
        { id: "p2", nome: "Bia", regime: "intermitente", ativo: true, cargo_id: "c1", unidade_id: "u1", forma_pagamento: "horista", valor_hora: 20, valor_diaria: null },
      ],
      unidadeId: "u1",
      indisponiveisPorData: new Map([["2026-02-10", new Set(["p1"])]]),
      alocadosPorData: new Map([["2026-02-10", new Set(["p2"])]]),
    });
    expect(res[0].reservados).toEqual([]);
    expect(res[0].candidatos.every((c) => !c.elegivel)).toBe(true);
  });
});
