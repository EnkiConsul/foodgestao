import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { acessoPortalAtivo, diasRestantesCarencia } from "@/lib/dp/desligamento";

/** Banner exibido a colaboradores desligados durante o período de carência do portal. */
export function CarenciaPortalBanner() {
  const { user } = useAuth();

  const q = useQuery({
    queryKey: ["dp_carencia_portal", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_colaboradores")
        .select("ativo, data_desligamento, acesso_portal_ate")
        .eq("user_id", user!.id)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as { ativo: boolean; data_desligamento: string | null; acesso_portal_ate: string | null } | null;
    },
  });

  const c = q.data;
  if (!c || c.ativo || !acessoPortalAtivo(c.acesso_portal_ate)) return null;

  const dias = diasRestantesCarencia(c.acesso_portal_ate) ?? 0;

  return (
    <div className="mx-3 mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div>
          <div className="font-semibold text-amber-700 dark:text-amber-400">
            Acesso encerra em {dias} {dias === 1 ? "dia" : "dias"}
          </div>
          <p className="text-muted-foreground mt-0.5">
            Seu vínculo foi encerrado
            {c.data_desligamento
              ? ` em ${new Date(`${c.data_desligamento}T12:00:00`).toLocaleDateString("pt-BR")}`
              : ""}
            . Você ainda pode consultar e baixar seus documentos até{" "}
            <strong>
              {c.acesso_portal_ate
                ? new Date(`${c.acesso_portal_ate}T12:00:00`).toLocaleDateString("pt-BR")
                : "—"}
            </strong>
            . Novas solicitações, folgas e trocas estão desativadas.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Indica se o colaborador logado está em período de carência (somente leitura). */
export function useCarenciaPortal() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["dp_carencia_portal", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_colaboradores")
        .select("ativo, data_desligamento, acesso_portal_ate")
        .eq("user_id", user!.id)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as { ativo: boolean; data_desligamento: string | null; acesso_portal_ate: string | null } | null;
    },
  });
  return { somenteLeitura: !!q.data && !q.data.ativo, isLoading: q.isLoading };
}
