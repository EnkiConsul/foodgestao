import { describe, expect, it } from "vitest";
import {
  baseDivergenteDosDias, cargaSemanalConfig, detalharCargaSemanal,
  type ConfigTrabalho, type TurnoResolvido,
} from "@/lib/dp/config-trabalho";
import { formatarHoras } from "@/lib/dp/jornada-utils";

const BASE: TurnoResolvido = {
  id: "base", nome: "Jantar 17:00–00:00", entrada: "17:00", saida: "00:00", intervalo_minutos: 30,
};

const dia = (dow: number, entrada?: string, saida?: string) => ({
  dow, trabalha: true, turno_id: null,
  entrada: entrada ?? null, saida: saida ?? null, intervalo_minutos: entrada ? 30 : null,
});

// Semana da Hanna: todos os dias com horário próprio até 00:35, quinta de folga.
const hanna: ConfigTrabalho = {
  turno_padrao_id: "base",
  folga_variavel: false,
  folga_fixa_dow: null,
  dias: [
    dia(0, "16:30", "00:35"), dia(1, "17:00", "00:35"), dia(2, "17:00", "00:35"),
    dia(3, "17:00", "00:35"), { dow: 4, trabalha: false, turno_id: null },
    dia(5, "16:30", "00:35"), dia(6, "16:30", "00:35"),
  ],
};

// Semana da Rosângela: quinta sem horário próprio, herdando o base defasado.
const rosangela: ConfigTrabalho = {
  ...hanna,
  dias: [
    dia(0, "16:30", "00:35"), dia(1, "17:00", "00:35"), { dow: 2, trabalha: false, turno_id: null },
    dia(3, "17:00", "00:35"), dia(4), dia(5, "16:30", "00:35"), dia(6, "16:30", "00:35"),
  ],
};

describe("cargaSemanalConfig", () => {
  it("soma em minutos, sem desvio de arredondamento por dia", () => {
    expect(cargaSemanalConfig(hanna, [BASE])).toBe(44);
    expect(formatarHoras(cargaSemanalConfig(hanna, [BASE]))).toBe("44h");
  });

  it("conta o dia que herda o horário base pela faixa do base", () => {
    // 43h25 exatos. A tela mostrava 43h24 porque somava horas já arredondadas por dia.
    expect(formatarHoras(cargaSemanalConfig(rosangela, [BASE]))).toBe("43h25");
  });
});

describe("detalharCargaSemanal", () => {
  it("marca a origem do horário de cada dia", () => {
    const d = detalharCargaSemanal(rosangela, [BASE]);
    expect(d.find((x) => x.dow === 4)!.origem).toBe("base");
    expect(d.find((x) => x.dow === 0)!.origem).toBe("proprio");
    expect(d.find((x) => x.dow === 2)!.origem).toBeNull();
    expect(d.find((x) => x.dow === 4)!.minutos).toBe(390);
  });
});

describe("baseDivergenteDosDias", () => {
  it("detecta o horário base defasado e os dias que o herdam", () => {
    const div = baseDivergenteDosDias(rosangela, [BASE])!;
    expect(div.saida).toBe("00:35");
    expect(div.baseSaida).toBe("00:00");
    expect(div.diasHerdando).toEqual([4]);
  });

  it("não avisa quando nenhum dia herda o base", () => {
    expect(baseDivergenteDosDias(hanna, [BASE])).toBeNull();
  });
});
