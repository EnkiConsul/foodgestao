import { describe, expect, it } from "vitest";
import {
  escolhasObrigatoriasFaltando,
  mensagemEscolhasObrigatorias,
} from "@/lib/dp/ficha-registro/validacao";

describe("validação da revisão da ficha", () => {
  it("informa somente as escolhas realmente ausentes", () => {
    const faltando = escolhasObrigatoriasFaltando({
      regime: "clt",
      formaPagamento: "mensalista",
      possuiFolhaPonto: false,
      optanteAdiantamento: null,
    });
    expect(faltando).toEqual(["adiantamento salarial"]);
    expect(mensagemEscolhasObrigatorias(faltando)).toBe(
      "Selecione adiantamento salarial antes de criar o cadastro.",
    );
  });

  it("aceita escolhas booleanas negativas como preenchidas", () => {
    expect(escolhasObrigatoriasFaltando({
      regime: "clt",
      formaPagamento: "mensalista",
      possuiFolhaPonto: false,
      optanteAdiantamento: false,
    })).toEqual([]);
  });
});
