import { describe, it, expect } from "vitest";
import {
  parseJornadaCompacta, montarJornadaSugerida, normalizeHora, parseDow, viraMeiaNoite, minutosEntre,
} from "@/lib/dp/ficha-registro/jornada-parse";
import { matchCargo, similaridadeNome } from "@/lib/dp/ficha-registro/cargo-match";
import { parseEnderecoTexto, montarEndereco, normalizeCep } from "@/lib/dp/ficha-registro/endereco-parse";
import { nivelDoCampo, situacaoDaFicha } from "@/lib/dp/ficha-registro/confianca";

describe("jornada da ficha de registro", () => {
  it("lê o formato compacto com intervalo", () => {
    expect(parseJornadaCompacta("08:00/12:00-14:00/18:00 44:00")).toEqual({
      entrada: "08:00", saida: "18:00", intervalo_minutos: 120,
    });
  });

  it("lê 'das 17:00 as 00:35' e marca virada de meia-noite", () => {
    const j = parseJornadaCompacta("das 17:00 as 00:35");
    expect(j.entrada).toBe("17:00");
    expect(j.saida).toBe("00:35");
    expect(viraMeiaNoite(j.entrada, j.saida)).toBe(true);
    expect(minutosEntre("17:00", "00:35")).toBe(455);
  });

  it("ignora a carga semanal ao final", () => {
    expect(parseJornadaCompacta("16:00/20:00-21:00/00:20 44:00").saida).toBe("00:20");
  });

  it("normaliza hora e dia da semana", () => {
    expect(normalizeHora("8:05")).toBe("08:05");
    expect(normalizeHora("25:00")).toBeNull();
    expect(parseDow("Sáb")).toBe(6);
    expect(parseDow("segunda-feira")).toBe(1);
    expect(parseDow("xx")).toBeNull();
  });

  it("monta a semana pela tabela por dia, com folga", () => {
    const j = montarJornadaSugerida({
      jornada_texto: "das 17:00 as 00:35",
      jornada_dias: [
        { dia: "Dom", tipo: "Trabalhado", entrada: "16:30", intervalo_inicio: "18:00", intervalo_fim: "18:30", saida: "00:35" },
        { dia: "Seg", tipo: "Folga" },
      ],
    });
    const dom = j.dias.find((d) => d.dow === 0)!;
    expect(dom.trabalha).toBe(true);
    expect(dom.entrada).toBe("16:30");
    expect(dom.intervalo_minutos).toBe(30);
    expect(j.dias.find((d) => d.dow === 1)!.trabalha).toBe(false);
    // dias sem detalhe herdam a linha compacta
    expect(j.dias.find((d) => d.dow === 3)!.entrada).toBe("17:00");
    expect(j.vazia).toBe(false);
  });

  it("marca jornada vazia quando não há horário algum", () => {
    expect(montarJornadaSugerida({ jornada_texto: null, jornada_dias: [] }).vazia).toBe(true);
  });
});

describe("correspondência de cargo", () => {
  const cargos = [
    { id: "a", nome: "Atendente", cbo: "513435" },
    { id: "b", nome: "Copeiro de Bar", cbo: "513425" },
    { id: "c", nome: "Cozinheiro", cbo: null },
  ];

  it("prefere CBO igual com nome parecido", () => {
    const r = matchCargo({ cargo_nome: "COPEIRO(A) DE BAR", cbo: "513425" }, cargos);
    expect(r.cargo_id).toBe("b");
    expect(r.motivo).toBe("cbo_e_nome");
  });

  it("usa o CBO quando o nome não bate", () => {
    const r = matchCargo({ cargo_nome: "AUXILIAR GERAL", cbo: "513435" }, cargos);
    expect(r.cargo_id).toBe("a");
    expect(r.motivo).toBe("cbo");
  });

  it("cai no nome quando não há CBO", () => {
    const r = matchCargo({ cargo_nome: "COZINHEIRO", cbo: null }, cargos);
    expect(r.cargo_id).toBe("c");
    expect(r.motivo).toBe("nome");
  });

  it("não adivinha quando nada se parece", () => {
    const r = matchCargo({ cargo_nome: "MOTORISTA CARRETEIRO", cbo: "999999" }, cargos);
    expect(r.cargo_id).toBeNull();
    expect(r.motivo).toBe("nenhum");
    expect(similaridadeNome("Atendente", "Atendente")).toBe(1);
  });
});

describe("endereço da ficha", () => {
  it("quebra a linha única", () => {
    const e = parseEnderecoTexto("Rua R 14 Q 13, 258 - LT, JARDIM IPANEMA, Valparaiso de Goiás - GO, CEP: 72.872-057");
    expect(e.logradouro).toBe("Rua R 14 Q 13");
    expect(e.numero).toBe("258");
    expect(e.cep).toBe("72872-057");
    expect(e.uf).toBe("GO");
    expect(e.cidade).toContain("Valparaiso");
    expect(e.texto).toBeTruthy();
  });

  it("prioriza os campos já separados", () => {
    const e = montarEndereco({ bairro: "GARAVELO", cep: "74932450", texto: "28 E QD 124 LT 20, GARAVELO, APARECIDA DE GOIANIA, GO" });
    expect(e.bairro).toBe("GARAVELO");
    expect(e.cep).toBe("74932-450");
    expect(normalizeCep("123")).toBeNull();
  });
});

describe("confiança da leitura", () => {
  it("classifica campo ausente e campo lido", () => {
    expect(nivelDoCampo("", {}, "nome")).toBe("ausente");
    expect(nivelDoCampo("Maria", { nome: "alta" }, "nome")).toBe("alta");
    expect(nivelDoCampo("Maria", {}, "nome")).toBe("media");
  });

  it("manda para revisão quando falta o essencial", () => {
    expect(situacaoDaFicha({ dados: { nome: "Maria", cpf: "" }, confianca: {} })).toBe("revisar");
    expect(situacaoDaFicha({ dados: { nome: "Maria", cpf: "1" }, confianca: { cpf: "alta" } })).toBe("pendente");
    expect(situacaoDaFicha({ dados: { nome: "Maria", cpf: "1" }, duplicado: true })).toBe("duplicado");
  });
});
