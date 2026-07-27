import { describe, it, expect } from "vitest";
import {
  resolverHorarioPrevisto,
  resolverPeriodo,
  horasPrevistas,
  proximoTurnoPrevisto,
  textoPrevisto,
  fonteConfirmada,
  type ColaboradorPrevisto,
} from "@/lib/dp/horario-previsto";
import type { EscalaItem } from "@/lib/dp/escala-mes";
import type { TurnoResolvido } from "@/lib/dp/config-trabalho";

const turnos: TurnoResolvido[] = [
  { id: "t1", nome: "Manhã", entrada: "08:00", saida: "17:00", intervalo_minutos: 60 },
];

const clt: ColaboradorPrevisto = {
  id: "c1",
  regime: "clt",
  config: {
    turno_padrao_id: "t1",
    folga_variavel: false,
    folga_fixa_dow: 0,
    dias: [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dow, trabalha: dow !== 0, turno_id: null })),
  },
};

const intermitente: ColaboradorPrevisto = { id: "c2", regime: "intermitente", config: null };

const item = (over: Partial<EscalaItem> = {}): EscalaItem => ({
  colaborador_id: "c1",
  data: "2026-07-27",
  tipo: "trabalho",
  turno_id: "t1",
  entrada: "10:00",
  saida: "18:00",
  intervalo_minutos: 60,
  termina_no_dia_seguinte: false,
  carga_prevista_horas: 7,
  origem: "manual",
  ...over,
});

describe("horario-previsto", () => {
  it("usa o padrão habitual quando não há escala", () => {
    const p = resolverHorarioPrevisto({ colaborador: clt, data: "2026-07-27", turnos });
    expect(p.fonte).toBe("habitual");
    expect(p.entrada).toBe("08:00");
    expect(p.carga_prevista_horas).toBe(8);
    expect(p.confirmado).toBe(false);
  });

  it("marca folga habitual no dia não trabalhado", () => {
    const p = resolverHorarioPrevisto({ colaborador: clt, data: "2026-07-26", turnos });
    expect(p.trabalha).toBe(false);
    expect(p.tipo).toBe("folga");
    expect(textoPrevisto(p)).toBe("Folga");
  });

  it("a escala publicada tem precedência sobre o habitual", () => {
    const p = resolverHorarioPrevisto({
      colaborador: clt,
      data: "2026-07-27",
      item: item(),
      escalaPublicada: true,
      turnos,
    });
    expect(p.fonte).toBe("escala_publicada");
    expect(p.entrada).toBe("10:00");
    expect(p.confirmado).toBe(true);
  });

  it("escala em rascunho não é compromisso confirmado", () => {
    const p = resolverHorarioPrevisto({ colaborador: clt, data: "2026-07-27", item: item(), turnos });
    expect(p.fonte).toBe("escala_rascunho");
    expect(p.confirmado).toBe(false);
  });

  it("convocação aceita vence a escala publicada", () => {
    const p = resolverHorarioPrevisto({
      colaborador: intermitente,
      data: "2026-07-27",
      item: item({ colaborador_id: "c2" }),
      escalaPublicada: true,
      convocacao: {
        colaborador_id: "c2",
        data: "2026-07-27",
        status: "aceita",
        entrada: "18:00",
        saida: "23:00",
        intervalo_minutos: 0,
      },
    });
    expect(p.fonte).toBe("convocacao");
    expect(p.carga_prevista_horas).toBe(5);
    expect(textoPrevisto(p)).toBe("18:00 → 23:00");
  });

  it("convocação pendente não gera previsão para intermitente", () => {
    const p = resolverHorarioPrevisto({
      colaborador: intermitente,
      data: "2026-07-27",
      convocacao: {
        colaborador_id: "c2",
        data: "2026-07-27",
        status: "pendente",
        entrada: "18:00",
        saida: "23:00",
        intervalo_minutos: 0,
      },
    });
    expect(p.fonte).toBe("sem_previsao");
    expect(p.trabalha).toBe(false);
  });

  it("resolve o período e soma as horas previstas", () => {
    const datas = ["2026-07-26", "2026-07-27", "2026-07-28"];
    const lista = resolverPeriodo({ datas, colaboradores: [clt], turnos });
    expect(lista).toHaveLength(3);
    expect(horasPrevistas(lista)).toBe(16);
    const proximo = proximoTurnoPrevisto(lista, "2026-07-26");
    expect(proximo?.data).toBe("2026-07-27");
  });

  it("classifica quais fontes são compromissos firmes", () => {
    expect(fonteConfirmada("convocacao")).toBe(true);
    expect(fonteConfirmada("escala_publicada")).toBe(true);
    expect(fonteConfirmada("habitual")).toBe(false);
  });
});
