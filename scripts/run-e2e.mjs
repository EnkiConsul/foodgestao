#!/usr/bin/env node
/**
 * Runner dos E2E Playwright (specs em e2e/*.spec.py).
 *
 * Sobe/valida o app em E2E_BASE_URL (default http://localhost:8080) e executa
 * cada spec com python3. Sem python/playwright: falha em CI, avisa localmente.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";

const REQUIRE = process.argv.includes("--require") || !!process.env.CI;
const BASE = process.env.E2E_BASE_URL || "http://localhost:8080";

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
