#!/usr/bin/env node
/**
 * Runner dos E2E Playwright (specs em e2e/*.spec.py).
 *
 * TRAVA DE AMBIENTE (fail-closed, antes de qualquer spec): os E2E escrevem no
 * banco, então só rodam contra um build de HOMOLOGAÇÃO comprovado pelo marcador
 * `build-env.json` gerado no próprio build (`app_env` + `supabase_ref`).
 * Endereço local (localhost) NÃO é prova de ambiente e não é aceito como tal.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";

const REQUIRE = process.argv.includes("--require") || !!process.env.CI;
const BASE = process.env.E2E_BASE_URL || "http://localhost:8080";
const REF_HOM = "utjhzpdbqzajrhnzcher";
const MANIFESTO = process.env.E2E_BUILD_MANIFEST || "dist/build-env.json";

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

function softExit(msg) {
  if (REQUIRE) {
    console.error(`${RED}✗ ${msg}${RESET}`);
    process.exit(1);
  }
  console.warn(`${YELLOW}⚠ ${msg} — E2E ignorado.${RESET}`);
  process.exit(0);
}

/** Aborta sempre (sem modo brando): risco de escrever no banco errado. */
function abortar(msg) {
  console.error(`${RED}✗ E2E abortado: ${msg}${RESET}`);
  console.error(
    `${YELLOW}  Gere o build de homologação (bun run build:hom), sirva-o (bun run preview:hom)` +
      ` e aponte E2E_BASE_URL/E2E_BUILD_MANIFEST para ele.${RESET}`,
  );
  process.exit(1);
}

if (!existsSync(MANIFESTO)) {
  abortar(
    `marcador de ambiente ausente (${MANIFESTO}). Sem ele não há prova de que o app em teste usa o banco de homologação.`,
  );
}

let marcador;
try {
  marcador = JSON.parse(readFileSync(MANIFESTO, "utf8"));
} catch {
  abortar(`marcador ${MANIFESTO} ilegível ou não é JSON.`);
}

if (marcador.app_env !== "homologacao") {
  abortar(`marcador declara app_env="${marcador.app_env ?? "ausente"}" — exigido "homologacao".`);
}
if (marcador.supabase_ref !== REF_HOM) {
  abortar(
    `marcador aponta para o projeto "${marcador.supabase_ref ?? "ausente"}" — exigido o de homologação (${REF_HOM}).`,
  );
}
console.log(
  `${GREEN}✓ Ambiente confirmado pelo marcador: homologação (${REF_HOM}), build de ${marcador.built_at ?? "data desconhecida"}.${RESET}`,
);

if (!existsSync("e2e")) softExit("pasta e2e ausente");

const specs = readdirSync("e2e").filter((f) => f.endsWith(".spec.py")).sort();
if (!specs.length) softExit("nenhum spec .spec.py encontrado");

if (spawnSync("python3", ["-c", "import playwright"], { encoding: "utf8" }).status !== 0) {
  softExit("python3 + playwright indisponíveis");
}

const reachable = spawnSync(
  "curl",
  ["-sf", "-o", "/dev/null", "-m", "10", BASE],
  { encoding: "utf8" },
).status === 0;
if (!reachable) softExit(`app não responde em ${BASE}`);

console.log(`${CYAN}▶ ${specs.length} spec(s) E2E contra ${BASE}${RESET}`);
const failures = [];
for (const spec of specs) {
  const res = spawnSync("python3", [`e2e/${spec}`], {
    stdio: "inherit",
    env: { ...process.env, E2E_BASE_URL: BASE, BASE_URL: BASE },
  });
  if (res.status === 0) console.log(`${GREEN}✓${RESET} ${spec}`);
  else {
    console.error(`${RED}✗${RESET} ${spec} (exit ${res.status})`);
    failures.push(spec);
  }
}

if (failures.length) {
  console.error(`${RED}✗ E2E reprovado: ${failures.join(", ")}${RESET}`);
  process.exit(1);
}
console.log(`${GREEN}✓ E2E aprovado${RESET}`);
