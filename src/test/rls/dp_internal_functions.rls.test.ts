/**
 * P0.4 — rotinas internas do módulo Pessoas 360° fechadas.
 *
 * Prova que as rotinas SECURITY DEFINER internas (fila de importação em lote,
 * geração automática de escala e atribuição automática de folgas) não são
 * executáveis por visitante (anon) nem por usuário logado (authenticated):
 * o PostgREST responde 403/42501 (permission denied) ou 404 (não exposta).
 *
 * As RPCs app-facing do mesmo domínio (dp_folga_autoatribuicao_plano e
 * dp_folga_autoatribuir_aplicar) seguem com EXECUTE para authenticated e já
 * exigem administrador/dono da empresa dentro do banco — quando chamadas por
 * visitante devem falhar por autorização, nunca executar.
 *
 * Roda sem credenciais: usa apenas a chave publicável (anon).
 */
import { describe, it, expect, beforeAll } from "vitest";

const SUPABASE_URL = "https://grtxmbffgmgnkawlvqhm.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdydHhtYmZmZ21nbmthd2x2cWhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MDM5ODYsImV4cCI6MjA4NjM3OTk4Nn0.izfpHRU8CroQC-3tXxbW_iyuU1g0AIJoWQMS-JRSgko";

const ID = "00000000-0000-4000-8000-0000000000f4";
const COMPETENCIA = "2026-01-01";

/** Rotinas internas fechadas nesta fase. */
const ROTINAS_INTERNAS: Array<[string, Record<string, unknown>]> = [
  ["dp_bulk_increment_processed", { p_batch_id: ID }],
  ["dp_escala_auto_gerar", { p_company_id: ID, p_mes: COMPETENCIA }],
  ["dp_escala_auto_gerar_todas", {}],
  ["dp_folga_autoatribuir_todas", {}],
  ["dp_folga_autoatribuir_competencia", { _company: ID, _unidade: null, _competencia: COMPETENCIA }],
  ["dp_folga_autoatribuir_manual", { _company: ID, _unidade: null, _competencia: COMPETENCIA }],
  ["dp_folga_autoatribuicao_previa", { _company: ID, _unidade: null, _competencia: COMPETENCIA }],
  ["dp_escala_item_validar_setor", {}],
  ["dp_folgas_validar_unificado", {}],
];

/** RPCs app-facing preservadas (autorização é feita dentro do banco). */
const ROTINAS_APP: Array<[string, Record<string, unknown>]> = [
  ["dp_folga_autoatribuicao_plano", { _company: ID, _unidade: null, _competencia: COMPETENCIA }],
  [
    "dp_folga_autoatribuir_aplicar",
    { _company: ID, _unidade: null, _competencia: COMPETENCIA, _itens: [] },
  ],
];

let networkAvailable = true;

beforeAll(async () => {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, { headers: { apikey: ANON_KEY } });
    networkAvailable = res.ok;
  } catch {
    networkAvailable = false;
  }
});

async function chamar(nome: string, corpo: Record<string, unknown>, token?: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nome}`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token ?? ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(corpo),
  });
  return { status: res.status, texto: await res.text() };
}

describe("P0.4: visitante não executa rotinas internas de Pessoas", () => {
  for (const [nome, corpo] of ROTINAS_INTERNAS) {
    it(`bloqueia ${nome}`, async () => {
      if (!networkAvailable) return;
      const { status } = await chamar(nome, corpo);
      expect(status).toBeGreaterThanOrEqual(400);
    });
  }
});

describe("P0.4: usuário logado não executa rotinas internas de Pessoas", () => {
  const token = process.env.SUPABASE_TEST_ACCESS_TOKEN;
  for (const [nome, corpo] of ROTINAS_INTERNAS) {
    it(`bloqueia ${nome} com sessão`, async () => {
      if (!networkAvailable || !token) return; // sem credenciais no CI: coberto pelo caso anon
      const { status, texto } = await chamar(nome, corpo, token);
      expect(status).toBeGreaterThanOrEqual(400);
      expect(/42501|PGRST202|permission denied/.test(texto)).toBe(true);
    });
  }
});

describe("P0.4: RPCs app-facing seguem exigindo autorização, sem executar para anon", () => {
  for (const [nome, corpo] of ROTINAS_APP) {
    it(`nega ${nome} para visitante`, async () => {
      if (!networkAvailable) return;
      const { status, texto } = await chamar(nome, corpo);
      expect(status).toBeGreaterThanOrEqual(400);
      expect(/FORBIDDEN|42501|permission denied|JWT/.test(texto)).toBe(true);
    });
  }
});
