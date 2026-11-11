import { describe, expect, it } from "vitest";
import {
  aplicarIntervaloMinimo, inconformidadesJornada, montarJornadaSugerida, type JornadaSugerida,
} from "../jornada-parse";
import { pendenciasFichaLote, type ItemLote, type OrganizacaoLote } from "../organizacao-lote";

const codigos = (j: JornadaSugerida, aceito = false) =>
  inconformidadesJornada(j, { intervaloReduzidoAceito: aceito }).map((i) => i.codigo);

const tabela7Dias = (entrada: string, saida: string, intervalo: number) =>
  montarJornadaSugerida({
    jornada_dias: Array.from({ length: 7 }, (_, dow) => ({ dow, entrada, saida, intervalo_minutos: intervalo })),
  });

describe("jornada fora da CLT na conferência da ficha", () => {
  it("08:00–17:00 sem intervalo pede 1h (art. 71)", () => {
    expect(codigos(montarJornadaSugerida({ jornada_texto: "das 08:00 as 17:00", dsr_dia: "Domingo" }))).toContain("intervalo");
  });

  it("08:00/12:00-13:00/16:20 (6 x 7h20 = 44h) com folga no domingo está dentro da CLT", () => {
    expect(codigos(montarJornadaSugerida({ jornada_texto: "08:00/12:00-13:00/16:20", dsr_dia: "Domingo" }))).toEqual([]);
  });

  it("de 4h a 6h trabalhadas exige 15 min de intervalo", () => {
    expect(codigos(montarJornadaSugerida({ jornada_texto: "das 08:00 as 13:00", dsr_dia: "Domingo" }))).toContain("intervalo");
    expect(codigos(montarJornadaSugerida({ jornada_texto: "das 08:00 as 12:00", dsr_dia: "Domingo" }))).toEqual([]);
  });

  it("intervalo acima de 2h é sinalizado", () => {
    expect(codigos(montarJornadaSugerida({ jornada_texto: "08:00/11:00-14:30/18:00", dsr_dia: "Domingo" }))).toContain("intervalo");
  });

  it("30 min acima de 6h é intervalo reduzido; a ciência do lote libera só esse item", () => {
    const j = montarJornadaSugerida({ jornada_texto: "das 16:00 as 23:50 - intervalo: das 18:00 as 18:30" });
    expect(codigos(j)).toEqual(["intervalo_reduzido"]);
    expect(codigos(j, true)).toEqual([]);
  });

  it("intervalo de 20 min acima de 6h não é coberto pela ciência do lote", () => {
    const j = montarJornadaSugerida({ jornada_texto: "das 16:00 as 23:50 - intervalo: das 18:00 as 18:20" });
    expect(codigos(j, true)).toContain("intervalo");
  });

  it("tabela da ficha com os 7 dias trabalhados = semana sem descanso (art. 67)", () => {
    expect(codigos(tabela7Dias("08:00", "12:00", 0))).toContain("descanso_semanal");
  });

  it("linha única sem dia de descanso escrito continua folga definida na escala, sem alerta de descanso", () => {
    const j = montarJornadaSugerida({ jornada_texto: "08:00/10:00-10:15/12:00" });
    expect(codigos(j)).not.toContain("descanso_semanal");
  });

  it("desligar um dia na tabela de 7 dias resolve o descanso", () => {
    const j = tabela7Dias("08:00", "12:00", 0);
    const editada = { ...j, dias: j.dias.map((d) => (d.dow === 0 ? { ...d, trabalha: false, entrada: null, saida: null } : d)) };
    expect(codigos(editada)).not.toContain("descanso_semanal");
  });

  it("atalho de intervalo aplica 1h em 08:00–17:00 e 15 min em 6h10", () => {
    const j = aplicarIntervaloMinimo(montarJornadaSugerida({ jornada_texto: "das 08:00 as 17:00", dsr_dia: "Domingo" }));
    expect(j.dias.filter((d) => d.trabalha).every((d) => d.intervalo_minutos === 60)).toBe(true);
    expect(codigos(j)).not.toContain("intervalo");
    const curta = aplicarIntervaloMinimo(montarJornadaSugerida({ jornada_texto: "das 08:00 as 14:10", dsr_dia: "Domingo" }));
    expect(curta.dias.find((d) => d.trabalha)?.intervalo_minutos).toBe(15);
  });

  it("6h30 sem intervalo recebe 1h (15 min deixaria 6h15 trabalhadas)", () => {
    const j = aplicarIntervaloMinimo(montarJornadaSugerida({ jornada_texto: "das 08:00 as 14:30", dsr_dia: "Domingo" }));
    expect(j.dias.find((d) => d.trabalha)?.intervalo_minutos).toBe(60);
  });
});

describe("lote com jornada fora da CLT", () => {
  const item = (texto: string): ItemLote => ({
    id: "i1", status: "pendente", nome_extraido: "TESTE", cpf_extraido: "12345678909",
    dados_extraidos: { nome: "TESTE", cpf: "12345678909", cargo_nome: "COZINHEIRA", jornada_texto: texto, telefone: "62999990000" },
  } as unknown as ItemLote);
  const org: OrganizacaoLote = { unidade_id: "u1", itens: { i1: { cargo_id: "c1", setor_id: null } }, ajustes: {} };

  it("sem intervalo vira pendência \"intervalo fora da CLT\"", () => {
    const p = pendenciasFichaLote(item("das 08:00 as 17:00"), org, { padroes: { adiantamento: false } });
    expect(p.obrigatorias).toContain("intervalo fora da CLT");
  });

  it("30 min vira \"intervalo de 30 min\" e some com a ciência do lote", () => {
    const texto = "das 16:00 as 23:50 - intervalo: das 18:00 as 18:30";
    expect(pendenciasFichaLote(item(texto), org, { padroes: { adiantamento: false } }).obrigatorias).toContain("intervalo de 30 min");
    expect(
      pendenciasFichaLote(item(texto), org, { padroes: { adiantamento: false, intervaloReduzidoAceito: true } }).obrigatorias,
    ).not.toContain("intervalo de 30 min");
  });
});
