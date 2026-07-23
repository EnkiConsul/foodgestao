import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";

export interface UnifiedSignInResult {
  ok: boolean;
  errorMessage?: string;
  passwordChangeRequired?: boolean;
  identifierSource?: "email" | "cpf";
}

export async function unifiedSignIn(
  identifier: string,
  password: string,
  turnstileToken: string,
): Promise<UnifiedSignInResult> {
  try {
    const { data, error } = await supabase.functions.invoke("auth-login", {
      body: { identifier, password, turnstile_token: turnstileToken },
    });
    if (error) {
      let msg = "Não foi possível entrar. Tente novamente.";
      if (error instanceof FunctionsHttpError) {
        try {
          const body = await error.context.json();
          if (body?.error) msg = body.error;
        } catch { /* keep default */ }
      }
      return { ok: false, errorMessage: msg };
    }
    if (!data?.session?.access_token || !data?.session?.refresh_token) {
      return { ok: false, errorMessage: "Sessão inválida retornada pelo servidor." };
    }
    const { error: setErr } = await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
    if (setErr) return { ok: false, errorMessage: setErr.message };
    return {
      ok: true,
      passwordChangeRequired: !!data.password_change_required,
      identifierSource: data.identifier_source,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, errorMessage: msg };
  }
}
