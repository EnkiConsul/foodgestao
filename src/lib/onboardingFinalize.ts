import { supabase } from "@/integrations/supabase/client";

/**
 * Marca o onboarding como concluído no perfil do usuário.
 *
 * IMPORTANTE: não gravar `profile_type` aqui — o enum `profile_type` no banco
 * só aceita `pf | mei | microempresa | hibrido`. Passar valores fora do enum
 * (ex.: "empresarial") derruba o PATCH com 400 e impede a conclusão do wizard.
 */
export async function marcarOnboardingConcluido(userId: string): Promise<{ ok: boolean; error?: unknown }> {
  const { error } = await supabase
    .from("profiles")
    .update({ onboarding_completed: true })
    .eq("user_id", userId);

  if (error) {
    console.error("[onboarding] falha ao marcar onboarding_completed", error);
    return { ok: false, error };
  }
  return { ok: true };
}
