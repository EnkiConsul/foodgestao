import { describe, it, expect, afterEach } from "vitest";
import { somarDiasIso, calcularIndicadores, afastadoNoDia } from "./atestadosIndicadores";
import { hojeIsoLocal } from "./dataLocal";

const TZ_ORIG = process.env.TZ;
afterEach(() => { process.env.TZ = TZ_ORIG; });

describe("Atestados — data de Brasília", () => {
  it("1: 20h59 e 21h01 de Brasília continuam no mesmo dia", () => {
    expect(hojeIsoLocal(new Date("2026-10-15T23:59:00Z"))).toBe("2026-10-15");
    expect(hojeIsoLocal(new Date("2026-10-16T00:01:00Z"))).toBe("2026-10-15");
  });
  it("2: muda exatamente à meia-noite de Brasília", () => {
    expect(hojeIsoLocal(new Date("2026-10-16T02:59:59Z"))).toBe("2026-10-15");
    expect(hojeIsoLocal(new Date("2026-10-16T03:00:00Z"))).toBe("2026-10-16");
  });
  it("3: viradas de mês com 28, 30 e 31 dias", () => {
    expect(somarDiasIso("2026-02-28", 1)).toBe("2026-03-01");
    expect(somarDiasIso("2026-04-30", 1)).toBe("2026-05-01");
    expect(somarDiasIso("2026-10-31", 1)).toBe("2026-11-01");
    expect(somarDiasIso("2026-10-27", 7)).toBe("2026-11-03");
  });
  it("4: virada de ano", () => {
    expect(somarDiasIso("2026-12-31", 1)).toBe("2027-01-01");
    expect(somarDiasIso("2026-12-28", 7)).toBe("2027-01-04");
  });
  it("5: ano bissexto", () => {
    expect(somarDiasIso("2028-02-28", 1)).toBe("2028-02-29");
    expect(somarDiasIso("2028-02-29", 1)).toBe("2028-03-01");
  });
  it("6: janela de retorno [hoje, hoje+7]", () => {
    const agora = new Date("2026-10-16T01:00:00Z"); // 15/10 22h em Brasília
    const linhas = [
      { status: "aprovada", data_alvo: "2026-10-10", data_fim: "2026-10-15" }, // volta hoje: conta
      { status: "aprovada", data_alvo: "2026-10-10", data_fim: "2026-10-16" }, // limite inferior
      { status: "aprovada", data_alvo: "2026-10-10", data_fim: "2026-10-22" }, // limite superior
      { status: "aprovada", data_alvo: "2026-10-10", data_fim: "2026-10-23" }, // fora da janela
    ];
    const k = calcularIndicadores(linhas, agora);
    expect(k.hoje).toBe("2026-10-15");
    expect(k.em7).toBe("2026-10-22");
    expect(k.retornam.map((r) => r.data_fim)).toEqual(["2026-10-15", "2026-10-16", "2026-10-22"]);
    expect(k.foraHoje).toHaveLength(3); // retorno em 15/10 já não conta como fora hoje
  });
  it("7: status preservados", () => {
    const base = { data_alvo: "2026-10-14", data_fim: "2026-10-17" };
    const linhas = ["aprovada", "pendente", "recusada", "cancelada"].map((status) => ({ ...base, status }));
    const k = calcularIndicadores(linhas, new Date("2026-10-15T15:00:00Z"));
    expect(k.foraHoje.map((r) => r.status)).toEqual(["aprovada", "pendente"]);
    expect(k.pend).toHaveLength(1);
    expect(linhas.map((r) => afastadoNoDia(r, k.hoje))).toEqual([true, true, false, false]);
  });
  it("8: mesmo instante, mesmo resultado em fusos diferentes", () => {
    const agora = new Date("2026-12-31T23:30:00Z"); // 31/12 20h30 em Brasília
    const res = ["UTC", "Asia/Tokyo", "America/Los_Angeles", "America/Sao_Paulo"].map((tz) => {
      process.env.TZ = tz;
      const k = calcularIndicadores([], agora);
      return `${k.hoje}|${k.em7}|${somarDiasIso("2026-02-28", 1)}`;
    });
    expect(new Set(res).size).toBe(1);
    expect(res[0]).toBe("2026-12-31|2027-01-07|2026-03-01");
  });
});
