import { describe, it, expect } from "vitest";
import {
  parseNumberBR,
  normalizeMonthKey,
  isNoise,
  sha1,
  parseLinesToEntries,
} from "./nubankParser";

describe("parseNumberBR", () => {
  it("parses BR-formatted numbers", () => {
    expect(parseNumberBR("1.234,56")).toBe(1234.56);
    expect(parseNumberBR("0,50")).toBe(0.5);
    expect(parseNumberBR("1.000.000,00")).toBe(1000000);
  });

  it("handles signed amounts", () => {
    expect(parseNumberBR("-50,00")).toBe(-50);
    expect(parseNumberBR("+10,25")).toBe(10.25);
  });

  it("returns 0 for garbage", () => {
    expect(parseNumberBR("abc")).toBe(0);
    expect(parseNumberBR("")).toBe(0);
  });
});

describe("normalizeMonthKey", () => {
  it("maps PT-BR month abbreviations", () => {
    expect(normalizeMonthKey("JAN")).toBe("01");
    expect(normalizeMonthKey("dez")).toBe("12");
    expect(normalizeMonthKey("Mai")).toBe("05");
  });

  it("returns null for unknown", () => {
    expect(normalizeMonthKey("XYZ")).toBeNull();
  });
});

describe("isNoise", () => {
  it("flags header/footer noise", () => {
    expect(isNoise("Extrato gerado dia 10/07/2026")).toBe(true);
    expect(isNoise("1 de 14")).toBe(true);
    expect(isNoise("Saldo inicial R$ 100,00")).toBe(true);
    expect(isNoise("nubank.com.br")).toBe(true);
  });

  it("does NOT flag transaction rows", () => {
    expect(isNoise("Pix recebido João Silva 50,00")).toBe(false);
    expect(isNoise("05 JUN 2026")).toBe(false);
  });
});

describe("sha1", () => {
  it("produces stable hex digests", async () => {
    const h = await sha1("hello");
    expect(h).toBe("aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d");
  });

  it("is deterministic for identical inputs", async () => {
    const a = await sha1("2026-06-05|receita|100.00|PIX RECEBIDO");
    const b = await sha1("2026-06-05|receita|100.00|PIX RECEBIDO");
    expect(a).toBe(b);
  });
});

describe("parseLinesToEntries", () => {
  it("returns [] when no date header is present", async () => {
    const entries = await parseLinesToEntries([
      "Extrato gerado dia 10/07/2026",
      "Saldo inicial 100,00",
    ]);
    expect(entries).toEqual([]);
  });

  it("ignores summary rows before the first date header", async () => {
    // Before any date, "Total de entradas" must NOT switch sign state,
    // otherwise summary numbers get imported as fake transactions.
    const entries = await parseLinesToEntries([
      "Saldo inicial 1.000,00",
      "Total de entradas 500,00",
      "Total de saídas 200,00",
      "Saldo final 1.300,00",
    ]);
    expect(entries).toEqual([]);
  });

  it("parses a receita (credit) entry", async () => {
    const entries = await parseLinesToEntries([
      "05 JUN 2026 Total de entradas",
      "Pix recebido João Silva 12.345.678/0001-90 150,00",
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      date: "2026-06-05",
      amount: 150,
      transaction_type: "receita",
      counterparty_document: "12.345.678/0001-90",
      counterparty_name: "João Silva",
    });
    expect(entries[0].description).toContain("Pix recebido");
    expect(entries[0].description).toContain("João Silva");
  });

  it("parses a despesa (debit) entry with CPF", async () => {
    const entries = await parseLinesToEntries([
      "05 JUN 2026",
      "Total de saídas",
      "Pix enviado Maria Souza 123.456.789-00 75,50",
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      transaction_type: "despesa",
      amount: 75.5,
      counterparty_document: "123.456.789-00",
    });
  });

  it("switches sign between entradas and saidas within the same day", async () => {
    const entries = await parseLinesToEntries([
      "05 JUN 2026 Total de entradas",
      "Pix recebido Cliente A 100,00",
      "Total de saídas",
      "Pix enviado Fornecedor B 40,00",
    ]);
    expect(entries).toHaveLength(2);
    expect(entries[0].transaction_type).toBe("receita");
    expect(entries[1].transaction_type).toBe("despesa");
  });

  it("carries date across multiple days", async () => {
    const entries = await parseLinesToEntries([
      "05 JUN 2026 Total de entradas",
      "Pix recebido A 10,00",
      "06 JUN 2026 Total de saídas",
      "Pix enviado B 20,00",
    ]);
    expect(entries.map((e) => e.date)).toEqual(["2026-06-05", "2026-06-06"]);
    expect(entries.map((e) => e.transaction_type)).toEqual(["receita", "despesa"]);
  });

  it("appends counterparty document from a continuation line", async () => {
    const entries = await parseLinesToEntries([
      "05 JUN 2026 Total de entradas",
      "Pix recebido Empresa X 150,00",
      "Agência: 0001 Conta: 12345 CNPJ 12.345.678/0001-90",
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].counterparty_document).toBe("12.345.678/0001-90");
  });

  it("ignores page-header noise interleaved with transactions", async () => {
    const entries = await parseLinesToEntries([
      "05 JUN 2026 Total de entradas",
      "Pix recebido A 10,00",
      "1 de 14",
      "Extrato gerado dia 10/07/2026",
      "Pix recebido B 20,00",
    ]);
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.transaction_type === "receita")).toBe(true);
  });

  it("produces deterministic import_hash for identical entries", async () => {
    const a = await parseLinesToEntries([
      "05 JUN 2026 Total de entradas",
      "Pix recebido João 100,00",
    ]);
    const b = await parseLinesToEntries([
      "05 JUN 2026 Total de entradas",
      "Pix recebido João 100,00",
    ]);
    expect(a[0].import_hash).toBe(b[0].import_hash);
    expect(a[0].import_hash).toHaveLength(40); // sha1 hex
  });

  it("skips zero-amount lines", async () => {
    const entries = await parseLinesToEntries([
      "05 JUN 2026 Total de entradas",
      "Pix recebido X 0,00",
      "Pix recebido Y 50,00",
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].amount).toBe(50);
  });

  it("falls back to raw title when no known TITLE_RE matches", async () => {
    const entries = await parseLinesToEntries([
      "05 JUN 2026 Total de entradas",
      "Movimentação avulsa customizada 42,00",
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].description).toContain("Movimentação avulsa");
  });

  it("hash differs when amount changes", async () => {
    const entries = await parseLinesToEntries([
      "05 JUN 2026 Total de entradas",
      "Pix recebido João 100,00",
      "Pix recebido João 100,01",
    ]);
    expect(entries[0].import_hash).not.toBe(entries[1].import_hash);
  });
});
