import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { somarDiasIso, calcularIndicadores, dataRetorno, diasAfastamento } from "./atestadosIndicadores";
import { periodoAfastamento, corrigirAtestado } from "./solicitacoes-admin";

// Os testes rodam com process.env.TZ alterado em tempo de execução para cada fuso.
const FUSOS = ["America/Sao_Paulo", "UTC", "Asia/Tokyo", "America/Los_Angeles"];

// [início, dias, último dia afastado, retorno]
const CASOS: Array<[string, number, string, string]> = [
  ["2026-10-14", 3, "2026-10-16", "2026-10-17"],
  ["2026-10-10", 1, "2026-10-10", "2026-10-11"],
  ["2026-10-10", 7, "2026-10-16", "2026-10-17"],
  ["2026-10-10", 30, "2026-11-08", "2026-11-09"],
  ["2026-10-30", 2, "2026-10-31", "2026-11-01"],
  ["2026-12-30", 2, "2026-12-31", "2027-01-01"],
  ["2028-02-28", 2, "2028-02-29", "2028-03-01"],
  ["2027-02-27", 2, "2027-02-28", "2027-03-01"],
];

describe.each(FUSOS)("data de retorno no fuso %s", (tz) => {
  beforeEach(() => { process.env.TZ = tz; rpc.mockReset(); rpc.mockResolvedValue({ error: null }); });

  it.each(CASOS)("cadastro: %s com %i dia(s) termina em %s e volta em %s", (ini, dias, fim, volta) => {
    const p = periodoAfastamento(ini, dias);
    expect(p.data_fim).toBe(fim);
    expect(dataRetorno(p)).toBe(volta);
    expect(diasAfastamento(p.data_alvo, p.data_fim)).toBe(dias);
  });

  it("duração zero vira um dia", () => {
    expect(periodoAfastamento("2026-10-10", 0)).toEqual({ data_alvo: "2026-10-10", data_fim: "2026-10-10" });
  });

  it("edição envia à RPC a mesma data mostrada na prévia", async () => {
    await corrigirAtestado({ solicitacaoId: "x", colaboradorId: "c", dataInicio: "2026-10-10", dias: 3 });
    expect(rpc).toHaveBeenCalledWith("dp_solicitacao_corrigir", expect.objectContaining({ p_data_alvo: "2026-10-10", p_data_fim: "2026-10-12" }));
    expect(rpc.mock.calls[0][1].p_data_fim).toBe(somarDiasIso("2026-10-10", 2));
  });

  it("indicadores da Etapa 7 sem regressão", () => {
    const agora = new Date("2026-10-16T02:42:00Z"); // 15/10 23:42 em Brasília
    const r = calcularIndicadores([{ status: "aprovada", data_alvo: "2026-10-14", data_fim: "2026-10-17" }], agora);
    expect(r.hoje).toBe("2026-10-15");
    expect(r.em7).toBe("2026-10-22");
    expect(r.foraHoje).toHaveLength(1);
  });
});
