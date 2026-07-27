import { describe, it, expect } from "vitest";
import {
  diasDaCompetencia,
  gerarEscalaMes,
  resumoPorColaborador,
  coberturaPorDia,
  validarEscalaMes,
  escalaTemErro,
  rotuloCelula,
  semanaDoMes,
  type ColaboradorEscala,
} from "@/lib/dp/escala-mes";
import type { TurnoResolvido } from "@/lib/dp/config-trabalho";
import { diasPadrao, normalizarDias } from "@/lib/dp/config-trabalho";

const jantar: TurnoResolvido = {
  id: "t1",
  nome: "Jantar",
  entrada: "17:00",
  saida: "23:00",
  intervalo_minutos: 60,
};

function colaborador(over?: Partial<ColaboradorEscala>): ColaboradorEscala {
  return {
    id: "c1",
    nome: "Ana",
    regime: "clt",
    config: {
      turno_padrao_id: "t1",
      folga_variavel: false,
      folga_fixa_dow: 0,
      dias: normalizarDias(diasPadrao(), 0),
    },
    ...over,
  };
}

describe("escala-mes", () => {
  it("lista todos os dias da competência", () => {
    expect(diasDaCompetencia("2026-02")).toHaveLength(28);
    expect(diasDaCompetencia("2026-07")[0]).toBe("2026-07-01");
  });

  it("gera um item por dia do mês, com folga no dia fixo", () => {
    const itens = gerarEscalaMes({ competencia: "2026-07", colaboradores: [colaborador()], turnos: [jantar] });
    expect(itens).toHaveLength(31);
    const domingo = itens.find((i) => i.data === "2026-07-05");
    expect(domingo?.tipo).toBe("folga");
    const segunda = itens.find((i) => i.data === "2026-07-06");
    expect(segunda?.tipo).toBe("trabalho");
    expect(segunda?.carga_prevista_horas).toBe(5);
  });

  it("congela o horário do turno no item (snapshot)", () => {
    const [item] = gerarEscalaMes({
      competencia: "2026-07",
      colaboradores: [colaborador()],
      turnos: [jantar],
    }).filter((i) => i.tipo === "trabalho");
    expect(item.entrada).toBe("17:00");
    expect(item.saida).toBe("23:00");
    expect(item.termina_no_dia_seguinte).toBe(false);
  });

  it("marca férias acima da configuração", () => {
    const itens = gerarEscalaMes({
      competencia: "2026-07",
      colaboradores: [colaborador()],
      turnos: [jantar],
      ausencias: [{ colaborador_id: "c1", inicio: "2026-07-06", fim: "2026-07-10", tipo: "ferias" }],
    });
    expect(itens.find((i) => i.data === "2026-07-07")?.tipo).toBe("ferias");
  });

  it("preserva ajustes manuais ao regerar", () => {
    const primeiros = gerarEscalaMes({ competencia: "2026-07", colaboradores: [colaborador()], turnos: [jantar] });
    const manual = { ...primeiros[5], tipo: "folga" as const, origem: "manual" as const, carga_prevista_horas: 0 };
    const novos = gerarEscalaMes({
      competencia: "2026-07",
      colaboradores: [colaborador()],
      turnos: [jantar],
      preservar: [manual],
    });
    expect(novos.find((i) => i.data === manual.data)?.tipo).toBe("folga");
  });

  it("ignora colaborador sem configuração vigente e o sinaliza", () => {
    const semConfig = colaborador({ id: "c2", nome: "Bruno", config: null });
    const itens = gerarEscalaMes({ competencia: "2026-07", colaboradores: [semConfig], turnos: [jantar] });
    expect(itens).toHaveLength(0);
    const alertas = validarEscalaMes(itens, { colaboradores: [semConfig] });
    expect(alertas[0].mensagem).toContain("Bruno");
  });

  it("resume carga por colaborador e por semana", () => {
    const itens = gerarEscalaMes({ competencia: "2026-07", colaboradores: [colaborador()], turnos: [jantar] });
    const [r] = resumoPorColaborador(itens);
    expect(r.diasFolga).toBe(4);
    expect(r.diasTrabalho).toBe(27);
    expect(r.cargaPorSemana[2]).toBe(30);
  });

  it("acusa erro quando a semana passa de 44h", () => {
    const longo: TurnoResolvido = { ...jantar, entrada: "08:00", saida: "20:00", intervalo_minutos: 60 };
    const itens = gerarEscalaMes({
      competencia: "2026-07",
      colaboradores: [colaborador()],
      turnos: [longo],
    });
    const alertas = validarEscalaMes(itens, { colaboradores: [colaborador()] });
    expect(escalaTemErro(alertas)).toBe(true);
  });

  it("não valida carga para regimes sem regra celetista", () => {
    const longo: TurnoResolvido = { ...jantar, entrada: "08:00", saida: "20:00", intervalo_minutos: 60 };
    const pj = colaborador({ regime: "pj" });
    const itens = gerarEscalaMes({ competencia: "2026-07", colaboradores: [pj], turnos: [longo] });
    const alertas = validarEscalaMes(itens, {
      colaboradores: [pj],
      validaCarga: (regime) => regime === "clt",
    });
    expect(escalaTemErro(alertas)).toBe(false);
  });

  it("avisa quando a cobertura mínima do dia não é atendida", () => {
    const itens = gerarEscalaMes({ competencia: "2026-07", colaboradores: [colaborador()], turnos: [jantar] });
    const alertas = validarEscalaMes(itens, {
      colaboradores: [colaborador()],
      coberturaMinima: { 1: 3 },
    });
    expect(alertas.some((a) => a.nivel === "aviso" && a.mensagem.includes("de 3 pessoas"))).toBe(true);
  });

  it("conta a cobertura por dia", () => {
    const itens = gerarEscalaMes({
      competencia: "2026-07",
      colaboradores: [colaborador(), colaborador({ id: "c2", nome: "Bia" })],
      turnos: [jantar],
    });
    expect(coberturaPorDia(itens)["2026-07-06"]).toBe(2);
  });

  it("calcula a semana do mês e o rótulo da célula", () => {
    expect(semanaDoMes("2026-07-01")).toBe(1);
    expect(rotuloCelula(undefined)).toBe("—");
    expect(rotuloCelula({ ...gerarEscalaMes({ competencia: "2026-07", colaboradores: [colaborador()], turnos: [jantar] })[5] })).toMatch(/17:00|F/);
  });
});
