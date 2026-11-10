import { describe, expect, it } from "vitest";
import {
  agruparCargosLote, cargoGenerico, chaveCargoItem, setorSugeridoParaCargo, situacaoFichaLote, turnoPadraoDoLote, vinculoOrganizado,
} from "../organizacao-lote";

const item = (id: string, cargo: string, cbo: string, extra: Record<string, unknown> = {}, status = "pendente") => ({
  id, status, nome_extraido: `Pessoa ${id}`, cpf_extraido: "12345678909",
  dados_extraidos: { nome: `Pessoa ${id}`, cpf: "12345678909", cargo_nome: cargo, cbo, ...extra },
});

describe("organização do lote de fichas", () => {
  it("sugere setores clássicos do food service pelo cargo", () => {
    expect(setorSugeridoParaCargo("AUXILIAR DE COZINHA", "513505")).toBe("Cozinha");
    expect(setorSugeridoParaCargo("AUX. SERVIÇOS COPA", "513425")).toBe("Cozinha");
    expect(setorSugeridoParaCargo("ATENDENTE", "513435")).toBe("Salão e Atendimento");
    expect(setorSugeridoParaCargo("OPERADOR DE CAIXA", "421125")).toBe("Salão e Atendimento");
    expect(setorSugeridoParaCargo("AUXILIAR DE LIMPEZA", "514320")).toBe("Limpeza e Higiene");
    expect(setorSugeridoParaCargo("AUXILIAR DE ALMOXARIFADO", "414105")).toBe("Administração e Apoio");
    expect(setorSugeridoParaCargo("BARMAN", null)).toBe("Bar");
  });

  it("usa o CBO quando o nome não indica o setor", () => {
    expect(setorSugeridoParaCargo("PROFISSIONAL X", "513205")).toBe("Cozinha");
    expect(setorSugeridoParaCargo("PROFISSIONAL X", null)).toBeNull();
  });

  it("nunca trata 'Importação eSocial' como cargo", () => {
    expect(cargoGenerico("Importação eSocial")).toBe(true);
    expect(cargoGenerico("")).toBe(true);
    expect(cargoGenerico("COZINHEIRA")).toBe(false);
    expect(setorSugeridoParaCargo("Importação eSocial", null)).toBeNull();
  });

  it("agrupa por cargo + CBO e separa genéricos ficha a ficha", () => {
    const grupos = agruparCargosLote(
      [
        item("1", "ATENDENTE", "513435", { salario: 1430 }),
        item("2", "Atendente", "5134-35", { salario: "1.708,64" }),
        item("3", "COZINHEIRA", "513205"),
        item("4", "Importação eSocial", ""),
        item("5", "Importação eSocial", ""),
        item("6", "ATENDENTE", "513435", {}, "criado"),
      ],
      [{ id: "c1", nome: "COZINHEIRA", cbo: "513205" }],
    );
    expect(grupos.map((g) => g.itemIds.length)).toEqual([2, 1, 1, 1]);
    expect(grupos[0].salarioMin).toBe(1430);
    expect(grupos[0].salarioMax).toBe(1708.64);
    expect(grupos[1].cargoExistenteId).toBe("c1");
    expect(grupos.filter((g) => g.generico)).toHaveLength(2);
  });

  it("escolha por ficha prevalece sobre a do grupo", () => {
    const a = item("1", "ATENDENTE", "513435");
    const org = {
      grupos: { [chaveCargoItem(a)]: { cargo_id: "g", setor_id: "s" } },
      itens: { "1": { cargo_id: "i", setor_id: null } },
    };
    expect(vinculoOrganizado(a, org)).toEqual({ cargoId: "i", setorId: null });
    expect(vinculoOrganizado(item("2", "ATENDENTE", "513435"), org)).toEqual({ cargoId: "g", setorId: "s" });
  });

  it("ficha sem cargo decidido fica em atenção; com cargo, pronta", () => {
    const a = item("1", "ATENDENTE", "513435");
    expect(situacaoFichaLote(a, {})).toBe("atencao");
    expect(situacaoFichaLote(a, { grupos: { [chaveCargoItem(a)]: { cargo_id: "g", setor_id: null } } })).toBe("pronta");
    expect(situacaoFichaLote(item("2", "X", "", {}, "criado"), {})).toBe("concluida");
  });
});

describe("turno da maioria do lote", () => {
  const turnos = [{ id: "noite" }, { id: "dia" }];
  it("preenche ficha sem horário lido", () => {
    expect(turnoPadraoDoLote(true, "noite", turnos)).toBe("noite");
  });
  it("não substitui o horário lido no PDF", () => {
    expect(turnoPadraoDoLote(false, "noite", turnos)).toBeNull();
  });
  it("ignora turno que não existe mais", () => {
    expect(turnoPadraoDoLote(true, "removido", turnos)).toBeNull();
  });
});
