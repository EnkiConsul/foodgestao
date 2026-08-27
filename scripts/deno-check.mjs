#!/usr/bin/env node
/**
 * Deno check das edge functions — garante que todo index.ts de
 * supabase/functions
 * tipa e resolve imports antes do release.
 *
 * Sem Deno instalado: tenta `nix run nixpkgs#deno` e, se não houver, falha em
 * CI (--require) ou avisa localmente.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";

const REQUIRE = process.argv.includes("--require") || !!process.env.CI;

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

const ROOT = "supabase/functions";
if (!existsSync(ROOT)) {
  console.log(`${YELLOW}⚠ ${ROOT} não existe — nada a checar.${RESET}`);
  process.exit(0);
}

const entries = readdirSync(ROOT, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
  .map((d) => `${ROOT}/${d.name}/index.ts`)
  .filter((p) => existsSync(p));

if (!entries.length) {
  console.log(`${YELLOW}⚠ nenhuma edge function encontrada.${RESET}`);
  process.exit(0);
}

function resolveDeno() {
  if (spawnSync("deno", ["--version"], { encoding: "utf8" }).status === 0) {
    return { cmd: "deno", prefix: [] };
  }
  const nix = spawnSync("nix", ["--version"], { encoding: "utf8" });
  if (nix.status === 0) {
    return { cmd: "nix", prefix: ["run", "nixpkgs#deno", "--"] };
  }
  return null;
}

const deno = resolveDeno();
if (!deno) {
  const msg = "Deno indisponível (instale deno ou nix)";
  if (REQUIRE) {
    console.error(`${RED}✗ ${msg}${RESET}`);
    process.exit(1);
  }
  console.warn(`${YELLOW}⚠ ${msg} — checagem ignorada localmente.${RESET}`);
  process.exit(0);
}

// Baseline (ratchet decrescente): funções com falhas herdadas. Remova nomes ao
// corrigi-los; nunca adicione — função nova que falha reprova o gate.
const BASELINE_FILE = "scripts/deno-check.baseline.json";
const baseline = new Set(
  existsSync(BASELINE_FILE) ? JSON.parse(readFileSync(BASELINE_FILE, "utf8")) : [],
);

console.log(`${CYAN}▶ deno check em ${entries.length} função(ões)${RESET}`);
const failures = [];
const knownFailures = [];
const fixed = [];
for (const file of entries) {
  const name = file.split("/")[2];
  const res = spawnSync(
    deno.cmd,
    [...deno.prefix, "check", "--no-lock", "--quiet", file],
    { encoding: "utf8" },
  );
  if (res.status === 0) {
    console.log(`${GREEN}✓${RESET} ${file}`);
    if (baseline.has(name)) fixed.push(name);
  } else if (baseline.has(name)) {
    console.warn(`${YELLOW}⚠ (baseline)${RESET} ${file}`);
    knownFailures.push(name);
  } else {
    console.error(`${RED}✗${RESET} ${file}\n${res.stderr || res.stdout}`);
    failures.push(name);
  }
}

if (fixed.length) {
  console.log(
    `${GREEN}↓ corrigidas — remova do baseline: ${fixed.join(", ")}${RESET}`,
  );
}
if (knownFailures.length) {
  console.warn(
    `${YELLOW}⚠ ${knownFailures.length} falha(s) herdada(s) no baseline${RESET}`,
  );
}
if (failures.length) {
  console.error(
    `${RED}✗ deno check reprovado em ${failures.length} função(ões) fora do baseline: ${failures.join(", ")}${RESET}`,
  );
  process.exit(1);
}
console.log(`${GREEN}✓ deno check aprovado${RESET}`);

