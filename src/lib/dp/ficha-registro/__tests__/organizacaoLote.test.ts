import { describe, expect, it } from "vitest";
import {
  agruparCargosLote, ajustesEmGrupo, cargoGenerico, chaveCargoItem, contatoValido, escolhaDaFicha, pendenciasFichaLote,
  SETORES_FOOD, setoresDoLote, setorSugeridoParaCargo, situacaoFichaLote, turnoPadraoDoLote, vinculoOrganizado,
} from "../organizacao-lote";

const item = (id: string, cargo: string, cbo: string, extra: Record<string, unknown> = {}, status = "pendente") => ({
  id, status, nome_extraido: `Pessoa ${id}`, cpf_extraido: "12345678909",
  dados_extraidos: { nome: `Pessoa ${id}`, cpf: "12345678909", telefone: "64999990000", cargo_nome: cargo, cbo, ...extra },
});

describe("organização do lote de fichas", () => {
  it("setores do lote têm sempre uma única palavra", () => {
    for (const n of SETORES_FOOD) expect(n.trim().split(/\s+/)).toHaveLength(1);
  });

  it("sugere setores clássicos do food service pelo cargo", () => {
    expect(setorSugeridoParaCargo("AUXILIAR DE COZINHA", "513505")).toBe("Cozinha");
    expect(setorSugeridoParaCargo("AUX. SERVIÇOS COPA", "513425")).toBe("Cozinha");
    expect(setorSugeridoParaCargo("AUXILIAR DE LIMPEZA", "514320")).toBe("Limpeza");
    expect(setorSugeridoParaCargo("AUXILIAR DE ALMOXARIFADO", "414105")).toBe("Administração");
    expect(setorSugeridoParaCargo("BARMAN", null)).toBe("Bar");
  });

  it("funções específicas de mesa vão para Salão", () => {
    expect(setorSugeridoParaCargo("GARÇOM", null)).toBe("Salão");
    expect(setorSugeridoParaCargo("GARÇONETE", null)).toBe("Salão");
    expect(setorSugeridoParaCargo("CUMIM", "513415")).toBe("Salão");
    expect(setorSugeridoParaCargo("MAÎTRE", null)).toBe("Salão");
    expect(setorSugeridoParaCargo("PROFISSIONAL X", "513405")).toBe("Salão");
  });

  it("cargos genéricos da frente de loja vão para Atendimento", () => {
    expect(setorSugeridoParaCargo("ATENDENTE", "513435")).toBe("Atendimento");
    expect(setorSugeridoParaCargo("OPERADOR DE CAIXA", "421125")).toBe("Atendimento");
    expect(setorSugeridoParaCargo("RECEPCIONISTA", null)).toBe("Atendimento");
    expect(setorSugeridoParaCargo("ENTREGADOR", null)).toBe("Atendimento");
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

  it("ficha sem cargo decidido fica em atenção; com tudo definido, pronta", () => {
    const a = item("1", "ATENDENTE", "513435", { pis_nit: "123" });
    const org = { grupos: { [chaveCargoItem(a)]: { cargo_id: "g", setor_id: null } } };
    const ctx = { padroes: { adiantamento: false }, formaPagamento: "mensalista" };
    expect(situacaoFichaLote(a, {}, ctx)).toBe("atencao");
    expect(situacaoFichaLote(a, org, ctx)).toBe("pronta");
    expect(situacaoFichaLote(item("2", "X", "", {}, "criado"), {})).toBe("concluida");
  });

  it("sem adiantamento definido a ficha não é 'pronta' e diz o motivo", () => {
    const a = item("1", "ATENDENTE", "513435", { pis_nit: "123" });
    const org = { grupos: { [chaveCargoItem(a)]: { cargo_id: "g", setor_id: null } } };
    const ctx = { formaPagamento: "mensalista" };
    expect(situacaoFichaLote(a, org, ctx)).toBe("atencao");
    expect(pendenciasFichaLote(a, org, ctx).obrigatorias).toEqual(["adiantamento salarial"]);
    expect(situacaoFichaLote(a, org, { ...ctx, padroes: { adiantamento: true } })).toBe("pronta");
  });

  it("vínculo vem do padrão do lote quando a ficha não indica CLT", () => {
    const a = item("1", "ATENDENTE", "513435");
    const org = { grupos: { [chaveCargoItem(a)]: { cargo_id: "g", setor_id: null } } };
    const ctx = { padroes: { adiantamento: false }, formaPagamento: "mensalista" };
    expect(pendenciasFichaLote(a, org, ctx).obrigatorias).toEqual(["vínculo"]);
    expect(situacaoFichaLote(a, org, { ...ctx, padroes: { ...ctx.padroes, regime: "clt" } })).toBe("pronta");
  });

  it("unidade com ponto pede a folha de ponto na ficha", () => {
    const a = item("1", "ATENDENTE", "513435", { pis_nit: "123" });
    const org = { grupos: { [chaveCargoItem(a)]: { cargo_id: "g", setor_id: null } } };
    const ctx = { padroes: { adiantamento: false, unidadeTemPonto: true }, formaPagamento: "mensalista" };
    expect(pendenciasFichaLote(a, org, ctx).obrigatorias).toEqual(["folha de ponto"]);
  });

  it("lista o que não veio na ficha sem travar a situação", () => {
    const a = item("1", "ATENDENTE", "513435", { pis_nit: "123", salario: 1500, telefone: "" });
    const org = { grupos: { [chaveCargoItem(a)]: { cargo_id: "g", setor_id: "s" } } };
    const p = pendenciasFichaLote(a, org, { padroes: { adiantamento: false }, formaPagamento: "mensalista" });
    expect(p.obrigatorias).toEqual([]);
    expect(p.complementares).toEqual(expect.arrayContaining(["telefone ou WhatsApp", "e-mail", "endereço"]));
    expect(p.complementares).not.toContain("salário");
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

describe("dados de acesso, padrões salvos e ajustes em grupo", () => {
  const a = item("1", "ATENDENTE", "513435", { pis_nit: "123", telefone: "" });
  const grupo = { [chaveCargoItem(a)]: { cargo_id: "g", setor_id: "s" } };
  const ctx = { padroes: { adiantamento: false }, formaPagamento: "mensalista" };

  it("sem telefone, WhatsApp e e-mail a ficha não aparece como pronta", () => {
    expect(situacaoFichaLote(a, { grupos: grupo }, ctx)).toBe("acesso");
    expect(pendenciasFichaLote(a, { grupos: grupo }, ctx).semAcesso).toBe(true);
  });

  it("contato salvo no lote libera a ficha sem mexer no que veio do PDF", () => {
    const org = { grupos: grupo, ajustes: { "1": { dados: { whatsapp: "64988887777" } } } };
    expect(situacaoFichaLote(a, org, ctx)).toBe("pronta");
    expect((a.dados_extraidos as Record<string, unknown>).whatsapp).toBeUndefined();
  });

  it("e-mail sozinho também conta como dado de acesso", () => {
    const org = { grupos: grupo, ajustes: { "1": { dados: { email: "ana@exemplo.com" } } } };
    expect(situacaoFichaLote(a, org, ctx)).toBe("pronta");
  });

  it("escolha da ficha vence o padrão do lote; padrão vale onde a ficha não escolheu", () => {
    const org = { padroes: { regime: "clt" }, ajustes: { "1": { regime: "intermitente" } } };
    expect(escolhaDaFicha(a, org, "regime")).toBe("intermitente");
    expect(escolhaDaFicha(item("2", "X", ""), org, "regime")).toBe("clt");
    expect(escolhaDaFicha(item("2", "X", ""), {}, "regime")).toBeUndefined();
  });

  it("adiantamento escolhido para a ficha conta na situação", () => {
    const b = item("1", "ATENDENTE", "513435", { pis_nit: "123" });
    const sem = { formaPagamento: "mensalista" };
    expect(situacaoFichaLote(b, { grupos: grupo }, sem)).toBe("atencao");
    expect(situacaoFichaLote(b, { grupos: grupo, ajustes: { "1": { adiantamento: true } } }, sem)).toBe("pronta");
  });

  it("cargo e setor ajustados na ficha vencem os do grupo", () => {
    const org = { grupos: grupo, ajustes: { "1": { setor_id: "outro" } } };
    expect(vinculoOrganizado(a, org)).toEqual({ cargoId: "g", setorId: "outro" });
  });

  it("ação em grupo aplica só o escolhido e nunca troca o horário lido no PDF", () => {
    const r = ajustesEmGrupo(["1", "2"], { turno_id: "t1", adiantamento: false }, (id) => id === "2");
    expect(r.itens).toEqual({ "1": { turno_id: "t1", adiantamento: false }, "2": { adiantamento: false } });
    expect(r.turnoMantido).toBe(1);
  });

  it("atalhos por setor contam só fichas pendentes, sem setor por último", () => {
    const x = item("1", "GARÇOM", "");
    const y = item("2", "GARÇOM", "");
    const z = item("3", "AUX", "");
    const w = item("4", "AUX", "", {}, "criado");
    const org = { itens: { "1": { cargo_id: "c", setor_id: "salao" }, "2": { cargo_id: "c", setor_id: "salao" } } };
    const g = setoresDoLote([x, y, z, w], org, [{ id: "salao", nome: "Salão" }]);
    expect(g.map((s) => [s.nome, s.itemIds.length])).toEqual([["Salão", 2], ["Sem setor", 1]]);
  });

  it("contato rápido exige WhatsApp com DDD ou e-mail válido", () => {
    expect(contatoValido({ whatsapp: "", email: "" })).not.toBeNull();
    expect(contatoValido({ whatsapp: "9999-0000", email: "" })).not.toBeNull();
    expect(contatoValido({ whatsapp: "(64) 99999-0000", email: "" })).toBeNull();
    expect(contatoValido({ whatsapp: "", email: "ana@" })).not.toBeNull();
    expect(contatoValido({ whatsapp: "", email: "ana@exemplo.com" })).toBeNull();
  });
});
