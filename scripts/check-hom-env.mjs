#!/usr/bin/env node
/**
 * Confere o arquivo `.env.homologacao` ANTES de rodar/gerar o build de
 * homologação. Reporta apenas PRESENTE/AUSENTE e conformidade — nunca imprime
 * valores de chave.
 *
 * Mesma regra do guard de runtime (src/lib/env/appEnv.ts): sem fallback para
 * produção.
 */
import { existsSync, readFileSync } from "node:fs";

const REF_HOM = "utjhzpdbqzajrhnzcher";
const REF_PROD = "grtxmbffgmgnkawlvqhm";
const ARQ = process.env.HOM_ENV_FILE || ".env.homologacao";

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const RESET = "\x1b[0m";

const falhar = (msg) => {
  console.error(`${RED}✗ ${msg}${RESET}`);
  process.exit(1);
};

if (!existsSync(ARQ)) {
  falhar(
    `${ARQ} não existe. Copie .env.homologacao.example para ${ARQ} e preencha a chave publicável do projeto de homologação.`,
  );
}

const vars = {};
for (const linha of readFileSync(ARQ, "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(linha);
  if (!m) continue;
  vars[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const url = (vars.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
const chave = vars.VITE_SUPABASE_PUBLISHABLE_KEY || "";
const flag = (vars.VITE_APP_ENV || "").toLowerCase();
const projectId = vars.VITE_SUPABASE_PROJECT_ID || "";

if (flag !== "homologacao") falhar('VITE_APP_ENV precisa ser exatamente "homologacao".');
if (url.includes(REF_PROD)) falhar("VITE_SUPABASE_URL aponta para PRODUÇÃO — build abortado.");
if (url !== `https://${REF_HOM}.supabase.co`) {
  falhar(`VITE_SUPABASE_URL precisa ser exatamente https://${REF_HOM}.supabase.co`);
}
if (projectId && projectId !== REF_HOM) falhar("VITE_SUPABASE_PROJECT_ID divergente da URL.");
if (!(chave.length >= 40 && (chave.startsWith("eyJ") || chave.startsWith("sb_")))) {
  falhar("VITE_SUPABASE_PUBLISHABLE_KEY ausente ou fora do formato esperado (anon/publicável).");
}

console.log(`${GREEN}✓ ${ARQ} válido — build apontará para o banco de homologação (${REF_HOM}).${RESET}`);
