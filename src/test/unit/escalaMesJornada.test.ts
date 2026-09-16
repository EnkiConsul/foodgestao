// Integração jornada → escala do mês: linhas do banco → configuração de
// domínio → itens gerados → payload gravado. O teste vai até o payload porque o
// defeito corrigido só aparecia lá (horário próprio perdido / turno_id inválido).
import { describe, it, expect } from "vitest";
import {
  itemParaLinha,
  mapearDiasConfig,
  montarColaboradoresEscala,
  type ConfigDiaRow,
  type ConfigTrabalhoRow,
} from "@/lib/dp/escala-mes-base";
import { gerarEscalaMes, validarEscalaMes, type EscalaItem } from "@/lib/dp/escala-mes";
import type { TurnoResolvido } from "@/lib/dp/config-trabalho";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const ESCALA = "22222222-2222-4222-8222-222222222222";
const COLAB = "33333333-3333-4333-8333-333333333333";
const TURNO = "44444444-4444-4444-8444-444444444444";
const SETOR = "55555555-5555-4555-8555-555555555555";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TURNOS: TurnoResolvido[] = [
  { id: TURNO, nome: "Noite", entrada: "18:00", saida: "23:00", intervalo_minutos: 30 },
];

function config(dias: ConfigDiaRow[], turnoPadraoId: string | null = null): ConfigTrabalhoRow {
  return {
    colaborador_id: COLAB,
    vigencia_inicio: "2026-01-01",
    vigencia_fim: null,
    turno_padrao_id: turnoPadraoId,
    folga_variavel: true,
    folga_fixa_dow: null,
    dias,
  };
}

/** Caminho completo do hook: consulta → domínio → geração → payload. */
function persistir(
  configs: ConfigTrabalhoRow[],
  opts?: { preservar?: EscalaItem[]; competencia?: string },
) {
  const colaboradores = montarColaboradoresEscala({
    colaboradores: [{ id: COLAB, nome: "ANA SOUZA", regime: "clt", unidade_id: null }],
    configs,
    unidadeId: null,
    inicio: "2026-09-01",
    fim: "2026-09-30",
  });
  const itens = gerarEscalaMes({
    competencia: opts?.competencia ?? "2026-09",
    colaboradores,
    turnos: TURNOS,
    preservar: opts?.preservar,
  });
  return {
    colaboradores,
    itens,
    linhas: itens.map((i) => itemParaLinha(i, COMPANY, ESCALA)),
  };
}

// 2026-09-01 é terça (dow 2); 2026-09-02 quarta (dow 3).
const dia = (linhas: ReturnType<typeof persistir>["linhas"], data: string) =>
  linhas.find((l) => l.data === data)!;

describe("mapearDiasConfig", () => {
  it("preserva horário próprio, intervalo e setor do dia", () => {
    const [d] = mapearDiasConfig([
      {
        dow: 2, trabalha: true, turno_id: null, setor_id: SETOR,
        entrada: "10:00:00", saida: "16:30:00", intervalo_minutos: 45,
      },
    ]);
    expect(d).toEqual({
      dow: 2, trabalha: true, turno_id: null,
      entrada: "10:00", saida: "16:30", intervalo_minutos: 45, setor_id: SETOR,
    });
  });
});

describe("escala do mês a partir da jornada", () => {
  it("horário próprio sem turno cadastrado: grava turno_id null e mantém o horário", () => {
    const { linhas } = persistir([
      config([{ dow: 2, trabalha: true, turno_id: null, entrada: "10:00", saida: "16:30", intervalo_minutos: 45 }]),
    ]);
    const l = dia(linhas, "2026-09-01");
    expect(l.turno_id).toBeNull();
    expect(l.entrada).toBe("10:00");
    expect(l.saida).toBe("16:30");
    expect(l.intervalo_minutos).toBe(45);
    expect(l.carga_prevista_horas).toBeCloseTo(5.75, 2);
    expect(l.tipo).toBe("trabalho");
  });

  it("nunca grava identificador interno do tipo dia:<dow> em turno_id", () => {
    const { linhas } = persistir([
      config([{ dow: 2, trabalha: true, turno_id: null, entrada: "10:00", saida: "16:00", intervalo_minutos: 0 }]),
    ]);
    for (const l of linhas) {
      if (l.turno_id !== null) expect(l.turno_id).toMatch(UUID);
      expect(String(l.turno_id)).not.toContain("dia:");
    }
  });

  it("horário próprio com turno cadastrado: mantém o UUID do turno e o horário do dia tem precedência", () => {
    const { linhas } = persistir([
      config([{ dow: 2, trabalha: true, turno_id: TURNO, entrada: "19:00", saida: "23:30", intervalo_minutos: 15 }]),
    ]);
    const l = dia(linhas, "2026-09-01");
    expect(l.turno_id).toBe(TURNO);
    expect(l.entrada).toBe("19:00");
    expect(l.saida).toBe("23:30");
    expect(l.intervalo_minutos).toBe(15);
  });

  it("sem horário próprio usa o turno padrão da configuração (fallback)", () => {
    const { linhas } = persistir([config([{ dow: 2, trabalha: true, turno_id: null }], TURNO)]);
    const l = dia(linhas, "2026-09-01");
    expect(l.turno_id).toBe(TURNO);
    expect(l.entrada).toBe("18:00");
    expect(l.saida).toBe("23:00");
    expect(l.intervalo_minutos).toBe(30);
  });

  it("dia não trabalhado vira folga sem horário", () => {
    const { linhas } = persistir([
      config([
        { dow: 2, trabalha: true, turno_id: null, entrada: "10:00", saida: "16:00", intervalo_minutos: 0 },
        { dow: 3, trabalha: false, turno_id: null },
      ]),
    ]);
    const folga = dia(linhas, "2026-09-02");
    expect(folga.tipo).toBe("folga");
    expect(folga.turno_id).toBeNull();
    expect(folga.entrada).toBeNull();
    expect(folga.carga_prevista_horas).toBe(0);
  });

  it("noturno com horário próprio marca virada de dia", () => {
    const { linhas } = persistir([
      config([{ dow: 2, trabalha: true, turno_id: null, entrada: "22:00", saida: "04:00", intervalo_minutos: 60 }]),
    ]);
    const l = dia(linhas, "2026-09-01");
    expect(l.termina_no_dia_seguinte).toBe(true);
    expect(l.carga_prevista_horas).toBeCloseTo(5, 2);
    expect(l.turno_id).toBeNull();
  });

  it("ajuste manual sobrevive à regeneração com o horário próprio gravado", () => {
    const manual: EscalaItem = {
      colaborador_id: COLAB, data: "2026-09-01", tipo: "trabalho", turno_id: null,
      entrada: "08:00", saida: "12:00", intervalo_minutos: 0,
      termina_no_dia_seguinte: false, carga_prevista_horas: 4, origem: "manual",
    };
    const { linhas } = persistir([config([{ dow: 2, trabalha: true, turno_id: TURNO }], TURNO)], {
      preservar: [manual],
    });
    const l = dia(linhas, "2026-09-01");
    expect(l.origem).toBe("manual");
    expect(l.entrada).toBe("08:00");
    expect(l.turno_id).toBeNull();
  });

  it("setor decidido no dia é preservado no payload", () => {
    const anterior: EscalaItem = {
      colaborador_id: COLAB, data: "2026-09-01", tipo: "trabalho", turno_id: null,
      entrada: "10:00", saida: "16:00", intervalo_minutos: 0,
      termina_no_dia_seguinte: false, carga_prevista_horas: 6, origem: "gerado",
      setor_id: SETOR, setor_motivo: "Cobertura do salão",
    };
    const { linhas } = persistir([
      config([{ dow: 2, trabalha: true, turno_id: null, entrada: "10:00", saida: "16:00", intervalo_minutos: 0 }]),
    ], { preservar: [anterior] });
    const l = dia(linhas, "2026-09-01");
    expect(l.setor_id).toBe(SETOR);
    expect(l.setor_motivo).toBe("Cobertura do salão");
  });

  it("horário próprio sem turno não gera alerta de dia sem turno", () => {
    const { itens, colaboradores } = persistir([
      config([{ dow: 2, trabalha: true, turno_id: null, entrada: "10:00", saida: "16:00", intervalo_minutos: 0 }]),
    ]);
    const alertas = validarEscalaMes(itens, { colaboradores });
    // Só o dia configurado importa aqui: os outros dias da semana ficam sem
    // horário nesta configuração mínima e continuam alertando.
    expect(alertas.filter((a) => a.data === "2026-09-01")).toHaveLength(0);
  });

  it("dia trabalhado sem horário nenhum continua sendo erro", () => {
    const { itens, colaboradores, linhas } = persistir([config([{ dow: 2, trabalha: true, turno_id: null }])]);
    expect(dia(linhas, "2026-09-01").observacao).toBe("Sem turno definido");
    const alertas = validarEscalaMes(itens, { colaboradores });
    expect(alertas.some((a) => a.data === "2026-09-01" && a.mensagem.includes("sem turno"))).toBe(true);
  });

  it("ajuste manual é persistido com origem manual", () => {
    const item: EscalaItem = {
      colaborador_id: COLAB, data: "2026-09-05", tipo: "trabalho", turno_id: null,
      entrada: "09:00", saida: "13:00", intervalo_minutos: 0,
      termina_no_dia_seguinte: false, carga_prevista_horas: 4, origem: "gerado",
    };
    const linha = itemParaLinha(item, COMPANY, ESCALA, "manual");
    expect(linha.origem).toBe("manual");
    expect(linha.turno_id).toBeNull();
    expect(linha.company_id).toBe(COMPANY);
    expect(linha.escala_id).toBe(ESCALA);
  });
});
