import { describe, expect, it } from "vitest";
import {
  alertaCargaSemanal, formatarHoras, jornadaDosDadosDaFicha, montarJornadaSugerida, resumoSemanal, rotuloFolgaSemanal,
} from "../jornada-parse";
import { planejarFichaLote, type ContextoEfetivacao } from "../efetivacao-lote";
import type { OrganizacaoLote } from "../organizacao-lote";
import { aplicarAlteracoesVigentes } from "../../../../../supabase/functions/_shared/ficha-vigentes";

describe("carga semanal da ficha", () => {
  it("16:00–23:50 com 30 min sem dia de folga escrito = 6x1 com folga na escala, 44h (não 51h20)", () => {
    const j = montarJornadaSugerida({ jornada_texto: "das 16:00 as 23:50 - intervalo: das 18:00 as 18:30" });
    const r = resumoSemanal(j)!;
    expect(r.folgaVariavel).toBe(true);
    expect(r.diasTrabalho).toBe(6);
    expect(formatarHoras(r.minutos)).toBe("44h");
    expect(rotuloFolgaSemanal(r)).toBe("1 por semana, definida na escala");
    expect(alertaCargaSemanal(j)).toBeNull();
  });

  it("dia de descanso escrito na ficha vira folga fixa", () => {
    const j = jornadaDosDadosDaFicha({ jornada_texto: "das 16:00 as 23:50 - intervalo: das 18:00 as 18:30", dsr_dia: "Segunda" });
    const r = resumoSemanal(j)!;
    expect(j.dias[1].trabalha).toBe(false);
    expect(r.folgaVariavel).toBe(false);
    expect(rotuloFolgaSemanal(r)).toBe("Segunda");
    expect(formatarHoras(r.minutos)).toBe("44h");
  });

  it("acima de 44h semanais é sinalizado", () => {
    // 17:00–05:00 com 1h de intervalo = 11h por dia; 6 dias = 66h.
    const j = montarJornadaSugerida({ jornada_texto: "das 17:00 as 05:00 / Intervalo: das 21:00 as 22:00" });
    expect(formatarHoras(resumoSemanal(j)!.minutos)).toBe("66h");
    expect(alertaCargaSemanal(j)).toBe("Carga semanal de 66h, acima das 44h da CLT.");
  });

  it("sem intervalo na ficha, o alerta pede para informar o intervalo", () => {
    const j = montarJornadaSugerida({ jornada_texto: "das 08:00 as 18:00" });
    expect(formatarHoras(resumoSemanal(j)!.minutos)).toBe("60h");
    expect(alertaCargaSemanal(j)).toContain("não informa intervalo");
  });

  it("\"das 00:00 as 00:00\" é horário em branco, não jornada de 0h", () => {
    const j = montarJornadaSugerida({ jornada_texto: "das 00:00 as 00:00" });
    expect(j.vazia).toBe(true);
    expect(resumoSemanal(j)).toBeNull();
  });

  it("44h exatas não geram alerta; 44h01 gera", () => {
    const dias = (min: number) => [1, 2, 3, 4, 5].map((dow) => ({ dow, entrada: "08:00", saida: "16:48", intervalo_minutos: min }));
    // 8h48 por dia × 5 = 44h com intervalo zero
    const ok = montarJornadaSugerida({ jornada_dias: [...dias(0), { dow: 0, tipo: "Folga" }, { dow: 6, tipo: "Folga" }] });
    expect(resumoSemanal(ok)!.minutos).toBe(44 * 60);
    expect(alertaCargaSemanal(ok)).toBeNull();
    const extra = montarJornadaSugerida({
      jornada_dias: [...dias(0), { dow: 6, entrada: "08:00", saida: "08:01", intervalo_minutos: 0 }, { dow: 0, tipo: "Folga" }],
    });
    expect(alertaCargaSemanal(extra)).not.toBeNull();
  });
});

describe("lote com carga acima de 44h", () => {
  const ficha = (jornada_texto: string) => ({
    id: "a", status: "pendente", nome_extraido: "Pessoa", cpf_extraido: "12345678909", colaborador_existente_id: null,
    dados_extraidos: {
      nome: "Pessoa", cpf: "12345678909", telefone: "64999990000", cargo_nome: "COZINHEIRA", cbo: "513205",
      pis_nit: "12345678901", salario: 1600, salario_periodo: "mensal", jornada_texto,
    },
  });
  const ctx: ContextoEfetivacao = {
    unidadeId: "u1", unidades: [{ id: "u1", nome: "Rancho" }], cargos: [{ id: "c1", nome: "COZINHEIRA" }], turnos: [],
    padroes: { regime: null, adiantamento: false, unidadeTemPonto: true }, exigirSetor: false,
  };
  const org: OrganizacaoLote = { unidade_id: "u1", grupos: { "COZINHEIRA|513205": { cargo_id: "c1", setor_id: "s1" } }, ajustes: {} };

  it("não entra na implantação em lote: fica para conferência com o motivo", () => {
    const p = planejarFichaLote(ficha("das 17:00 as 05:00 / Intervalo: das 21:00 as 22:00"), org, ctx);
    expect(p.apta).toBe(false);
    expect("motivos" in p ? p.motivos : []).toContain("horário acima de 44h");
  });

  it("jornada 6x1 de 44h segue pronta", () => {
    const p = planejarFichaLote(ficha("das 16:00 as 23:50 - intervalo: das 18:00 as 18:30"), org, ctx);
    expect(p.apta).toBe(true);
  });
});

describe("salário e cargo vigentes da ficha", () => {
  it("reajuste mais recente substitui o salário da admissão", () => {
    const d = aplicarAlteracoesVigentes({
      data_admissao: "2024-02-01", salario: "1.412,00",
      alteracoes_salario: [
        { data: "2025-05-01", salario: "1.650,00" },
        { data: "2024-09-01", salario: "1.518,00" },
      ],
    });
    expect(d.salario).toBe(1650);
    expect(d.salario_vigencia).toBe("2025-05-01");
    expect(d.salario_admissao).toBe(1412);
  });

  it("mudança de cargo troca o cargo e não leva o CBO antigo", () => {
    const d = aplicarAlteracoesVigentes({
      data_admissao: "2024-02-01", cargo_nome: "CUMIM", cbo: "513435",
      alteracoes_cargo: [{ data: "2025-01-10", cargo: "GARÇOM" }],
    });
    expect(d.cargo_nome).toBe("GARÇOM");
    expect(d.cbo).toBeNull();
    expect(d.cargo_admissao).toBe("CUMIM");
    expect(d.cbo_admissao).toBe("513435");
  });

  it("alteração sem data ou anterior à admissão não muda nada", () => {
    const d = aplicarAlteracoesVigentes({
      data_admissao: "2024-02-01", salario: 1412,
      alteracoes_salario: [{ data: null, salario: 2000 }, { data: "2023-01-01", salario: 1800 }],
    });
    expect(d.salario).toBe(1412);
    expect(d.salario_vigencia).toBeUndefined();
  });

  it("ficha sem quadro de alterações fica como está", () => {
    const d = aplicarAlteracoesVigentes({ salario: 1710, cargo_nome: "ATENDENTE" });
    expect(d).toEqual({ salario: 1710, cargo_nome: "ATENDENTE" });
  });
});
