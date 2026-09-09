import { supabase } from "@/integrations/supabase/client";

/**
 * Resolução única do destino após o login.
 *
 * Regra crítica: quem é apenas colaborador NUNCA pode cair na área da empresa
 * (nem no assistente de cadastro `/onboarding`). O destino dele é o portal
 * do colaborador (`/dp/meu`).
 */
export type LandingKind = "empresa" | "portal" | "convites";

export interface LandingTarget {
  kind: LandingKind;
  path: string;
  isAdminOrOwner: boolean;
  isColaborador: boolean;
}

export const PORTAL_PATH = "/dp/meu";
export const EMPRESA_PATH = "/hub";
export const CONVITES_PATH = "/bem-vindo";

export async function resolveLandingTarget(userId: string): Promise<LandingTarget> {
  const [superRes, ownerRes, memberRes, colabRes] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "super_admin").maybeSingle(),
    supabase.from("companies").select("id").eq("user_id", userId).limit(1),
    supabase.from("company_members").select("role").eq("user_id", userId).in("role", ["owner", "admin"]).limit(1),
    supabase.rpc("is_dp_colaborador", { _user_id: userId }),
  ]);

  const isAdminOrOwner =
    !!superRes.data || !!ownerRes.data?.length || !!memberRes.data?.length;
  const isColaborador = !!colabRes.data;

  if (!isAdminOrOwner && isColaborador) {
    return { kind: "portal", path: PORTAL_PATH, isAdminOrOwner, isColaborador };
  }

  // Sem vínculo com nenhuma empresa: se existe convite pendente para o e-mail,
  // a entrada é a tela de boas-vindas (aceitar convite ou criar empresa).
  if (!isAdminOrOwner && !isColaborador) {
    try {
      const { data: invites } = await supabase.rpc("my_pending_invites");
      if (Array.isArray(invites) && invites.length > 0) {
        return { kind: "convites", path: CONVITES_PATH, isAdminOrOwner, isColaborador };
      }
    } catch {
      /* segue para a área da empresa */
    }
  }

  return { kind: "empresa", path: EMPRESA_PATH, isAdminOrOwner, isColaborador };
}


/** Ajusta um destino pedido (`?redirect=`) ao tipo de acesso real. */
export function landingPathFor(target: LandingTarget, requested?: string | null): string {
  if (target.kind === "portal") {
    return requested && requested.startsWith(PORTAL_PATH) ? requested : PORTAL_PATH;
  }
  if (target.kind === "convites") return CONVITES_PATH;
  return requested || EMPRESA_PATH;
}
