/**
 * Ambiente da aplicação (produção x homologação) com validação FAIL-CLOSED.
 *
 * Regra central: o build só sobe se a combinação `VITE_APP_ENV` +
 * `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` for coerente.
 * Não existe fallback: um build marcado como homologação nunca aceita a URL de
 * produção, e um build de produção nunca aceita a URL de homologação.
 */

export const REF_PRODUCAO = "grtxmbffgmgnkawlvqhm";
export const REF_HOMOLOGACAO = "utjhzpdbqzajrhnzcher";

export const URL_PRODUCAO = `https://${REF_PRODUCAO}.supabase.co`;
export const URL_HOMOLOGACAO = `https://${REF_HOMOLOGACAO}.supabase.co`;

export type Ambiente = "producao" | "homologacao";

export interface EnvBruto {
  VITE_APP_ENV?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_SUPABASE_PROJECT_ID?: string;
}

export type ResolucaoAmbiente =
  | { ok: true; ambiente: Ambiente }
  | { ok: false; motivo: string; detalhe: string };

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Chave publicável (anon) plausível: JWT legado ou formato novo `sb_...`. */
function chavePublicaPlausivel(chave: string): boolean {
  if (chave.length < 40) return false;
  return chave.startsWith("eyJ") || chave.startsWith("sb_");
}

function refDaUrl(url: string): string | null {
  const m = /^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/.exec(url);
  return m ? m[1] : null;
}

/**
 * Resolve e valida o ambiente. Função pura — recebe o env, devolve decisão.
 */
export function resolverAmbiente(env: EnvBruto): ResolucaoAmbiente {
  const flagBruta = texto(env.VITE_APP_ENV).toLowerCase();
  const url = texto(env.VITE_SUPABASE_URL).replace(/\/+$/, "");
  const chave = texto(env.VITE_SUPABASE_PUBLISHABLE_KEY);
  const projectId = texto(env.VITE_SUPABASE_PROJECT_ID);
  const ref = refDaUrl(url);

  if (!url) {
    return { ok: false, motivo: "url_ausente", detalhe: "VITE_SUPABASE_URL não está definida." };
  }
  if (!ref) {
    return {
      ok: false,
      motivo: "url_invalida",
      detalhe: "VITE_SUPABASE_URL não tem o formato https://<ref>.supabase.co.",
    };
  }
  if (!chavePublicaPlausivel(chave)) {
    return {
      ok: false,
      motivo: "chave_publica_invalida",
      detalhe: "VITE_SUPABASE_PUBLISHABLE_KEY ausente ou fora do formato esperado.",
    };
  }
  if (projectId && projectId !== ref) {
    return {
      ok: false,
      motivo: "project_id_divergente",
      detalhe: "VITE_SUPABASE_PROJECT_ID não corresponde ao banco de VITE_SUPABASE_URL.",
    };
  }

  // Flag ausente = produção. Nunca aceita a URL de homologação sem a flag.
  const flag = flagBruta || "producao";

  if (flag !== "producao" && flag !== "homologacao") {
    return {
      ok: false,
      motivo: "flag_invalida",
      detalhe: `VITE_APP_ENV="${flagBruta}" não é reconhecida (use "producao" ou "homologacao").`,
    };
  }

  if (flag === "homologacao") {
    if (ref !== REF_HOMOLOGACAO) {
      return {
        ok: false,
        motivo: "homologacao_com_banco_errado",
        detalhe: "Build de homologação exige exatamente o banco de homologação — sem fallback.",
      };
    }
    return { ok: true, ambiente: "homologacao" };
  }

  if (ref === REF_HOMOLOGACAO) {
    return {
      ok: false,
      motivo: "producao_com_banco_homologacao",
      detalhe: 'Banco de homologação exige VITE_APP_ENV="homologacao".',
    };
  }
  if (ref !== REF_PRODUCAO) {
    return {
      ok: false,
      motivo: "banco_desconhecido",
      detalhe: "VITE_SUPABASE_URL não é o banco de produção nem o de homologação.",
    };
  }

  return { ok: true, ambiente: "producao" };
}

export class AmbienteInvalidoError extends Error {
  readonly motivo: string;
  constructor(motivo: string, detalhe: string) {
    super(`Ambiente inválido (${motivo}): ${detalhe}`);
    this.name = "AmbienteInvalidoError";
    this.motivo = motivo;
  }
}

function envDoBuild(): EnvBruto {
  const e = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  return {
    VITE_APP_ENV: e.VITE_APP_ENV,
    VITE_SUPABASE_URL: e.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: e.VITE_SUPABASE_PUBLISHABLE_KEY,
    VITE_SUPABASE_PROJECT_ID: e.VITE_SUPABASE_PROJECT_ID,
  };
}

let resolvido: ResolucaoAmbiente | null = null;

function resolucaoAtual(): ResolucaoAmbiente {
  if (!resolvido) resolvido = resolverAmbiente(envDoBuild());
  return resolvido;
}

/**
 * Validação fail-closed executada no início do carregamento da aplicação,
 * antes de qualquer uso do cliente do banco. Lança em caso de incoerência.
 */
export function assertAmbienteValido(): Ambiente {
  const r = resolucaoAtual();
  if (r.ok === false) throw new AmbienteInvalidoError(r.motivo, r.detalhe);
  return r.ambiente;
}

export function ambienteAtual(): Ambiente | null {
  const r = resolucaoAtual();
  return r.ok ? r.ambiente : null;
}

export function isHomologacao(): boolean {
  return ambienteAtual() === "homologacao";
}
