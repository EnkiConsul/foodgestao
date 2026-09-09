import { supabase } from "@/integrations/supabase/client";

export const INVITE_TOKEN_KEY = "invite_token";

export interface ConsumedInvite {
  accepted: boolean;
  companyName?: string | null;
  error?: string;
}

/**
 * Aceita automaticamente o convite guardado quando a pessoa abriu o link do
 * e-mail antes de ter conta/login. Chamado logo após autenticar.
 */
export async function consumePendingInviteToken(): Promise<ConsumedInvite> {
  let token: string | null = null;
  try {
    token = sessionStorage.getItem(INVITE_TOKEN_KEY);
  } catch {
    return { accepted: false };
  }
  if (!token) return { accepted: false };

  try {
    const { data, error } = await supabase.functions.invoke("accept-invite", { body: { token } });
    const errMsg = (data as any)?.error || error?.message;
    if (errMsg) return { accepted: false, error: errMsg };
    try {
      sessionStorage.removeItem(INVITE_TOKEN_KEY);
    } catch { /* noop */ }
    return { accepted: true, companyName: (data as any)?.company_name ?? null };
  } catch (e) {
    return { accepted: false, error: e instanceof Error ? e.message : String(e) };
  }
}
