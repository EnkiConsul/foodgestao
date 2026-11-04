import { useQuery } from "@tanstack/react-query";
import { format, addDays } from "date-fns";
import { CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { etapaFeriado, mensagemFeriado, diasAte } from "@/lib/dp/feriado-regua";

interface Props { companyId: string | null | undefined; unidadeId?: string | null }

export function FeriadosProximosAlerta({ companyId, unidadeId }: Props) {
  const hoje = format(new Date(), "yyyy-MM-dd");
  const fim = format(addDays(new Date(), 10), "yyyy-MM-dd");
  const q = useQuery({
    queryKey: ["dp-feriados-regua", companyId, unidadeId, hoje],
    enabled: !!companyId,
    queryFn: async () => {
      let uq = supabase.from("dp_unidades").select("id, nome, convoca_feriados_automatico").eq("company_id", companyId!);
      if (unidadeId) uq = uq.eq("id", unidadeId);
      const { data: unidades, error } = await uq;
      if (error) throw error;
      const itens: { unidade: string; auto: boolean; data: string; nome: string }[] = [];
      for (const u of unidades ?? []) {
        const { data } = await supabase.rpc("dp_feriados_resolver_v2", { _unidade_id: u.id, _inicio: hoje, _fim: fim });
        for (const f of (data ?? []) as { data: string; nome: string }[]) {
          itens.push({ unidade: u.nome, auto: !!u.convoca_feriados_automatico, data: f.data, nome: f.nome });
        }
      }
      return itens.sort((a, b) => a.data.localeCompare(b.data));
    },
  });

  const itens = (q.data ?? []).filter((i) => etapaFeriado(hoje, i.data));
  if (!itens.length) return null;

  return (
    <div className="space-y-2" role="status">
      {itens.map((i) => {
        const etapa = etapaFeriado(hoje, i.data)!;
        const d = diasAte(hoje, i.data);
        return (
          <div key={`${i.unidade}-${i.data}`} className="flex gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
            <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div className="min-w-0">
              <p className="font-medium">
                {i.nome} — {i.data.split("-").reverse().join("/")} · {i.unidade} ({d === 0 ? "hoje" : `em ${d} dia${d > 1 ? "s" : ""}`})
              </p>
              <p className="text-muted-foreground">{mensagemFeriado(etapa, i.auto)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
