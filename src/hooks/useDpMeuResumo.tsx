import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type DpMeuResumo = {
  nome: string | null;
  cargo: string | null;
} | null;

/**
 * Retorna nome e cargo do colaborador vinculado ao usuário autenticado
 * (via dp_colaboradores + dp_cargos). Usado no rodapé do sidebar do DP.
 */
export function useDpMeuResumo(): DpMeuResumo {
  const { user } = useAuth();
  const [data, setData] = useState<DpMeuResumo>(null);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setData(null);
      return;
    }
    supabase
      .from("dp_colaboradores")
      .select("nome, cargo:dp_cargos(nome)")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data: row }) => {
        if (cancelled) return;
        if (!row) {
          setData(null);
          return;
        }
        const cargoNome =
          row.cargo && typeof row.cargo === "object" && "nome" in row.cargo
            ? (row.cargo as { nome: string | null }).nome
            : null;
        setData({ nome: row.nome ?? null, cargo: cargoNome });
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return data;
}
