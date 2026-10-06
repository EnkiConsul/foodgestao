import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useCompanyAccess } from "@/hooks/useCompanyAccess";
import { useCompanyPermissions } from "@/hooks/useCompanyPermissions";

const NOME_MODULO: Record<string, string> = {
  financeiro: "Financeiro 360°",
  pessoas: "Pessoas 360°",
};

/**
 * Aviso fixo (não bloqueante) da carência pós-cortesia: uma linha por módulo
 * em carência, independente dos demais módulos. Só dono e administradores.
 */
export function CarenciaBanner() {
  const { selectedCompanyId } = useCompanyContext();
  const { access } = useCompanyAccess();
  const { role } = useCompanyPermissions();
  const autorizado = !!access?.isOwner || role === "owner" || role === "admin";

  const { data: itens = [] } = useQuery({
    queryKey: ["company-grace", selectedCompanyId],
    enabled: !!selectedCompanyId && autorizado,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("company_grace_subscriptions", {
        _company_id: selectedCompanyId,
      });
      if (error) throw error;
      return (data ?? []) as { subscription_id: string; module: string; grace_ends_at: string }[];
    },
  });

  if (!autorizado || itens.length === 0) return null;

  return (
    <div className="border-b border-primary/30 bg-primary/10 px-4 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Clock className="h-4 w-4 shrink-0 text-primary" />
        <div className="flex-1 space-y-0.5">
          {itens.map((i) => {
            const fim = new Date(i.grace_ends_at);
            const dias = Math.max(0, Math.ceil((fim.getTime() - Date.now()) / 86400000));
            const data = fim.toLocaleDateString("pt-BR", {
              timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit",
            });
            const modulo = NOME_MODULO[i.module] ?? "seu plano";
            return (
              <p key={i.subscription_id}>
                Sua cortesia do {modulo} foi encerrada. Você tem {dias} {dias === 1 ? "dia" : "dias"} (até {data}) para escolher um plano.
              </p>
            );
          })}
        </div>
        <Button asChild size="sm">
          <Link to="/planos">Escolher Plano</Link>
        </Button>
      </div>
    </div>
  );
}
