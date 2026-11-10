import { describe, it, expect } from "vitest";
import { agruparTurnosRotina, completarForaDaOperacao, type PessoaRotina } from "../rotina-dia-agrupamento";

const pessoa = (id: string, extra: Partial<PessoaRotina> = {}): PessoaRotina => ({
  id,
  nome: id.toUpperCase(),
  cargo: "ATENDENTE",
  setor: null,
  entrada: "17:00",
  saida: "00:35",
  origem: "habitual",
  turnoChave: "turno-jantar",
  turnoNome: "JANTAR",
  ...extra,
});

describe("Rotina da loja — agrupamento por turno", () => {
  it("quem tem o mesmo horário sem turno cadastrado entra no turno nomeado", () => {
    const turnos = agruparTurnosRotina([
      pessoa("hanna"),
      pessoa("luiz"),
      pessoa("veronica", { turnoChave: "h:17:00-00:35", turnoNome: null }),
    ]);
    expect(turnos).toHaveLength(1);
    expect(turnos[0].pessoas.map((p) => p.id)).toEqual(["hanna", "luiz", "veronica"]);
  });

  it("horário diferente sem turno continua em card próprio", () => {
    const turnos = agruparTurnosRotina([
      pessoa("hanna"),
      pessoa("ana", { turnoChave: "h:11:00-15:00", turnoNome: null, entrada: "11:00", saida: "15:00" }),
    ]);
    expect(turnos).toHaveLength(2);
    expect(turnos[0].nome).toBe("11:00 às 15:00");
  });

  it("dois turnos com o mesmo horário: quem não tem turno não é encaixado em nenhum", () => {
    const turnos = agruparTurnosRotina([
      pessoa("a", { turnoChave: "t1", turnoNome: "JANTAR" }),
      pessoa("b", { turnoChave: "t2", turnoNome: "SALÃO" }),
      pessoa("c", { turnoChave: "h:17:00-00:35", turnoNome: null }),
    ]);
    expect(turnos).toHaveLength(3);
  });
});

describe("Rotina da loja — fora da operação", () => {
  it("colega de folga semanal fixa no calendário aparece como Folga para permitir a troca", () => {
    const fora = completarForaDaOperacao([], [pessoa("hanna")], [{ id: "cristiane", nome: "CRISTIANE" }]);
    expect(fora).toEqual([{ id: "cristiane", nome: "CRISTIANE", cargo: "", situacao: "folga" }]);
  });

  it("não duplica quem o servidor já listou nem acrescenta quem está trabalhando", () => {
    const fora = completarForaDaOperacao(
      [{ id: "cristiane", nome: "CRISTIANE", cargo: "ATENDENTE", situacao: "folga" }],
      [pessoa("hanna")],
      [{ id: "cristiane", nome: "CRISTIANE" }, { id: "hanna", nome: "HANNA" }],
    );
    expect(fora).toHaveLength(1);
    expect(fora[0].cargo).toBe("ATENDENTE");
  });
});
