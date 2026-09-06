import { describe, expect, it } from "vitest";
import { resolverSetorPrevisto, origemSetorSufixo, dimensaoSetorAtiva } from "@/lib/dp/setor-previsto";
import { setorEfetivoDoDia, type ColaboradorPanorama } from "@/lib/dp/operacao-panorama";
import { gerarEscalaMes, type EscalaItem } from "@/lib/dp/escala-mes";

const NOMES = { salao: "Salão", cozinha: "Cozinha", delivery: "Delivery" };

const colab = (setorHabitual: string | null, setorDoDia: string | null): ColaboradorPanorama => ({
  id: "c1",
  nome: "Sara",
  intermitente: false,
  setor_id: setorHabitual,
  config: {
    turno_padrao_id: "t1",
    folga_variavel: false,
    folga_fixa_dow: null,
    dias: [{ dow: 4, trabalha: true, turno_id: null, setor_id: setorDoDia }],
  },
});

describe("setor efetivo por data", () => {
  it("escala publicada do dia vence a configuração semanal e o cadastro", () => {
    const r = setorEfetivoDoDia({
      colaborador: colab("salao", "cozinha"),
      item: { colaborador_id: "c1", data: "2026-09-17", tipo: "trabalho", turno_id: null, entrada: null, saida: null, setor_id: "delivery" },
      dow: 4,
    });
    expect(r).toEqual({ setor_id: "delivery", origem: "escala" });
  });

  it("sem exceção da escala, vale o setor do dia da semana", () => {
    expect(setorEfetivoDoDia({ colaborador: colab("salao", "cozinha"), dow: 4 })).toEqual({
      setor_id: "cozinha",
      origem: "config_dia",
    });
  });

  it("sem setor no dia, vale o setor habitual do cadastro", () => {
    expect(setorEfetivoDoDia({ colaborador: colab("salao", null), dow: 4 })).toEqual({
      setor_id: "salao",
      origem: "cadastro",
    });
  });

  it("sem nada definido, o resultado é nenhum", () => {
    expect(setorEfetivoDoDia({ colaborador: colab(null, null), dow: 4 })).toEqual({
      setor_id: null,
      origem: "nenhum",
    });
  });

  it("rascunho de escala não influencia o setor efetivo", () => {
    const r = resolverSetorPrevisto({
      escalaSetorId: "delivery",
      escalaPublicada: false,
      configDiaSetorId: "cozinha",
      cadastroSetorId: "salao",
      nomes: NOMES,
    });
    expect(r.origem).toBe("config_dia");
    expect(r.setor_nome).toBe("Cozinha");
  });

  it("sufixo de leitura só aparece nas origens que não são o cadastro", () => {
    expect(origemSetorSufixo("config_dia")).toBe("rotina do dia");
    expect(origemSetorSufixo("escala")).toBe("alterado hoje");
    expect(origemSetorSufixo("cadastro")).toBeNull();
    expect(origemSetorSufixo("nenhum")).toBeNull();
  });

  it("a dimensão setor só liga com pelo menos um setor ativo", () => {
    expect(dimensaoSetorAtiva([])).toBe(false);
    expect(dimensaoSetorAtiva([{ ativo: false }])).toBe(false);
    expect(dimensaoSetorAtiva([{ ativo: false }, { ativo: true }])).toBe(true);
  });
});

describe("regeneração da escala preserva o ajuste manual de setor", () => {
  it("mantém o setor do item manual depois de gerar novamente", () => {
    const manual: EscalaItem = {
      colaborador_id: "c1",
      data: "2026-09-17",
      tipo: "trabalho",
      turno_id: "t1",
      entrada: "17:00",
      saida: "23:00",
      intervalo_minutos: 0,
      carga_prevista_horas: 6,
      origem: "manual",
      observacao: null,
      setor_id: "cozinha",
      setor_motivo: "cobertura",
    };

    const itens = gerarEscalaMes({
      competencia: "2026-09",
      colaboradores: [
        {
          id: "c1",
          nome: "Sara",
          intermitente: false,
          config: {
            turno_padrao_id: "t1",
            folga_variavel: false,
            folga_fixa_dow: 0,
            dias: [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dow, trabalha: dow !== 0, turno_id: null })),
          },
        },
      ],
      turnos: [{ id: "t1", nome: "Noite", entrada: "17:00", saida: "23:00", intervalo_minutos: 0 }],
      folgas: [],
      ausencias: [],
      manuais: [manual],
    });

    const dia = itens.find((i) => i.colaborador_id === "c1" && i.data === "2026-09-17");
    expect(dia?.setor_id).toBe("cozinha");
  });
});
