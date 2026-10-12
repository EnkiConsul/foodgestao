import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageSpinner } from "@/components/PageSpinner";

/**
 * Rota de saída direta: encerra a sessão e volta para o login.
 * Útil quando o usuário fica preso em uma tela sem botão de sair.
 */
export default function Sair() {
  const navigate = useNavigate();

  useEffect(() => {
    let ativo = true;
    supabase.auth.signOut().finally(() => {
      if (ativo) navigate("/login", { replace: true });
    });
    return () => {
      ativo = false;
    };
  }, [navigate]);

  return <PageSpinner />;
}
