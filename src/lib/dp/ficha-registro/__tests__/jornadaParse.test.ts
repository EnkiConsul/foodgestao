import { describe, expect, it } from "vitest";
import { montarJornadaSugerida, parseJornadaCompacta, problemasJornada } from "../jornada-parse";
import { planejarFichaLote, type ContextoEfetivacao } from "../efetivacao-lote";
import type { OrganizacaoLote } from "../organizacao-lote";

/** Textos reais das fichas do Rancho 330 que pararam com "Intervalo inválido". */
const RANCHO: Array<[string, string, string, number]> = [
  ["das 10:00 as 17:50 / Horário de Intervalo das 12:00 as 12:30", "10:00", "17:50", 30],
  ["das 17:00 as 05:00 / Intervalo: das 21:00 as 22:00", "17:00", "05:00", 60],
  ["das 16:00 as 23:50 - intervalo: das 18:00 as 18:30", "16:00", "23:50", 30],
  ["das 14:00 as 21:50 / intervalo das 18:00 as 18:30", "14:00", "21:50", 30],
  ["das 16:00 as 23:50 | Horário de Intervalo: das 19:00 as 19:30", "16:00", "23:50", 30],
  ["Horário de Trabalho: das 09:00 as 16:50 | Horário de Intervalo: das 13:00 as 13:30", "09:00", "16:50", 30],
  ["das 16:00 as 23:50 Horário de Intervalo das 21:00 as 21:30", "16:00", "23:50", 30],
  ["Horário de Trabalho das 09:00 as 16:50 Horário de Intervalo das 13:00 as 13:30", "09:00", "16:50", 30],
  ["das 04:00 as 11:50 | Horário de Intervalo das 10:00 as 10:30", "04:00", "11:50", 30],
  ["das 06:00 as 14:20 / intervalo das 10:30 as 11:00", "06:00", "14:20", 30],
  ["das 16:00 as 23:50 Intervalo: das 21:00 as 21:30", "16:00", "23:50", 30],
  ["Horário de Trabalho das 07:30 as 15:20 | Intervalo das 10:30 as 11:00", "07:30", "15:20", 30],
];

describe("leitura da jornada com intervalo em bloco separado", () => {
  it.each(RANCHO)("lê %s", (texto, entrada, saida, intervalo) => {
    expect(parseJornadaCompacta(texto)).toEqual({ entrada, saida, intervalo_minutos: intervalo, intervalo_incerto: false });
  });

  it("formato clássico de quatro horários continua igual", () => {
    expect(parseJornadaCompacta("08:00/12:00-14:00/18:00 44:00").intervalo_minutos).toBe(120);
    expect(parseJornadaCompacta("16:00/20:00-21:00/00:20 44:00")).toMatchObject({ saida: "00:20", intervalo_minutos: 60 });
  });

  it("quatro horários sem a palavra intervalo, jornada primeiro: deduz o intervalo", () => {
    expect(parseJornadaCompacta("10:00 17:50 12:00 12:30")).toMatchObject({ entrada: "10:00", saida: "17:50", intervalo_minutos: 30 });
  });

  it("intervalo em minutos ou em duração", () => {
    expect(parseJornadaCompacta("das 08:00 as 17:00 intervalo de 60 min").intervalo_minutos).toBe(60);
    expect(parseJornadaCompacta("das 08:00 as 17:00 intervalo 01:00").intervalo_minutos).toBe(60);
  });

  it("nunca devolve intervalo acima de 8 horas: fica vazio e sinaliza", () => {
    const j = parseJornadaCompacta("08:00 12:00 23:00 06:00");
    expect(j.intervalo_minutos).toBeNull();
    expect(j.intervalo_incerto).toBe(true);
  });

  it("jornada com intervalo ilegível vira pendência de horário", () => {
    const j = montarJornadaSugerida({ jornada_texto: "08:00 12:00 23:00 06:00" });
    expect(problemasJornada(j).length).toBeGreaterThan(0);
    expect(problemasJornada(montarJornadaSugerida({ jornada_texto: RANCHO[0][0] }))).toEqual([]);
  });

  it("tabela por dia com intervalo impossível é sinalizada, não enviada", () => {
    const j = montarJornadaSugerida({
      jornada_dias: [{ dia: "Seg", entrada: "10:00", saida: "17:50", intervalo_inicio: "17:50", intervalo_fim: "12:00" }],
    });
    expect(j.dias[1].intervalo_minutos).toBeNull();
    expect(problemasJornada(j).length).toBeGreaterThan(0);
  });
});

describe("finalizar implantação com horário", () => {
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

  it("ficha da Adriana entra com 10:00–17:50 e 30 minutos de intervalo (com a ciência do lote)", () => {
    const p = planejarFichaLote(ficha(RANCHO[0][0]), org, { ...ctx, padroes: { ...ctx.padroes, intervaloReduzidoAceito: true } });
    expect(p.apta).toBe(true);
    if (!("envio" in p)) return;
    const dias = p.envio.jornada?.dias.filter((d) => d.trabalha) ?? [];
    expect(dias.length).toBeGreaterThan(0);
    expect(dias.every((d) => d.entrada === "10:00" && d.saida === "17:50" && d.intervalo_minutos === 30)).toBe(true);
  });

  it("horário ilegível fica para conferência individual com o motivo", () => {
    const p = planejarFichaLote(ficha("08:00 12:00 23:00 06:00"), org, ctx);
    expect(p.apta).toBe(false);
    expect("motivos" in p ? p.motivos : []).toContain("horário de trabalho");
  });
});
