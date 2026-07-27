import { describe, it, expect } from "vitest";
import { montarOperacaoDia, alertasDoDia } from "@/lib/dp/operacao-dia";
import type { EscalaItem } from "@/lib/dp/escala-mes";

const item = (over: Partial<EscalaItem>): EscalaItem => ({
  colaborador_id: "c1",
  data: "2026-07-27",
  tipo: "trabalho",
  turno_id: "t1",
  entrada: "08:00",
  saida: "16:00",
  intervalo_minutos: 60,
  termina_no_dia_seguinte: false,
  carga_prevista_horas: 7,
  origem: "gerado",
  ...over,
});

const turnos = [
  { id: "t1", nome: "Abertura", entrada: "08:00", saida: "16:00" },
  { id: "t2", nome: "Fechamento", entrada: "16:00", saida: "23:00" },
];

const colaboradores = [
  { id: "c1", nome: "Ana" },
  { id: "c2", nome: "Bruno" },
  { id: "c3", nome: "Carla" },
];

describe("montarOperacaoDia", () => {
  it("agrupa por turno e ordena pelo horário de entrada", () => {
    const dia = montarOperacaoDia({
      data: "2026-07-27",
      itens: [
        item({ colaborador_id: "c2", turno_id: "t2", entrada: "16:00", saida: "23:00", carga_prevista_horas: 6 }),
        item({ colaborador_id: "c1" }),
      ],
      colaboradores,
      turnos,
    });
    expect(dia.blocos.map((b) => b.nome)).toEqual(["Abertura", "Fechamento"]);
    expect(dia.resumo.escalados).toBe(2);
    expect(dia.resumo.cargaPrevista).toBe(13);
  });

  it("separa ausentes e quem não tem registro no dia", () => {
    const dia = montarOperacaoDia({
      data: "2026-07-27",
      itens: [item({}), item({ colaborador_id: "c2", tipo: "folga", turno_id: null, entrada: null, saida: null, carga_prevista_horas: 0 })],
      colaboradores,
      turnos,
    });
    expect(dia.ausentes.map((a) => a.nome)).toEqual(["Bruno"]);
    expect(dia.semEscala.map((s) => s.nome)).toEqual(["Carla"]);
  });

  it("calcula descoberto pela cobertura mínima", () => {
    const dia = montarOperacaoDia({
      data: "2026-07-27",
      itens: [item({})],
      colaboradores,
      turnos,
      coberturaMinima: { t1: 2, t2: 1 },
    });
    const abertura = dia.blocos.find((b) => b.turno_id === "t1")!;
    const fechamento = dia.blocos.find((b) => b.turno_id === "t2")!;
    expect(abertura.descoberto).toBe(1);
    expect(fechamento.descoberto).toBe(1);
    expect(dia.resumo.descobertoTotal).toBe(2);
  });

  it("marca ajustes manuais e cria bloco para quem está sem turno", () => {
    const dia = montarOperacaoDia({
      data: "2026-07-27",
      itens: [item({ origem: "manual", turno_id: null })],
      colaboradores,
      turnos,
    });
    expect(dia.resumo.ajustes).toBe(1);
    const bloco = dia.blocos.find((b) => b.turno_id === null)!;
    expect(bloco.nome).toBe("Sem turno definido");
    expect(alertasDoDia(dia).some((a) => a.nivel === "erro")).toBe(true);
  });

  it("avisa quando ninguém está escalado", () => {
    const dia = montarOperacaoDia({ data: "2026-07-27", itens: [], colaboradores: [], turnos });
    expect(alertasDoDia(dia).some((a) => a.mensagem.includes("Nenhuma pessoa escalada"))).toBe(true);
  });
});
