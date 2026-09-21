import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Aviso opcional de verificação em duas etapas (2FA).
 *
 * Regras: nunca bloqueia nada, nunca tem prazo. Só aparece quando o usuário
 * está autenticado, ainda não tem fator verificado, não marcou "Não mostrar
 * novamente" e o aviso não foi exibido hoje. Em qualquer erro, não aparece
 * (fail closed a favor de não incomodar).
 */
export type MfaNudge = {
  mostrar: boolean;
  fechar: (naoMostrarNovamente: boolean) => Promise<void>;
};

const mesmoDia = (iso: string | null | undefined) => {
  if (!iso) return false;
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return false;
  const hoje = new Date();
  return (
    data.getFullYear() === hoje.getFullYear() &&
    data.getMonth() === hoje.getMonth() &&
    data.getDate() === hoje.getDate()
  );
};

export async function avaliarAvisoMfa(): Promise<boolean> {
  try {
    const { data: fatores, error: erroFatores } = await supabase.auth.mfa.listFactors();
    if (erroFatores) return false;
    const verificado = (fatores?.totp ?? []).some((f) => f.status === "verified");
    if (verificado) return false;

    const { data, error } = await supabase.rpc("fn_mfa_nudge_estado");
    if (error) return false;
    const estado = Array.isArray(data) ? data[0] : data;
    if (estado?.opt_out) return false;
    if (mesmoDia(estado?.last_shown_at)) return false;
    return true;
  } catch {
    return false;
  }
}

export function useMfaNudge(): MfaNudge {
  const { user } = useAuth();
  const [mostrar, setMostrar] = useState(false);

  useEffect(() => {
    let cancelado = false;
    if (!user?.id) {
      setMostrar(false);
      return;
    }
    const chaveSessao = `mfa_nudge_${user.id}`;
    if (sessionStorage.getItem(chaveSessao)) return;

    void avaliarAvisoMfa().then((deveMostrar) => {
      if (cancelado || !deveMostrar) return;
      sessionStorage.setItem(chaveSessao, "1");
      setMostrar(true);
      // Registra a exibição para não repetir no mesmo dia em outros acessos.
      void supabase.rpc("fn_mfa_nudge_registrar", { _opt_out: false });
    });

    return () => {
      cancelado = true;
    };
  }, [user?.id]);

  const fechar = useCallback(async (naoMostrarNovamente: boolean) => {
    setMostrar(false);
    if (!naoMostrarNovamente) return;
    await supabase.rpc("fn_mfa_nudge_registrar", { _opt_out: true });
  }, []);

  return { mostrar, fechar };
}
