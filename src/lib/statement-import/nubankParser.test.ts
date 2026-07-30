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
      transaction_type: "entrada",
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
      transaction_type: "saida",
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
    expect(entries[0].transaction_type).toBe("entrada");
    expect(entries[1].transaction_type).toBe("saida");
  });

  it("carries date across multiple days", async () => {
    const entries = await parseLinesToEntries([
      "05 JUN 2026 Total de entradas",
      "Pix recebido A 10,00",
      "06 JUN 2026 Total de saídas",
      "Pix enviado B 20,00",
    ]);
    expect(entries.map((e) => e.date)).toEqual(["2026-06-05", "2026-06-06"]);
    expect(entries.map((e) => e.transaction_type)).toEqual(["entrada", "saida"]);
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
    expect(entries.every((e) => e.transaction_type === "entrada")).toBe(true);
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

import { extractStatementSummary, reconcileEntries } from "./nubankParser";

describe("sign inference from explicit +/-", () => {
  it("uses explicit '-' to mark despesa even without section header", async () => {
    const entries = await parseLinesToEntries([
      "05 JUN 2026",
      "Compra no débito Padaria X -12,50",
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].transaction_type).toBe("saida");
    expect(entries[0].amount).toBe(12.5);
  });

  it("uses explicit '+' to mark receita even without section header", async () => {
    const entries = await parseLinesToEntries([
      "05 JUN 2026",
      "Pix recebido Cliente A +200,00",
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].transaction_type).toBe("entrada");
    expect(entries[0].amount).toBe(200);
  });

  it("explicit sign overrides a wrong section header", async () => {
    const entries = await parseLinesToEntries([
      "05 JUN 2026 Total de entradas",
      "Estorno de compra -30,00",
      "Pix recebido A 50,00",
    ]);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ transaction_type: "saida", amount: 30 });
    expect(entries[1]).toMatchObject({ transaction_type: "entrada", amount: 50 });
  });

  it("always stores amount as positive magnitude", async () => {
    const entries = await parseLinesToEntries([
      "05 JUN 2026 Total de saídas",
      "Pix enviado B -75,50",
    ]);
    expect(entries[0].amount).toBe(75.5);
    expect(entries[0].amount).toBeGreaterThan(0);
  });
});

describe("extractStatementSummary", () => {
  it("extracts saldo inicial, saldo final and rendimento", () => {
    const s = extractStatementSummary([
      "Extrato gerado dia 10/07/2026",
      "Saldo inicial R$ 1.000,00",
      "Total de entradas 500,00",
      "Total de saídas 200,00",
      "Rendimento líquido 3,50",
      "Saldo final R$ 1.303,50",
    ]);
    expect(s).toEqual({
      saldo_inicial: 1000,
      saldo_final: 1303.5,
      total_entradas: 500,
      total_saidas: 200,
      rendimento_liquido: 3.5,
    });
  });

  it("returns nulls when summary rows are missing", () => {
    const s = extractStatementSummary(["05 JUN 2026 Total de entradas", "Pix X 10,00"]);
    // "Total de entradas" here has amount → still captured
    expect(s.saldo_inicial).toBeNull();
    expect(s.saldo_final).toBeNull();
    expect(s.rendimento_liquido).toBeNull();
  });
});

describe("reconcileEntries", () => {
  it("reports balanced=true when parsed totals match summary", async () => {
    const entries = await parseLinesToEntries([
      "05 JUN 2026 Total de entradas",
      "Pix recebido A 300,00",
      "Pix recebido B 200,00",
      "Total de saídas",
      "Pix enviado C 120,00",
      "Pix enviado D 80,00",
    ]);
    const rec = reconcileEntries(entries, {
      saldo_inicial: 1000,
      saldo_final: 1300,
      total_entradas: 500,
      total_saidas: 200,
      rendimento_liquido: null,
    });
    expect(rec.parsed_entradas).toBe(500);
    expect(rec.parsed_saidas).toBe(200);
    expect(rec.entradas_diff).toBe(0);
    expect(rec.saidas_diff).toBe(0);
    expect(rec.balance_diff).toBe(0);
    expect(rec.balanced).toBe(true);
  });

  it("flags balanced=false when parsed differs from summary", async () => {
    const entries = await parseLinesToEntries([
      "05 JUN 2026 Total de entradas",
      "Pix recebido A 300,00",
    ]);
    const rec = reconcileEntries(entries, {
      saldo_inicial: null,
      saldo_final: null,
      total_entradas: 500,
      total_saidas: null,
      rendimento_liquido: null,
    });
    expect(rec.entradas_diff).toBe(-200);
    expect(rec.balanced).toBe(false);
  });

  it("returns balanced=false when no checks are available", () => {
    const rec = reconcileEntries([], {
      saldo_inicial: null,
      saldo_final: null,
      total_entradas: null,
      total_saidas: null,
      rendimento_liquido: null,
    });
    expect(rec.balanced).toBe(false);
    expect(rec.entradas_diff).toBeNull();
    expect(rec.saidas_diff).toBeNull();
    expect(rec.balance_diff).toBeNull();
  });

  it("includes rendimento_liquido in balance reconciliation", async () => {
    const entries = await parseLinesToEntries([
      "05 JUN 2026 Total de entradas",
      "Pix recebido A 100,00",
    ]);
    // saldo_final - saldo_inicial = 103.50 ; parsed entradas=100 + rendimento=3.5
    const rec = reconcileEntries(entries, {
      saldo_inicial: 1000,
      saldo_final: 1103.5,
      total_entradas: 100,
      total_saidas: 0,
      rendimento_liquido: 3.5,
    });
    expect(rec.balance_diff).toBe(0);
    expect(rec.balanced).toBe(true);
  });
});
