/**
 * Autorização compartilhada das Edge Functions.
 *
 * `requireUser` valida de fato o token (não basta existir o cabeçalho) e
 * `requireCompanyAccess` confirma que a pessoa participa da empresa informada
 * no corpo do pedido — defesa em profundidade além das regras de RLS.
 */
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export type AuthedUser = { id: string; token: string };

/** Cliente com privilégio de serviço (uso interno de verificação). */
export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

/** Cliente que respeita RLS, no contexto do chamador. */
export function callerClient(token: string): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
}

/** Valida o JWT do cabeçalho. Devolve null quando ausente ou inválido. */
export async function requireUser(req: Request): Promise<AuthedUser | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return null;
  const admin = serviceClient();
  const { data, error } = await admin.auth.getClaims(token);
  const sub = data?.claims?.sub as string | undefined;
  if (error || !sub) return null;
  return { id: sub, token };
}

export type CompanyAccess = {
  isOwner: boolean;
  memberRole: string | null;
  colaboradorId: string | null;
};

/**
 * Acesso à empresa: dono, membro (company_members) ou colaborador do módulo
 * Pessoas vinculado à mesma empresa. Devolve null quando não há vínculo.
 */
export async function requireCompanyAccess(
  userId: string,
  companyId: string,
): Promise<CompanyAccess | null> {
  const admin = serviceClient();

  const [{ data: company }, { data: member }, { data: colaborador }] = await Promise.all([
    admin.from("companies").select("id").eq("id", companyId).eq("user_id", userId).maybeSingle(),
    admin
      .from("company_members")
      .select("role")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("dp_colaboradores")
      .select("id")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const isOwner = !!company;
  const memberRole = (member?.role as string | undefined) ?? null;
  const colaboradorId = (colaborador?.id as string | undefined) ?? null;
  if (!isOwner && !memberRole && !colaboradorId) return null;
  return { isOwner, memberRole, colaboradorId };
}

/** true quando a pessoa pode administrar a empresa (dono, owner ou admin). */
export function canAdminister(access: CompanyAccess): boolean {
  return access.isOwner || access.memberRole === "owner" || access.memberRole === "admin";
}
