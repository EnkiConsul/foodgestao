import { describe, expect, it } from "vitest";
import {
  alertas12x36, cargaMediaSemanal12x36, diaDaConfigNaData, ehDiaDePlantao12x36, simularCiclo12x36,
} from "@/lib/dp/escala-12x36";
import { gerarEscalaMes, validarEscalaMes } from "@/lib/dp/escala-mes";
import { resolverHorarioPrevisto } from "@/lib/dp/horario-previsto";
import { validarConfigTrabalho, type ConfigTrabalho } from "@/lib/dp/config-trabalho";
import { termoTrocaGestorParagrafos } from "@/lib/dp/termo-troca-gestor";

const turno = { id: "t12", nome: "Plantão", entrada: "07:00", saida: "19:00", intervalo_minutos: 60 };
const config: ConfigTrabalho = {
  turno_padrao_id: "t12",
  folga_variavel: false,
  folga_fixa_dow: null,
  escala_modelo: "12x36",
  data_primeiro_plantao: "2026-11-10",
  dias: [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dow, trabalha: true, turno_id: null })),
};

describe("ciclo 12x36 (dia sim, dia não a partir do primeiro plantão)", () => {
  it("o primeiro plantão e dois dias depois são plantão; o dia seguinte é descanso", () => {
    expect(ehDiaDePlantao12x36("2026-11-10", "2026-11-10")).toBe(true);
    expect(ehDiaDePlantao12x36("2026-11-11", "2026-11-10")).toBe(false);
    expect(ehDiaDePlantao12x36("2026-11-12", "2026-11-10")).toBe(true);
  });
  it("vale também antes do primeiro plantão", () => {
    expect(ehDiaDePlantao12x36("2026-11-08", "2026-11-10")).toBe(true);
    expect(ehDiaDePlantao12x36("2026-11-09", "2026-11-10")).toBe(false);
  });
  it("atravessa 29 de fevereiro sem perder a alternância", () => {
    expect(ehDiaDePlantao12x36("2024-03-01", "2024-02-28")).toBe(true);
    expect(ehDiaDePlantao12x36("2024-02-29", "2024-02-28")).toBe(false);
  });
  it("a prévia de 14 dias tem 7 plantões e 7 descansos alternados", () => {
    const dias = simularCiclo12x36("2026-11-10", "2026-11-10", 14);
    expect(dias.filter((d) => d.plantao)).toHaveLength(7);
    expect(dias.slice(0, 4).map((d) => d.plantao)).toEqual([true, false, true, false]);
  });
  it("o dia da semana não decide: duas terças seguidas têm situações diferentes", () => {
    expect(diaDaConfigNaData(config, "2026-11-10")?.trabalha).toBe(true);
    expect(diaDaConfigNaData(config, "2026-11-17")?.trabalha).toBe(false);
  });
});

describe("12x36 no horário previsto e na escala do mês", () => {
  it("dia de descanso aparece como folga e dia de plantão com 07:00–19:00", () => {
    const colab = { id: "c1", regime: "clt", config };
    expect(resolverHorarioPrevisto({ colaborador: colab, data: "2026-11-11", turnos: [turno] }).trabalha).toBe(false);
    const p = resolverHorarioPrevisto({ colaborador: colab, data: "2026-11-12", turnos: [turno] });
    expect([p.trabalha, p.entrada, p.saida]).toEqual([true, "07:00", "19:00"]);
  });
  it("novembro de 2026 a partir de 10/11 gera 15 plantões no mês", () => {
    const itens = gerarEscalaMes({ competencia: "2026-11", colaboradores: [{ id: "c1", nome: "Ana", regime: "clt", config }], turnos: [turno] });
    expect(itens.filter((i) => i.tipo === "trabalho")).toHaveLength(15);
  });
  it("semana com 48h no 12x36 não vira erro de 44h", () => {
    const colaboradores = [{ id: "c1", nome: "Ana", regime: "clt", config }];
    const itens = gerarEscalaMes({ competencia: "2026-11", colaboradores, turnos: [turno] });
    expect(validarEscalaMes(itens, { colaboradores }).filter((a) => a.nivel === "erro")).toEqual([]);
  });
});

describe("cadastro do plantão 12x36", () => {
  it("sem data do primeiro plantão não salva", () => {
    const v = validarConfigTrabalho({ ...config, data_primeiro_plantao: null }, [turno], { regime: "clt" });
    expect(v.some((x) => x.nivel === "erro" && x.mensagem.includes("primeiro plantão"))).toBe(true);
  });
  it("com data e horário de 12h passa sem erro de folga semanal nem de 44h", () => {
    expect(validarConfigTrabalho(config, [turno], { regime: "clt" }).filter((x) => x.nivel === "erro")).toEqual([]);
  });
  it("média semanal de 07:00–19:00 com 1h de intervalo é 38h30", () => {
    expect(cargaMediaSemanal12x36(turno)).toBe(38.5);
  });
  it("plantão de 10h, intervalo de 30 min e menor de idade geram aviso", () => {
    const codigos = alertas12x36({ entrada: "08:00", saida: "18:00", intervalo_minutos: 30, idade: 17 }).filter((a) => a.severidade === "aviso").map((a) => a.codigo);
    expect(codigos.sort()).toEqual(["12X36_DURACAO", "12X36_INTERVALO", "12X36_MENOR"]);
  });
  it("07:00–19:00 com 1h de intervalo para adulto não gera aviso", () => {
    expect(alertas12x36({ ...turno, idade: 30 }).filter((a) => a.severidade === "aviso")).toEqual([]);
  });
});

describe("termo da troca com plantões 12x36 seguidos", () => {
  const base = { empresa: "Rancho", nome: "Ana Civil", dataFixa: "2026-11-11", dataNova: "2026-11-14", origem: "empresa" as const, folgaFixa: false, trocaEntrePessoas: true };
  it("inclui a declaração de pedido do colaborador e o Art. 59-A", () => {
    const texto = termoTrocaGestorParagrafos({ ...base, plantoesSeguidos12x36: [{ data_plantao: "2026-11-11", data_vizinha: "2026-11-12" }] }).join(" ");
    expect(texto).toContain("Art. 59-A");
    expect(texto).toContain("pedida por mim");
  });
  it("sem plantões seguidos o termo continua com 5 cláusulas", () => {
    expect(termoTrocaGestorParagrafos(base)).toHaveLength(5);
  });
});
