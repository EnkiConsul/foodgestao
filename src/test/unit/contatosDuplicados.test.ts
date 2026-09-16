import { describe, it, expect } from "vitest";
import { normalizeNomeContato, mesmoNomeContato, prefixoBuscaNome } from "@/lib/contacts/duplicados";

describe("duplicidade de contatos por nome", () => {
  it("normaliza acentos, pontuação e espaços", () => {
    expect(normalizeNomeContato("  Aléssandra   Cnpj. ")).toBe("ALESSANDRA CNPJ");
  });

  it("ignora sufixos societários no fim", () => {
    expect(normalizeNomeContato("Four Pixel Tecnologia LTDA")).toBe("FOUR PIXEL TECNOLOGIA");
    expect(mesmoNomeContato("Portão 3 ME", "PORTAO 3")).toBe(true);
  });

  it("não considera nomes diferentes como iguais", () => {
    expect(mesmoNomeContato("Portão 3", "Portão 4")).toBe(false);
  });

  it("nome vazio nunca é duplicado", () => {
    expect(mesmoNomeContato("", "")).toBe(false);
  });

  it("prefixo de busca usa a primeira palavra canônica", () => {
    expect(prefixoBuscaNome("Aléssandra Cnpj")).toBe("ALESSANDRA");
  });
});
