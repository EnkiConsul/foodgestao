import { supabase } from "@/integrations/supabase/client";
import { marcarOnboardingConcluido } from "@/lib/onboardingFinalize";

const digits = (value: string) => (value ?? "").replace(/\D/g, "");

export interface OnboardingStatusResolution {
  completed: boolean;
  companyId: string | null;
}

export type OnboardingCnpjStatus =
  | { status: "available"; companyId: null }
  | { status: "registered"; companyId: null }
  | { status: "accessible"; companyId: string };

export async function checkOnboardingCnpj(cnpj: string): Promise<OnboardingCnpjStatus> {
  const cnpjDigits = digits(cnpj);
  if (cnpjDigits.length !== 14) throw new Error("cnpj_invalido");

  const { data, error } = await supabase.functions.invoke("check-onboarding-cnpj", {
    body: { cnpj: cnpjDigits },
  });

  if (error) throw error;
  if (data?.status === "accessible" && typeof data.company_id === "string") {
    return { status: "accessible", companyId: data.company_id };
  }
  if (data?.status === "registered") return { status: "registered", companyId: null };
  if (data?.status === "available") return { status: "available", companyId: null };
  throw new Error("resposta_cnpj_invalida");
}

async function findActiveCompanyForUser(userId: string): Promise<string | null> {
  const [ownedRes, memberRes] = await Promise.all([
    supabase
      .from("companies")
      .select("id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .limit(1),
    supabase
      .from("company_members")
      .select("company_id, companies!inner(id, is_active)")
      .eq("user_id", userId)
      .eq("companies.is_active", true)
      .limit(1),
  ]);

  return ownedRes.data?.[0]?.id ?? memberRes.data?.[0]?.company_id ?? null;
}

/**
 * Resolve o status real do onboarding.
 *
 * Correção defensiva: contas antigas podem ter `onboarding_completed=false`
 * mesmo já possuindo empresa/vínculo ativo. Nesses casos, marcamos o perfil
 * como concluído para evitar loop em `/onboarding`.
 */
/** Espera limitada: rede lenta no celular não pode travar a entrada. */
const ONBOARDING_STATUS_TIMEOUT_MS = 6_000;

function comLimiteDeTempo<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error("onboarding_status_timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(id);
        resolve(value);
      },
      (error) => {
        clearTimeout(id);
        reject(error);
      },
    );
  });
}

// Cadastro concluído não "desconclui": guardamos por 5 minutos para que cada
// troca de tela não repita as consultas e a tela de espera.
const CACHE_MS = 5 * 60_000;
const cacheConcluido = new Map<string, { em: number; valor: OnboardingStatusResolution }>();

export function onboardingStatusEmCache(userId: string): OnboardingStatusResolution | null {
  const c = cacheConcluido.get(userId);
  if (!c || Date.now() - c.em > CACHE_MS) return null;
  return c.valor;
}

export function limparOnboardingStatusCache() {
  cacheConcluido.clear();
}

export async function resolveOnboardingStatus(userId: string): Promise<OnboardingStatusResolution> {
  const emCache = onboardingStatusEmCache(userId);
  if (emCache) return emCache;
  let r: OnboardingStatusResolution;
  try {
    r = await comLimiteDeTempo(consultarOnboardingStatus(userId), ONBOARDING_STATUS_TIMEOUT_MS);
  } catch {
    // Uma nova tentativa antes de desistir: falha momentânea não deve prender
    // o usuário na tela de espera das verificações de entrada.
    r = await comLimiteDeTempo(consultarOnboardingStatus(userId), ONBOARDING_STATUS_TIMEOUT_MS);
  }
  if (r.completed) cacheConcluido.set(userId, { em: Date.now(), valor: r });
  return r;
}

async function consultarOnboardingStatus(userId: string): Promise<OnboardingStatusResolution> {
  const [profileRes, companyId] = await Promise.all([
    supabase
      .from("profiles")
      .select("onboarding_completed")
      .eq("user_id", userId)
      .maybeSingle(),
    findActiveCompanyForUser(userId),
  ]);

  const alreadyCompleted = profileRes.data?.onboarding_completed === true;

  if (!alreadyCompleted && companyId) {
    await marcarOnboardingConcluido(userId);
  }

  return {
    completed: alreadyCompleted || !!companyId,
    companyId,
  };
}

/**
 * Trata o erro `empresa_ja_cadastrada` sem abrir brecha para assumir CNPJ de terceiros.
 * A consulta passa por RLS: só retorna empresa que o usuário logado pode acessar.
 */
export async function resolveOnboardingByExistingCnpj(
  userId: string,
  cnpj: string,
): Promise<OnboardingStatusResolution> {
  const cnpjDigits = digits(cnpj);
  if (cnpjDigits.length !== 14) return { completed: false, companyId: null };

  const { data, error } = await supabase
    .from("companies")
    .select("id")
    .eq("cnpj", cnpjDigits)
    .eq("is_active", true)
    .limit(1);

  if (error) {
    console.error("[onboarding] falha ao buscar empresa existente por CNPJ", error);
    return { completed: false, companyId: null };
  }

  const companyId = data?.[0]?.id ?? null;
  if (!companyId) return { completed: false, companyId: null };

  await marcarOnboardingConcluido(userId);
  return { completed: true, companyId };
}
