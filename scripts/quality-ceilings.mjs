#!/usr/bin/env node
/**
 * Tetos de qualidade (ratchet decrescente) para TypeScript strict e ESLint.
 *
 *   node scripts/quality-ceilings.mjs typescript
 *   node scripts/quality-ceilings.mjs eslint
 *
 * Reprova se a contagem atual passar do teto em scripts/quality-ceilings.json.
 * Quando fica abaixo, avisa para baixar o teto (o gate não falha por isso).
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

const target = process.argv[2];
const ceilings = JSON.parse(readFileSync("scripts/quality-ceilings.json", "utf8"));

function compare(label, actual, ceiling) {
  if (actual > ceiling) {
    console.error(`${RED}✗ ${label}: ${actual} (teto ${ceiling}) — regressão${RESET}`);
    return false;
  }
  if (actual < ceiling) {
    console.log(
      `${GREEN}✓ ${label}: ${actual} (teto ${ceiling}) — baixe o teto em scripts/quality-ceilings.json${RESET}`,
    );
  } else {
    console.log(`${GREEN}✓ ${label}: ${actual} (no teto ${ceiling})${RESET}`);
  }
  return true;
}

if (target === "typescript") {
  console.log(`${CYAN}▶ TypeScript strict${RESET}`);
  const res = spawnSync("npm", ["run", "typecheck:strict"], { encoding: "utf8" });
  const out = `${res.stdout ?? ""}${res.stderr ?? ""}`;
  const errors = (out.match(/error TS\d+/g) ?? []).length;
  if (errors === 0 && res.status !== 0) {
    console.error(out.trim());
    console.error(`${RED}✗ typecheck falhou sem erros TS reconhecíveis${RESET}`);
    process.exit(1);
  }
  if (errors) console.log(out.trim().split("\n").slice(-40).join("\n"));
  process.exit(compare("erros TS strict", errors, ceilings.typescript_strict_errors) ? 0 : 1);
}

if (target === "eslint") {
  console.log(`${CYAN}▶ ESLint${RESET}`);
  const res = spawnSync("npx", ["eslint", ".", "--format", "json"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  let report;
  try {
    report = JSON.parse(res.stdout);
  } catch {
    console.error(res.stderr || res.stdout);
    console.error(`${RED}✗ ESLint não produziu relatório JSON${RESET}`);
    process.exit(1);
  }
  const errors = report.reduce((n, f) => n + f.errorCount, 0);
  const warnings = report.reduce((n, f) => n + f.warningCount, 0);
  const okE = compare("erros ESLint", errors, ceilings.eslint_errors);
  const okW = compare("warnings ESLint", warnings, ceilings.eslint_warnings);
  if (!okE || !okW) {
    for (const file of report) {
      for (const m of file.messages) {
        if (m.severity === 2) {
          console.error(`  ${file.filePath}:${m.line} ${m.ruleId ?? ""} ${m.message}`);
        }
      }
    }
    process.exit(1);
  }
  process.exit(0);
}

console.error(`${YELLOW}Uso: quality-ceilings.mjs <typescript|eslint>${RESET}`);
process.exit(2);
