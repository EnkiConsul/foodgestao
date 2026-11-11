import { describe, expect, it } from "vitest";
import {
  cargosSemLaboral, catalogoIdDoValor, formatarMunicipio, laboralPadraoDaUnidade, resumoAbrangencia, sugerirSindicatos, valorCatalogo,
  type SindicatoCatalogo,
} from "@/lib/dp/sindicatos-catalogo";

const base = (p: Partial<SindicatoCatalogo>): SindicatoCatalogo => ({
  id: p.nome ?? "x", nome: "X", tipo: "patronal", cnpj: null, uf: "GO", municipios: [],
  contato_telefone: null, data_base_mes: null, ...p,
});

const SINDTUR = base({ id: "sindtur", nome: "SINDTUR", cnpj: "01641091000107", municipios: ["APARECIDA DE GOIÂNIA", "PIRES DO RIO"] });
const SINDIBARES = base({ id: "sindibares", nome: "SINDIBARES", cnpj: "22590755000126", municipios: ["GOIÂNIA"] });
const SECHSEG = base({ id: "sechseg", nome: "SECHSEG", tipo: "laboral", cnpj: "02889400000125", municipios: ["PIRES DO RIO"] });
const OUTRA_UF = base({ id: "df", nome: "SINDHOBAR", uf: "DF", municipios: ["BRASÍLIA"] });
const itens = [SINDIBARES, SINDTUR, SECHSEG, OUTRA_UF];

describe("sugestões da base única de sindicatos", () => {
  it("recomenda primeiro o patronal que já atende a cidade da unidade", () => {
    const r = sugerirSindicatos({ itens, tipo: "patronal", locais: [{ cidade: "Pires do Rio", uf: "GO" }], adotados: [] });
    expect(r.map((s) => s.item.id)).toEqual(["sindtur", "sindibares"]);
    expect(r[0].recomendado).toBe(true);
    expect(r[0].cidadeRecomendada).toBe("Pires do Rio");
    expect(r[1].recomendado).toBe(false);
  });

  it("compara cidade sem acento e sem diferenciar maiúsculas", () => {
    const r = sugerirSindicatos({ itens, tipo: "patronal", locais: [{ cidade: "goiania", uf: "go" }], adotados: [] });
    expect(r[0].item.id).toBe("sindibares");
    expect(r[0].recomendado).toBe(true);
  });

  it("não oferece sindicato de outra UF", () => {
    const r = sugerirSindicatos({ itens, tipo: "patronal", locais: [{ cidade: "Goiânia", uf: "GO" }], adotados: [] });
    expect(r.some((s) => s.item.id === "df")).toBe(false);
  });

  it("some com o que a empresa já usa, pelo vínculo ou pelo mesmo CNPJ", () => {
    const r = sugerirSindicatos({
      itens, tipo: "patronal", locais: [{ cidade: "Pires do Rio", uf: "GO" }],
      adotados: [{ catalogo_id: "sindibares" }, { cnpj: "01.641.091/0001-07" }],
    });
    expect(r).toEqual([]);
  });

  it("filtra pelo tipo: laboral só traz laboral", () => {
    const r = sugerirSindicatos({ itens, tipo: "laboral", locais: [{ cidade: "Pires do Rio", uf: "GO" }], adotados: [] });
    expect(r.map((s) => s.item.id)).toEqual(["sechseg"]);
  });

  it("sem local conhecido mostra todos do tipo", () => {
    const r = sugerirSindicatos({ itens, tipo: "patronal", locais: [], adotados: [] });
    expect(r.map((s) => s.item.id).sort()).toEqual(["df", "sindibares", "sindtur"]);
  });
});

describe("apresentação da abrangência", () => {
  it("formata município com preposições minúsculas", () => {
    expect(formatarMunicipio("APARECIDA DE GOIÂNIA")).toBe("Aparecida de Goiânia");
  });
  it("destaca a cidade da unidade no resumo", () => {
    expect(resumoAbrangencia(SINDTUR, "Pires do Rio")).toBe("Atende Pires do Rio e Aparecida de Goiânia");
  });
  it("resume muitas cidades", () => {
    expect(resumoAbrangencia(base({ municipios: ["A", "B", "C", "D"] }))).toBe("Atende A e mais 3 cidades");
  });
  it("valor de opção da base é reconhecido", () => {
    expect(catalogoIdDoValor(valorCatalogo("abc"))).toBe("abc");
    expect(catalogoIdDoValor("abc")).toBeNull();
  });
});

describe("cargos sem sindicato laboral", () => {
  const cargos = [
    { id: "garcom", nome: "GARÇOM", ativo: true },
    { id: "cozinheiro", nome: "COZINHEIRO", ativo: true },
    { id: "antigo", nome: "ANTIGO", ativo: false },
  ];

  it("lista só cargos ativos sem nenhum vínculo laboral", () => {
    const r = cargosSemLaboral(cargos, [{ cargo_id: "garcom", sindicato_id: "sechseg" }], ["sechseg"]);
    expect(r.map((c) => c.id)).toEqual(["cozinheiro"]);
  });

  it("vínculo com sindicato patronal não conta como enquadramento laboral", () => {
    const r = cargosSemLaboral(cargos, [{ cargo_id: "garcom", sindicato_id: "sindtur" }], ["sechseg"]);
    expect(r.map((c) => c.id)).toEqual(["garcom", "cozinheiro"]);
  });
});

describe("laboral já marcado no lote de fichas", () => {
  const catalogo = [
    { id: "cat-sechseg", uf: "GO", municipios: ["PIRES DO RIO", "GOIANIA"] },
    { id: "cat-outro", uf: "GO", municipios: ["ANÁPOLIS"] },
  ];

  it("escolhe o laboral da empresa que atende a cidade da unidade", () => {
    const id = laboralPadraoDaUnidade({
      sindicatos: [
        { id: "sechseg", tipo: "laboral", ativo: true, catalogo_id: "cat-sechseg" },
        { id: "outro", tipo: "laboral", ativo: true, catalogo_id: "cat-outro" },
        { id: "sindtur", tipo: "patronal", ativo: true, catalogo_id: null },
      ],
      catalogo,
      local: { cidade: "Pires do Rio", uf: "GO" },
    });
    expect(id).toBe("sechseg");
  });

  it("com um único laboral ativo na empresa, usa esse mesmo sem a cidade na base", () => {
    const id = laboralPadraoDaUnidade({
      sindicatos: [{ id: "proprio", tipo: "laboral", ativo: true, catalogo_id: null }],
      catalogo,
      local: { cidade: "Catalão", uf: "GO" },
    });
    expect(id).toBe("proprio");
  });

  it("com dois laborais e nenhum atendendo a cidade, não escolhe sozinho", () => {
    const id = laboralPadraoDaUnidade({
      sindicatos: [
        { id: "a", tipo: "laboral", ativo: true, catalogo_id: null },
        { id: "b", tipo: "laboral", ativo: true, catalogo_id: null },
      ],
      catalogo,
      local: { cidade: "Catalão", uf: "GO" },
    });
    expect(id).toBeNull();
  });

  it("laboral inativo nunca é escolhido", () => {
    const id = laboralPadraoDaUnidade({
      sindicatos: [{ id: "sechseg", tipo: "laboral", ativo: false, catalogo_id: "cat-sechseg" }],
      catalogo,
      local: { cidade: "Pires do Rio", uf: "GO" },
    });
    expect(id).toBeNull();
  });
});
