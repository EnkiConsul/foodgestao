import { describe, expect, it } from "vitest";
import { destinoMenuVertical, indiceMenuAtual } from "@/lib/nav/menuSwipe";

const rotas = ["/dp/cadastros", "/dp/documentos/inicio", "/dp/rotina", "/dp/comunicacao", "/dp/geral"];
const homeTo = "/dp";

describe("destinoMenuVertical", () => {
  it("do Início, para cima abre o primeiro menu", () => {
    expect(destinoMenuVertical({ rotas, pathname: homeTo, direcao: "cima", homeTo })).toBe("/dp/cadastros");
  });

  it("do Início, para baixo não navega (fica o atualizar)", () => {
    expect(destinoMenuVertical({ rotas, pathname: homeTo, direcao: "baixo", homeTo })).toBeNull();
  });

  it("avança sequencialmente para cima", () => {
    expect(destinoMenuVertical({ rotas, pathname: "/dp/cadastros", direcao: "cima", homeTo })).toBe(
      "/dp/documentos/inicio",
    );
    expect(destinoMenuVertical({ rotas, pathname: "/dp/rotina", direcao: "cima", homeTo })).toBe("/dp/comunicacao");
  });

  it("para no último menu", () => {
    expect(destinoMenuVertical({ rotas, pathname: "/dp/geral", direcao: "cima", homeTo })).toBeNull();
  });

  it("volta ao anterior e do primeiro volta ao Início", () => {
    expect(destinoMenuVertical({ rotas, pathname: "/dp/rotina", direcao: "baixo", homeTo })).toBe(
      "/dp/documentos/inicio",
    );
    expect(destinoMenuVertical({ rotas, pathname: "/dp/cadastros", direcao: "baixo", homeTo })).toBe(homeTo);
  });

  it("ignora telas que não são de menu", () => {
    expect(destinoMenuVertical({ rotas, pathname: "/dp/colaboradores", direcao: "cima", homeTo })).toBeNull();
    expect(destinoMenuVertical({ rotas, pathname: "/dp/colaboradores", direcao: "baixo", homeTo })).toBeNull();
  });

  it("reconhece rotas filhas pelo prefixo", () => {
    expect(indiceMenuAtual(rotas, "/dp/documentos/inicio")).toBe(1);
    expect(indiceMenuAtual(rotas, "/dp/rotina/algo")).toBe(2);
  });
});
