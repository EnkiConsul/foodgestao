import { Users, UserCheck, Cake, Wallet } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpAniversariantes30d } from "@/hooks/useDpAniversariantes30d";
import { useDpPendencias } from "@/hooks/useDpPendencias";

function Kpi({ icon: Icon, label, value, hint }: { icon: any; label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 flex items-center gap-4">
      <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] sm:text-xs uppercase tracking-wider text-muted-foreground leading-tight whitespace-normal break-normal [overflow-wrap:normal] hyphens-none">{label}</p>
        <p className="text-2xl font-semibold leading-tight">{value}</p>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

export function KpiCards() {
  const { selectedCompanyId } = useCompanyContext();
  const aniv = useDpAniversariantes30d();
  const pend = useDpPendencias();

  const colabs = useQuery({
    queryKey: ["dp_kpi_colab", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_colaboradores")
        .select("id, ativo")
        .eq("company_id", selectedCompanyId!);
      if (error) throw error;
      const total = data?.length ?? 0;
      const ativos = (data ?? []).filter((c) => c.ativo).length;
      return { total, ativos };
    },
  });

  const anivHoje = (aniv.data ?? []).filter((a) => a.faltamDias === 0).length;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Kpi icon={Users} label="Colaboradores ativos" value={colabs.data?.ativos ?? "—"} hint={`Total: ${colabs.data?.total ?? 0}`} />
      <Kpi icon={UserCheck} label="Pendências abertas" value={pend.data?.length ?? "—"} />
      <Kpi icon={Cake} label="Aniversariantes hoje" value={anivHoje} hint={`${aniv.data?.length ?? 0} nos próximos 30d`} />
    </div>
  );
}
