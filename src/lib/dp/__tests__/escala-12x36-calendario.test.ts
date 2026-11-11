import { describe, expect, it } from "vitest";
import { proximaFolga } from "@/lib/dp/proxima-folga";
import { buildOccupantsByDate, calculateDateStatus, folgaFixaNaData, parseYMD } from "@/lib/dp/folga-rules";
import { podeEscolherFolgaFds } from "@/lib/dp/escolha-folga-elegibilidade";
import { podeReceberCompensatoria } from "@/lib/dp/folga-elegibilidade";
import { proximoDescanso12x36 } from "@/lib/dp/escala-12x36";

// Primeiro plantão em 01/03/2027 (segunda): plantão nos dias ímpares de março, descanso nos pares.
const PRIMEIRO = "2027-03-01";
const ana = { id: "ana", nome: "Ana 12x36", folga_fixa_semana: null, folgas_fixas_dow: [], plantao_12x36: PRIMEIRO, ativo: true };
const bia = { id: "bia", nome: "Bia semanal", folga_fixa_semana: 3, ativo: true };

describe("próxima folga no 12x36", () => {
  it("hoje é plantão: a próxima folga é amanhã, como Descanso 12x36", () => {
    expect(proximaFolga({ hoje: "2027-03-03", plantao12x36: PRIMEIRO })).toEqual({
      data: "2027-03-04",
      motivo: "descanso_12x36",
      label: "Descanso 12x36",
    });
  });
  it("hoje é descanso: a folga é hoje", () => {
    expect(proximaFolga({ hoje: "2027-03-04", plantao12x36: PRIMEIRO })?.data).toBe("2027-03-04");
  });
  it("ignora a grade semanal (todos os dias com horário do plantão)", () => {
    const r = proximaFolga({ hoje: "2027-03-03", plantao12x36: PRIMEIRO, configDias: [{ dow: 0, trabalha: false }] });
    expect(r?.motivo).toBe("descanso_12x36");
    expect(proximoDescanso12x36("2027-03-05", PRIMEIRO)).toBe("2027-03-06");
  });
});

describe("calendário de folgas no 12x36", () => {
  it("descanso alterna dia sim, dia não, inclusive aos domingos", () => {
    expect(folgaFixaNaData(ana, parseYMD("2027-03-06"))).toBe(true); // sábado par
    expect(folgaFixaNaData(ana, parseYMD("2027-03-07"))).toBe(false); // domingo ímpar = plantão
    expect(folgaFixaNaData(ana, parseYMD("2027-03-14"))).toBe(true); // domingo par = descanso
  });
  it("colegas veem o descanso do 12x36 rotulado; a pessoa semanal segue o dia da semana", () => {
    const days = ["2027-03-02", "2027-03-03", "2027-03-04"].map(parseYMD);
    const m = buildOccupantsByDate({ days, colaboradores: [ana, bia], folgas: [], pendentes: [] });
    expect(m.get("2027-03-02")?.map((o) => [o.colaboradorId, o.origin])).toEqual([["ana", "Descanso 12x36"]]);
    // Quarta 03/03: Ana em plantão; Bia na folga semanal de quarta.
    expect(m.get("2027-03-03")?.map((o) => [o.colaboradorId, o.origin])).toEqual([["bia", "Folga Semanal"]]);
    expect(m.get("2027-03-04")?.map((o) => o.colaboradorId)).toEqual(["ana"]);
  });
  it("no portal, o descanso aparece como folga fixa e o plantão de fim de semana não fica disponível para marcar", () => {
    const base = { myColaboradorId: "ana", allColaboradores: [ana], isAdmin: false, diasElegiveis: [0, 6] };
    expect(calculateDateStatus({ ...base, date: parseYMD("2027-03-06") })).toMatchObject({ status: "fixed", label: "Descanso" });
    expect(calculateDateStatus({ ...base, date: parseYMD("2027-03-07") })).toMatchObject({ status: "weekday", label: "Plantão" });
  });
});

describe("elegibilidade no 12x36", () => {
  it("não participa da escolha de folga do mês nem da dominical", () => {
    expect(podeEscolherFolgaFds("clt", "mensalista", null, "12x36")).toBe(false);
    expect(podeEscolherFolgaFds("clt", "mensalista", null, "semanal")).toBe(true);
  });
  it("não recebe folga compensatória de feriado, mesmo com a unidade compensando", () => {
    expect(podeReceberCompensatoria({ regime: "clt", escala_modelo: "12x36" }, true, null)).toBe(false);
    expect(podeReceberCompensatoria({ regime: "clt" }, true, null)).toBe(true);
  });
});
