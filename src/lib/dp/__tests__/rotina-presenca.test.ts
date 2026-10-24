import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { contarDia, type ColaboradorPanorama } from "../operacao-panorama";
import { invalidarRotina } from "../rotina-cache";

const data = "2026-10-23";
const colaborador: ColaboradorPanorama = {
  id: "pessoa", nome: "Pessoa de teste", intermitente: false,
  config: { turno_padrao_id: null, folga_variavel: false, folga_fixa_dow: 0,
    dias: [{ dow: 5, trabalha: true, turno_id: null, entrada: "08:30", saida: "17:30" }] },
};
const base = { data, colaboradores: [colaborador], turnos: [], convocacoes: [], folgas: [], ausencias: [] };

describe("presença na rotina", () => {
  it("folga compensatória aprovada vence escala de trabalho antiga", () => {
    const r = contarDia({ ...base,
      folgas: [{ colaborador_id: "pessoa", data, tipo: "normal", extra: true }],
      itensPublicados: [{ colaborador_id: "pessoa", data, tipo: "trabalho", turno_id: null, entrada: "08:30", saida: "17:30" }],
    });
    expect(r.trabalhando).toBe(0);
    expect(r.pessoas[0]?.categoria).toBe("folga_extra");
  });
  it("folga semanal aprovada vence convocação aceita", () => {
    const r = contarDia({ ...base,
      folgas: [{ colaborador_id: "pessoa", data, tipo: "normal" }],
      convocacoes: [{ colaborador_id: "pessoa", data, status: "aceita", turno_id: null, entrada: "08:30", saida: "17:30" }],
    });
    expect(r.trabalhando).toBe(0);
    expect(r.pessoas[0]?.categoria).toBe("folga_padrao");
  });
  it.each(["ferias", "atestado", "suspensao"] as const)("%s retira a pessoa da operação", (tipo) => {
    const r = contarDia({ ...base, ausencias: [{ colaborador_id: "pessoa", inicio: data, fim: data, tipo }] });
    expect(r.trabalhando).toBe(0);
  });
  it("sem ausência efetivada preserva o horário habitual", () => {
    expect(contarDia(base).trabalhando).toBe(1);
  });
  it("decisão invalida todas as leituras da rotina", async () => {
    const qc = new QueryClient();
    const keys = ["dp_panorama_base", "dp_meu_rotina_loja", "dp_meu_rotina_dia_panel", "dp_portal_equipe_fora_dia", "dp_minha_situacao_dia"];
    for (const key of keys) qc.setQueryData([key, "unidade", data], []);
    await invalidarRotina(qc);
    for (const key of keys) expect(qc.getQueryState([key, "unidade", data])?.isInvalidated).toBe(true);
    qc.clear();
  });
});