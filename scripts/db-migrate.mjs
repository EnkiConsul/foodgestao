#!/usr/bin/env node
/**
 * Aplica migrations no banco e, em seguida, roda o security linter.
 *
 * Uso:
 *   npm run db:push          → supabase db push  + security-lint
 *   npm run db:migrate       → supabase migration up + security-lint
 *
 * Pré-requisitos:
 *   - Supabase CLI instalado (`supabase --version`)
 *   - Projeto linkado (`supabase link --project-ref ...`) OU SUPABASE_DB_URL exportado
 *
 * Se a migration falhar, o linter NÃO é executado e o processo sai com erro.
 * Se o linter encontrar findings, o processo sai com código 1.
 */
import { spawnSync } from "node:child_process";

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

const mode = process.argv[2] ?? "push";
const cliArgs =
  mode === "push"
    ? ["db", "push"]
    : mode === "up"
      ? ["migration", "up"]
      : null;

if (!cliArgs) {
  console.error(`${RED}Uso: db-migrate.mjs <push|up>${RESET}`);
  process.exit(2);
}

console.log(`${CYAN}▶ supabase ${cliArgs.join(" ")}${RESET}`);
const migrate = spawnSync("supabase", cliArgs, { stdio: "inherit" });
if (migrate.status !== 0) {
  console.error(`${RED}✗ migration falhou — linter não executado${RESET}`);
  process.exit(migrate.status ?? 1);
}
console.log(`${GREEN}✓ migration aplicada${RESET}`);

console.log(`${CYAN}▶ security-lint${RESET}`);
const lint = spawnSync("node", ["scripts/security-lint.mjs"], {
  stdio: "inherit",
});
process.exit(lint.status ?? 0);
