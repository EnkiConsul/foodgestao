import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/** Mesmo aviso do Calendário de Folgas: distribuições automáticas que passaram do limite. */
export function AvisoAutoatribuicaoExcedida({ companyId }: { companyId: string | null | undefined }) {
  const q = useQuery({
    queryKey: ["dp_folga_auto_exec", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_folga_autoatribuicao_execucoes")
        .select("id, competencia, quantidade_gerada, quantidade_excedida")
        .eq("company_id", companyId!)
        .gt("quantidade_excedida", 0)
        .order("competencia", { ascending: false })
        .limit(3);
      if (error) throw error;
      return data ?? [];
    },
  });
  const itens = q.data ?? [];
  if (!itens.length) return null;
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-500/10 p-3 sm:p-4">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="min-w-0 space-y-1 text-sm">
          <p className="font-semibold text-amber-800 dark:text-amber-300">Folgas definidas automaticamente acima do limite</p>
          {itens.map((e) => (
            <p key={e.id} className="text-xs text-amber-800/90 dark:text-amber-200/90">
              {format(new Date(`${e.competencia}T00:00:00`), "MMMM 'de' yyyy", { locale: ptBR })}:{" "}
              {e.quantidade_gerada} folga(s) definida(s) pelo sistema, sendo {e.quantidade_excedida} em dias que já
              estavam no limite. Revise esses dias no calendário.
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
