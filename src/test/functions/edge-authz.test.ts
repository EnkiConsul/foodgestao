/**
 * Autorização das Edge Functions — chamadas reais contra as funções publicadas.
 *
 * Cada função que exige identidade deve recusar:
 *  - chamada sem Authorization;
 *  - chamada com token inválido/forjado.
 *
 * Sem credenciais no ambiente a suíte é pulada (mesmo padrão da suíte de
 * tenancy). Nenhum segredo é impresso.
 */
import { describe, it, expect } from "vitest";

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const ANON_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  "";

const ENABLED = Boolean(SUPABASE_URL && ANON_KEY);
const d = ENABLED ? describe : describe.skip;

/** Funções que exigem identidade do chamador (usuário autenticado). */
const AUTH_REQUIRED = [
  "dp-sorteio-folgas",
  "dp-send-broadcast",
  "dp-notify-atestado",
  "dp-doc-bulk-approve",
  "dp-doc-bulk-discard",
  "dp-doc-bulk-ingest",
  "dp-generate-disciplinary-pdf",
  "dp-criar-acesso-colaborador",
  "dp-alterar-senha-colaborador",
  "dp-reset-password",
  "dp-invite-colaborador",
  "delete-user-account",
  "export-user-data",
  "asaas-cancel-subscription",
  "pluggy-disconnect-item",
];

/** Funções administrativas: exigem papel de super admin no servidor. */
const ADMIN_ONLY = [
  "admin-exempt-subscription",
  "admin-remove-exemption",
  "admin-list-users-auth",
  "admin-resend-confirmation",
  "admin-reset-mfa",
  "admin-save-bank",
  "admin-reset-data",
];

const FORGED_JWT = [
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
  "eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEiLCJyb2xlIjoic2VydmljZV9yb2xlIiwiZXhwIjo0MDcwOTA4ODAwfQ",
  "ZmFrZS1zaWduYXR1cmU",
].join(".");

async function callFn(name: string, authorization?: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      ...(authorization ? { Authorization: authorization } : {}),
    },
    body: JSON.stringify({ company_id: "00000000-0000-4000-8000-000000000000" }),
  });
  const text = await res.text();
  return { status: res.status, text };
}

const DENIED = [400, 401, 403, 404];

d("Edge Functions: autorização obrigatória", () => {
  for (const fn of AUTH_REQUIRED) {
    it(`${fn} recusa chamada sem token`, async () => {
      const { status, text } = await callFn(fn);
      expect(DENIED, `${fn} respondeu ${status}: ${text.slice(0, 120)}`).toContain(status);
    }, 30_000);

    it(`${fn} recusa token forjado`, async () => {
      const { status } = await callFn(fn, `Bearer ${FORGED_JWT}`);
      expect(DENIED).toContain(status);
    }, 30_000);
  }

  for (const fn of ADMIN_ONLY) {
    it(`${fn} recusa quem não é super admin`, async () => {
      const semToken = await callFn(fn);
      expect(DENIED).toContain(semToken.status);
      const forjado = await callFn(fn, `Bearer ${FORGED_JWT}`);
      expect(DENIED).toContain(forjado.status);
    }, 30_000);
  }

  it("nenhuma resposta de recusa vaza detalhe interno do banco", async () => {
    for (const fn of [...AUTH_REQUIRED.slice(0, 5), ...ADMIN_ONLY.slice(0, 3)]) {
      const { text } = await callFn(fn, `Bearer ${FORGED_JWT}`);
      const lower = text.toLowerCase();
      for (const leak of [
        "permission denied",
        "row-level security",
        "violates",
        "pg_",
        "relation \"",
      ]) {
        expect(lower, `${fn} vazou "${leak}"`).not.toContain(leak);
      }
    }
  }, 60_000);
});
