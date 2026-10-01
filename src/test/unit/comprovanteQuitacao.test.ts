import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  brlParaCents,
  centsParaBRL,
  exigeRecibo,
  modalidadeLabel,
  resumoQuitacao,
  validarQuitacao,
} from "@/lib/dp/comprovante-quitacao";

describe("valores em dinheiro", () => {
  it("lê o valor digitado pelo gestor", () => {
    expect(brlParaCents("1.234,56")).toBe(123456);
    expect(brlParaCents("R$ 80")).toBe(8000);
    expect(brlParaCents("0,50")).toBe(50);
  });

  it("recusa valor inválido", () => {
    expect(brlParaCents("")).toBeNull();
    expect(brlParaCents("abc")).toBeNull();
    expect(brlParaCents("-10")).toBeNull();
  });

  it("formata centavos em reais", () => {
    expect(centsParaBRL(123456).replace(/\u00A0/g, " ")).toBe("R$ 1.234,56");
  });
});

describe("forma de pagamento", () => {
  it("aceita pagamento só na conta sem exigir valor", () => {
    const r = validarQuitacao({ modalidade: "bancario", bancarioCents: null, especieCents: 5000 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.especieCents).toBeNull();
  });

  it("exige o valor em dinheiro na modalidade espécie", () => {
    expect(validarQuitacao({ modalidade: "especie", bancarioCents: null, especieCents: null }).ok).toBe(false);
    const r = validarQuitacao({ modalidade: "especie", bancarioCents: 9000, especieCents: 5000 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.bancarioCents).toBeNull();
  });

  it("exige os dois valores no pagamento misto", () => {
    expect(validarQuitacao({ modalidade: "misto", bancarioCents: null, especieCents: 5000 }).ok).toBe(false);
    expect(validarQuitacao({ modalidade: "misto", bancarioCents: 5000, especieCents: null }).ok).toBe(false);
    expect(validarQuitacao({ modalidade: "misto", bancarioCents: 5000, especieCents: 3000 }).ok).toBe(true);
  });

  it("pagamento com dinheiro pede recibo", () => {
    expect(exigeRecibo("bancario")).toBe(false);
    expect(exigeRecibo("especie")).toBe(true);
    expect(exigeRecibo("misto")).toBe(true);
  });

  it("descreve a quitação em linguagem de negócio", () => {
    const frase = resumoQuitacao({
      modalidade: "misto",
      valor_bancario_cents: 20000,
      valor_especie_cents: 10000,
    });
    expect(frase).toContain("Misto");
    expect(frase).toContain("na conta");
    expect(frase).toContain("em dinheiro");
    expect(resumoQuitacao({ modalidade: null })).toContain("não informada");
    expect(modalidadeLabel("especie")).toBe("Dinheiro (Espécie)");
  });
});

describe("recibo em dinheiro e certificado", () => {
  it("o recibo cita o artigo 464 da CLT e tem campo de assinatura", () => {
    const src = readFileSync("supabase/functions/dp-recibo-especie/index.ts", "utf8");
    expect(src).toContain("artigo 464");
    expect(src).toContain("Assinatura do colaborador");
    expect(src).toContain("exige_aceite");
  });

  it("o certificado mostra a data e a forma de pagamento", () => {
    const src = readFileSync("supabase/functions/dp-documento-certificado/index.ts", "utf8");
    expect(src).toContain("Data do pagamento");
    expect(src).toContain("Forma de pagamento");
    expect(src).toContain("resumoQuitacao");
  });

  it("a leitura automática aceita foto e print, e nunca grava sozinha", () => {
    const src = readFileSync("supabase/functions/dp-comprovante-ler/index.ts", "utf8");
    expect(src).toContain("input_image");
    expect(src).toContain("input_file");
    expect(src).not.toContain(".rpc(");
    expect(src).not.toContain(".insert(");
  });
});
