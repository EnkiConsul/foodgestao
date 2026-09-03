/**
 * Guarda estática de escopo por empresa nas telas de cartão de crédito e extrato.
 *
 * Cada vazamento entre empresas já observado em produção veio de uma consulta
 * de leitura que esqueceu o filtro por empresa (`company_id` ou
 * `applyFinancialScope`). Este teste falha se qualquer leitura das tabelas
 * multiempresa nessas telas voltar a ser escrita sem escopo — assim a
 * regressão é pega no CI, sem depender de sessão real.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Telas/hooks que exibem cartões, faturas e extrato conciliado. */
const FILES = [
  "src/pages/CartoesCredito.tsx",
  "src/pages/ConciliacaoPluggy.tsx",
  "src/pages/ExtratoConciliacao.tsx",
  "src/pages/Lancamentos.tsx",
  "src/hooks/usePluggyCreditReview.tsx",
  "src/components/credit-cards/PluggyCreditCardReviewDialog.tsx",
  "src/components/credit-cards/InvoiceTransactionsList.tsx",
] as const;

/** Tabelas com dados financeiros de uma única empresa. */
const TENANT_TABLES = [
  "credit_cards",
  "credit_card_invoices",
  "transactions",
  "pluggy_accounts",
  "pluggy_connections",
  "pluggy_staging_transactions",
] as const;

const SCOPE_MARKERS = [
  "company_id",
  "applyFinancialScope",
  "assertFinancialScope",
  "selectedCompanyId",
];

type Finding = { file: string; table: string; snippet: string };

function collectUnscopedReads(file: string): Finding[] {
  const source = readFileSync(resolve(process.cwd(), file), "utf8");
  const findings: Finding[] = [];

  for (const table of TENANT_TABLES) {
    const needle = `.from("${table}")`;
    let idx = source.indexOf(needle);
    while (idx !== -1) {
      // Janela da consulta: um pouco antes (wrappers como applyFinancialScope(...))
      // e o encadeamento que vem depois do .from().
      const before = source.slice(Math.max(0, idx - 600), idx);
      const after = source.slice(idx, idx + 1200).split('.from("')[0];
      const window = `${before}${after}`;

      const isRead = after.includes(".select(") && !/\.(insert|upsert|update|delete)\(/.test(after);
      if (isRead && !SCOPE_MARKERS.some((m) => window.includes(m))) {
        findings.push({ file, table, snippet: after.slice(0, 160) });
      }
      idx = source.indexOf(needle, idx + needle.length);
    }
  }

  return findings;
}

describe("escopo por empresa: cartões e extrato", () => {
  for (const file of FILES) {
    it(`${file} filtra toda leitura multiempresa por empresa`, () => {
      const findings = collectUnscopedReads(file);
      expect(
        findings,
        findings.map((f) => `${f.table}: ${f.snippet}`).join("\n"),
      ).toEqual([]);
    });
  }

  it("cobre todas as tabelas multiempresa de cartão/extrato", () => {
    const all = FILES.map((f) => readFileSync(resolve(process.cwd(), f), "utf8")).join("\n");
    for (const table of TENANT_TABLES) {
      expect(all.includes(`.from("${table}")`), `sem consulta de ${table} nas telas cobertas`).toBe(true);
    }
  });

  it("nenhuma tela de cartão/extrato usa .eq('user_id') como único escopo em PJ", () => {
    for (const file of FILES) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      const matches = source.match(/\.eq\("user_id",[^)]*\)/g) ?? [];
      for (const m of matches) {
        // user_id pode aparecer junto do escopo de empresa, nunca sozinho.
        expect(source.includes("company_id") || source.includes("applyFinancialScope")).toBe(true);
        expect(m).toBeTruthy();
      }
    }
  });
});
