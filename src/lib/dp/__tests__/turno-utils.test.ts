import { describe, it, expect } from "vitest";
import {
  cargaLiquidaHoras,
  formatarFaixaTurno,
  formatarFuncionamento,
  intervaloAbaixoDoLegal,
  intervaloMinimoLegal,
  nomeSugeridoTurno,
  sugerirCategoria,
  turnoForaDoFuncionamento,
  turnoSnapshot,
  turnoViraODia,
  validarTurno,
} from "@/lib/dp/turno-utils";

const base = { nome: "Jantar", entrada: "17:00", saida: "23:00", intervalo_minutos: 60 };

describe("turno-utils", () => {
  it("calcula carga líquida descontando o intervalo", () => {
    expect(cargaLiquidaHoras({ entrada: "17:00", saida: "23:00", intervalo_minutos: 60 })).toBe(5);
    expect(cargaLiquidaHoras({ entrada: "10:00", saida: "16:00", intervalo_minutos: 15 })).toBe(5.75);
  });

  it("detecta turno que atravessa a meia-noite", () => {
    expect(turnoViraODia("18:00", "02:00")).toBe(true);
    expect(turnoViraODia("10:00", "16:00")).toBe(false);
    expect(cargaLiquidaHoras({ entrada: "18:00", saida: "02:00", intervalo_minutos: 60 })).toBe(7);
    expect(formatarFaixaTurno({ entrada: "17:00", saida: "00:30" })).toBe("17:00 → 00:30 (+1)");
  });

  it("gera snapshot imutável do horário", () => {
    expect(turnoSnapshot({ entrada: "17:00", saida: "00:30", intervalo_minutos: 30 })).toEqual({
      entrada: "17:00",
      saida: "00:30",
      intervalo_minutos: 30,
      termina_no_dia_seguinte: true,
      carga_prevista_horas: 7,
    });
  });

  it("nunca valida limite semanal no cadastro do turno", () => {
    const msgs = validarTurno(base).map((v) => v.mensagem).join(" ");
    expect(msgs).not.toMatch(/44/);
  });

  it("bloqueia intervalo maior que a duração e entrada igual à saída", () => {
    const r1 = validarTurno({ ...base, intervalo_minutos: 600 });
    expect(r1.some((v) => v.nivel === "erro" && v.campo === "intervalo_minutos")).toBe(true);
    const r2 = validarTurno({ ...base, saida: "17:00" });
    expect(r2.some((v) => v.nivel === "erro" && v.campo === "saida")).toBe(true);
  });

  it("avisa sobre intervalo insuficiente sem bloquear", () => {
    const r = validarTurno({ ...base, intervalo_minutos: 0 });
    expect(r.some((v) => v.nivel === "aviso")).toBe(true);
    expect(r.some((v) => v.nivel === "erro")).toBe(false);
  });

  it("sugere categoria pelo horário de entrada", () => {
    expect(sugerirCategoria("08:00")).toBe("abertura");
    expect(sugerirCategoria("11:00")).toBe("almoco");
    expect(sugerirCategoria("18:00")).toBe("jantar");
    expect(sugerirCategoria("22:00")).toBe("fechamento");
  });

  it("compara o turno com o funcionamento da unidade", () => {
    const dia = {
      dia_semana: 5,
      aberto: true,
      hora_abertura: "11:00",
      hora_fechamento: "23:00",
      fecha_no_dia_seguinte: false,
    };
    expect(turnoForaDoFuncionamento({ entrada: "17:00", saida: "23:00" }, dia)).toBeNull();
    expect(turnoForaDoFuncionamento({ entrada: "09:00", saida: "15:00" }, dia)).toMatch(/antes da abertura/);
    expect(turnoForaDoFuncionamento({ entrada: "18:00", saida: "02:00" }, dia)).toMatch(/depois do fechamento/);
    expect(turnoForaDoFuncionamento({ entrada: "18:00", saida: "22:00" }, { ...dia, aberto: false })).toMatch(/fechada/);
  });

  it("formata o funcionamento do dia", () => {
    expect(formatarFuncionamento({ dia_semana: 0, aberto: false, hora_abertura: null, hora_fechamento: null, fecha_no_dia_seguinte: false })).toBe("Fechado");
    expect(formatarFuncionamento({ dia_semana: 1, aberto: true, hora_abertura: "11:00", hora_fechamento: "23:00", fecha_no_dia_seguinte: false })).toBe("11:00 → 23:00");
  });
});

describe("nome e intervalo legal", () => {
  it("gera o nome do turno a partir da categoria e do horário", () => {
    expect(nomeSugeridoTurno("jantar", "17:00", "23:00")).toBe("Jantar 17:00–23:00");
    expect(nomeSugeridoTurno(null, "08:00", "12:00")).toBe("Abertura 08:00–12:00");
  });

  it("define o intervalo mínimo legal pela carga do dia", () => {
    expect(intervaloMinimoLegal(8)).toBe(60);
    expect(intervaloMinimoLegal(5)).toBe(15);
    expect(intervaloMinimoLegal(3)).toBe(0);
  });

  it("detecta intervalo abaixo do mínimo legal", () => {
    expect(intervaloAbaixoDoLegal({ entrada: "10:00", saida: "19:00", intervalo_minutos: 30 })?.minimo).toBe(60);
    expect(intervaloAbaixoDoLegal({ entrada: "10:00", saida: "16:00", intervalo_minutos: 0 })?.minimo).toBe(15);
    expect(intervaloAbaixoDoLegal({ entrada: "10:00", saida: "19:00", intervalo_minutos: 60 })).toBeNull();
    expect(intervaloAbaixoDoLegal({ entrada: "10:00", saida: "13:00", intervalo_minutos: 0 })).toBeNull();
  });
});
