import { describe, expect, it } from "vitest";
import {
  agruparPorColaborador,
  agruparPorTipo,
  contarAbertas,
  filtrarAbertas,
  isPendenciaAdiada,
  opcoesFiltro,
  urgenciaDe,
  type PendenciaLike,
} from "../pendencias";

const mk = (over: Partial<PendenciaLike> = {}): PendenciaLike => ({
  id: "p1",
  tipo: "Solicitação",
  titulo: "Título",
  subtitulo: "Sub",
  vencimento: null,
  atrasoDias: 0,
  url: "/dp/x",
  ...over,
});

describe("urgenciaDe", () => {
  it("classifica atrasada / hoje / próxima", () => {
    expect(urgenciaDe(mk({ atrasoDias: 3 }))).toBe("atrasada");
    expect(urgenciaDe(mk({ atrasoDias: 1 }))).toBe("atrasada");
    expect(urgenciaDe(mk({ atrasoDias: 0 }))).toBe("hoje");
    expect(urgenciaDe(mk({ atrasoDias: -2 }))).toBe("proxima");
  });
});

describe("isPendenciaAdiada / filtrarAbertas / contarAbertas", () => {
  const agora = new Date("2026-09-10T12:00:00Z");

  it("adiada somente quando a data é futura", () => {
    const futuro = { p1: "2026-09-20T00:00:00Z" };
    const passado = { p1: "2026-09-01T00:00:00Z" };
    expect(isPendenciaAdiada("p1", futuro, agora)).toBe(true);
    expect(isPendenciaAdiada("p1", passado, agora)).toBe(false);
    expect(isPendenciaAdiada("p1", null, agora)).toBe(false);
    expect(isPendenciaAdiada("p1", { p1: "lixo" }, agora)).toBe(false);
  });

  it("fonte única: aberta = não adiada (mesma regra do card e do KPI)", () => {
    const itens = [mk({ id: "a" }), mk({ id: "b" }), mk({ id: "c" })];
    const adiadas = { b: "2026-12-31T00:00:00Z" };
    expect(filtrarAbertas(itens, adiadas, agora).map((p) => p.id)).toEqual(["a", "c"]);
    expect(contarAbertas(itens, adiadas, agora)).toBe(2);
    expect(contarAbertas(itens, null, agora)).toBe(3);
  });
});

describe("agruparPorTipo", () => {
  it("agrupa por assunto real com contagens de urgência, colaboradores e unidades", () => {
    const itens = [
      mk({ id: "1", tipo: "Férias", atrasoDias: 5, colaboradorNome: "Ana" }),
      mk({ id: "2", tipo: "Férias", atrasoDias: 0, colaboradorNome: "Bia" }),
      mk({ id: "3", tipo: "Férias", atrasoDias: -3, colaboradorNome: "Ana" }),
      mk({ id: "4", tipo: "Contracheque", atrasoDias: 2, unidadeNome: "Matriz" }),
      mk({ id: "5", tipo: "Contracheque", atrasoDias: -1, unidadeNome: "Matriz" }),
    ];
    const grupos = agruparPorTipo(itens);
    expect(grupos.map((g) => g.tipo)).toEqual(["Férias", "Contracheque"]); // maior atraso primeiro
    const ferias = grupos[0];
    expect(ferias.total).toBe(3);
    expect(ferias.atrasadas).toBe(1);
    expect(ferias.hoje).toBe(1);
    expect(ferias.proximas).toBe(1);
    expect(ferias.colaboradores).toEqual(["Ana", "Bia"]); // distintos
    const contra = grupos[1];
    expect(contra.total).toBe(2);
    expect(contra.unidades).toEqual(["Matriz"]);
    expect(contra.colaboradores).toEqual([]);
  });
});

describe("agruparPorColaborador", () => {
  it("agrupa por colaborador e mantém itens sem colaborador ao final", () => {
    const itens = [
      mk({ id: "1", colaboradorNome: "Ana", atrasoDias: 4 }),
      mk({ id: "2", colaboradorNome: "Ana", atrasoDias: 0 }),
      mk({ id: "3", colaboradorNome: "Bia", atrasoDias: 2 }),
      mk({ id: "4", colaboradorNome: null, atrasoDias: 1 }),
    ];
    const subs = agruparPorColaborador(itens);
    expect(subs.map((s) => s.colaborador)).toEqual(["Ana", "Bia", null]);
    expect(subs[0].itens.map((i) => i.id)).toEqual(["1", "2"]); // ordenado por atraso
    expect(subs[0].itens.length).toBe(2);
  });
});

describe("opcoesFiltro", () => {
  it("extrai opções únicas e ordenadas de tipo, colaborador e unidade", () => {
    const itens = [
      mk({ tipo: "Férias", colaboradorNome: "Bia", unidadeNome: "Matriz" }),
      mk({ tipo: "ASO", colaboradorNome: "Ana", unidadeNome: null }),
      mk({ tipo: "Férias", colaboradorNome: "Ana", unidadeNome: "Matriz" }),
    ];
    const op = opcoesFiltro(itens);
    expect(op.tipos).toEqual(["ASO", "Férias"]);
    expect(op.colaboradores).toEqual(["Ana", "Bia"]);
    expect(op.unidades).toEqual(["Matriz"]);
  });
});
