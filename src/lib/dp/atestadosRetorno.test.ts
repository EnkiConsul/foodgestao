import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { somarDiasIso, calcularIndicadores } from "./atestadosIndicadores";
import { periodoAfastamento, corrigirAtestado } from "./solicitacoes-admin";

// Os testes rodam com process.env.TZ alterado em tempo de execução para cada fuso.
const FUSOS = ["America/Sao_Paulo", "UTC", "Asia/Tokyo", "America/Los_Angeles"];

const CASOS: Array<[string, number, string]> = [
  ["2026-10-10", 1, "2026-10-11"],
  ["2026-10-10", 3, "2026-10-13"],
  ["2026-10-10", 7, "2026-10-17"],
  ["2026-10-10", 30, "2026-11-09"],
  ["2026-10-31", 1, "2026-11-01"],
  ["2026-12-31", 1, "2027-01-01"],
  ["2028-02-28", 1, "2028-02-29"],
  ["2027-02-28", 1, "2027-03-01"],
];

describe.each(FUSOS)("data de retorno no fuso %s", (tz) => {
  beforeEach(() => { process.env.TZ = tz; rpc.mockReset(); rpc.mockResolvedValue({ error: null }); });

  it.each(CASOS)("cadastro: %s + %i dia(s) = %s", (ini, dias, esperado) => {
    expect(somarDiasIso(ini, dias)).toBe(esperado);
    expect(periodoAfastamento(ini, dias).data_fim).toBe(esperado);
  });

  it("duração zero mantém retorno igual ao início", () => {
    expect(periodoAfastamento("2026-10-10", 0)).toEqual({ data_alvo: "2026-10-10", data_fim: "2026-10-10" });
  });

  it("edição envia à RPC a mesma data mostrada na prévia", async () => {
    await corrigirAtestado({ solicitacaoId: "x", colaboradorId: "c", dataInicio: "2026-10-10", dias: 3 });
    expect(rpc).toHaveBeenCalledWith("dp_solicitacao_corrigir", expect.objectContaining({ p_data_alvo: "2026-10-10", p_data_fim: "2026-10-13" }));
    expect(rpc.mock.calls[0][1].p_data_fim).toBe(somarDiasIso("2026-10-10", 3));
  });

  it("indicadores da Etapa 7 sem regressão", () => {
    const agora = new Date("2026-10-16T02:42:00Z"); // 15/10 23:42 em Brasília
    const r = calcularIndicadores([{ status: "aprovada", data_alvo: "2026-10-14", data_fim: "2026-10-17" }], agora);
    expect(r.hoje).toBe("2026-10-15");
    expect(r.em7).toBe("2026-10-22");
    expect(r.foraHoje).toHaveLength(1);
  });
});
