#!/usr/bin/env node
/**
 * Aplica migrations e roda o security linter em seguida.
 *
 * Uso:
 *   npm run db:push            → supabase db push + security-lint
 *   npm run db:migrate         → supabase migration up + security-lint
 *   npm run db:push -- --ci    → modo CI (logs verbosos, falha só em criticals)
 *
 * Qualquer flag adicional (--ci, --strict, --json) é repassada ao linter.
 */
import { spawnSync } from "node:child_process";

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

const [, , mode, ...rest] = process.argv;
const lintArgs = rest.filter((a) => a.startsWith("--"));

const cliArgs =
  mode === "push"
    ? ["db", "push"]
    : mode === "up"
      ? ["migration", "up"]
      : null;

if (!cliArgs) {
  console.error(`${RED}Uso: db-migrate.mjs <push|up> [--ci|--strict|--json]${RESET}`);
  process.exit(2);
}

console.log(`${CYAN}${BOLD}▶ supabase ${cliArgs.join(" ")}${RESET}`);
const t0 = Date.now();
const migrate = spawnSync("supabase", cliArgs, { stdio: "inherit" });
if (migrate.status !== 0) {
  console.error(`${RED}✗ migration falhou — linter não executado${RESET}`);
  process.exit(migrate.status ?? 1);
}
console.log(`${GREEN}✓ migration aplicada${RESET} (${Date.now() - t0}ms)\n`);

console.log(
  `${CYAN}${BOLD}▶ security-lint${lintArgs.length ? " " + lintArgs.join(" ") : ""}${RESET}`,
);
const lint = spawnSync(
  "node",
  ["scripts/security-lint.mjs", ...lintArgs],
  { stdio: "inherit" },
);
process.exit(lint.status ?? 0);
