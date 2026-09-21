#!/usr/bin/env node
/**
 * Runner dos E2E Playwright (specs em e2e/*.spec.py).
 *
 * TRAVA DE AMBIENTE (fail-closed, antes de qualquer spec): os E2E escrevem no
 * banco, então só rodam contra um build de HOMOLOGAÇÃO comprovado pelo marcador
 * `build-env.json` do PRÓPRIO SERVIDOR ALVO, lido por HTTP em
 * `new URL("/build-env.json", E2E_BASE_URL)`.
 *
 * Por que não vale arquivo local: `dist/build-env.json` descreve o build da
 * máquina, não o app servido em `E2E_BASE_URL`. Um marcador local de homologação
 * com `E2E_BASE_URL=https://aveto360.com` provaria nada e os testes escreveriam
 * em produção. O arquivo local, quando informado, serve apenas como conferência
 * extra de `build_id` — nunca substitui a leitura HTTP.
 *
 * Endereço local (localhost) também NÃO é prova de ambiente por si só.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";

const REQUIRE = process.argv.includes("--require") || !!process.env.CI;
const BASE = process.env.E2E_BASE_URL || "http://localhost:8080";
const REF_HOM = "utjhzpdbqzajrhnzcher";
const REF_PROD = "grtxmbffgmgnkawlvqhm";
const MANIFESTO_LOCAL = process.env.E2E_BUILD_MANIFEST || null;

/** Hosts de produção — recusados explicitamente, mesmo com marcador válido. */
const HOSTS_PROIBIDOS = [
  "aveto360.com",
  "www.aveto360.com",
  "aveto360.lovable.app",
  `${REF_PROD}.supabase.co`,
];

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
      ` e aponte E2E_BASE_URL para esse endereço.${RESET}`,
  );
  process.exit(1);
}

// ---------------------------------------------------------------- destino
let alvo;
try {
  alvo = new URL(BASE);
} catch {
  abortar(`E2E_BASE_URL inválida: "${BASE}".`);
}
if (alvo.protocol !== "http:" && alvo.protocol !== "https:") {
  abortar(`E2E_BASE_URL precisa ser http(s): "${BASE}".`);
}
const host = alvo.hostname.toLowerCase();
if (HOSTS_PROIBIDOS.includes(host)) {
  abortar(
    `host de produção recusado explicitamente (${host}). Os E2E escrevem no banco e nunca rodam contra produção.`,
  );
}

// -------------------------------------------- marcador do servidor alvo (HTTP)
const URL_MANIFESTO = new URL("/build-env.json", alvo).toString();

// Sem seguir redirecionamento (`--max-redirs 0`): um redirect poderia levar a
// leitura do marcador para outro host, diferente do que será testado.
const res = spawnSync(
  "curl",
  ["-sS", "-f", "--max-redirs", "0", "--max-time", "10", "-w", "\\n%{url_effective}", URL_MANIFESTO],
  { encoding: "utf8" },
);
if (res.status !== 0 || !res.stdout) {
  abortar(
    `marcador de ambiente não obtido por HTTP em ${URL_MANIFESTO}. Sem ele não há prova de que o app servido em ${BASE} usa o banco de homologação.`,
  );
}
const partes = res.stdout.trimEnd().split("\n");
const urlFinal = partes.pop();
const bruto = partes.join("\n");
if (urlFinal !== URL_MANIFESTO) {
  abortar(`marcador veio de destino diferente do solicitado (${urlFinal}) — redirecionamento recusado.`);
}

let marcador;
try {
  marcador = JSON.parse(bruto);
} catch {
  abortar(`marcador ${URL_MANIFESTO} ilegível ou não é JSON.`);
}

if (marcador.app_env !== "homologacao") {
  abortar(
    `o app servido em ${BASE} declara app_env="${marcador.app_env ?? "ausente"}" — exigido "homologacao".`,
  );
}
if (marcador.supabase_ref !== REF_HOM) {
  abortar(
    `o app servido em ${BASE} aponta para o projeto "${marcador.supabase_ref ?? "ausente"}" — exigido o de homologação (${REF_HOM}).`,
  );
}
if (!marcador.build_id) {
  abortar(`marcador do servidor alvo sem build_id — regenere o build de homologação.`);
}

// Conferência opcional: o build local precisa ser o MESMO servido no alvo.
if (MANIFESTO_LOCAL) {
  if (!existsSync(MANIFESTO_LOCAL)) {
    abortar(`marcador local informado não existe (${MANIFESTO_LOCAL}).`);
  }
  let local;
  try {
    local = JSON.parse(readFileSync(MANIFESTO_LOCAL, "utf8"));
  } catch {
    abortar(`marcador local ${MANIFESTO_LOCAL} ilegível ou não é JSON.`);
  }
  if (local.build_id !== marcador.build_id) {
    abortar(
      `build_id local (${local.build_id ?? "ausente"}) diferente do servido em ${BASE} (${marcador.build_id}) — o alvo não é o build que você gerou.`,
    );
  }
}

console.log(
  `${GREEN}✓ Destino confirmado pelo próprio servidor (${URL_MANIFESTO}): homologação (${REF_HOM}),` +
    ` build ${marcador.build_id}, de ${marcador.built_at ?? "data desconhecida"}.${RESET}`,
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
