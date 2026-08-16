import { Helmet } from "react-helmet-async";
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { addDays, addMonths, endOfMonth, format, isSaturday, isSunday, nextSaturday, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Shield, Users, CalendarCheck, Calendar, ClipboardList, ArrowLeftRight, Ban, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { DpPage, DpPageHeader, DpContentCard } from "@/components/dp/DpPage";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type Stat = {
  label: string;
  value: string;
  icon: typeof Users;
  tone: string;
};

export default function DpFolgasHub() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const today = new Date();
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);

  const { data: colaboradores = [] } = useQuery({
    queryKey: ["dp_colaboradores_ativos", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_colaboradores")
        .select("id, ativo, folga_fixa_semana")
        .eq("company_id", selectedCompanyId!)
        .eq("ativo", true);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: folgasMesData = [] } = useQuery({
    queryKey: ["dp_folgas_hub_mes", selectedCompanyId, format(monthStart, "yyyy-MM")],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_folgas")
        .select("id, data, status")
        .eq("company_id", selectedCompanyId!)
        .gte("data", format(monthStart, "yyyy-MM-dd"))
        .lte("data", format(monthEnd, "yyyy-MM-dd"));
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: solicitacoes = [] } = useQuery({
    queryKey: ["dp_folgas_hub_sol", selectedCompanyId, format(monthStart, "yyyy-MM")],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_solicitacoes")
        .select("id, tipo, status, data_alvo, data_fim")
        .eq("company_id", selectedCompanyId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: trocas = [] } = useQuery({
    queryKey: ["dp_trocas_pendentes", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_trocas")
        .select("id, status")
        .eq("company_id", selectedCompanyId!)
        .in("status", ["pendente_colega", "pendente_gestor"]);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: bloqueios = [] } = useQuery({
    queryKey: ["dp_bloqueios_ativos", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_bloqueios")
        .select("id, inicio, fim, ativo")
        .eq("company_id", selectedCompanyId!)
        .eq("ativo", true);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: diaConfig = {} } = useQuery({
    queryKey: ["dp_dia_config_hub", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_dia_config")
        .select("data, limite_folgas")
        .eq("company_id", selectedCompanyId!)
        .is("unidade_id", null);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const r of data ?? []) map[r.data as string] = r.limite_folgas as number;
      return map;
    },
  });

  const equipeAtiva = colaboradores.length;
  const todayStr = format(today, "yyyy-MM-dd");
  const todayDow = today.getDay();
  const folgasHojeSolic = solicitacoes.filter(
    (s) => s.tipo === "folga" && s.status === "aprovada" && s.data_alvo === todayStr,
  ).length;
  const folgasHojeRegistradas = folgasMesData.filter((f: any) => f.data === todayStr).length;
  const folgasHojeFixas = colaboradores.filter(
    (c: any) => Number(c.folga_fixa_semana) === todayDow,
  ).length;
  const folgasHoje = folgasHojeSolic + folgasHojeRegistradas + folgasHojeFixas;
  const folgasMes =
    folgasMesData.length +
    solicitacoes.filter((s) => {
      if (s.tipo !== "folga" || s.status !== "aprovada" || !s.data_alvo) return false;
      return s.data_alvo >= format(monthStart, "yyyy-MM-dd") && s.data_alvo <= format(monthEnd, "yyyy-MM-dd");
    }).length;
  const pedidosEspeciais = solicitacoes.filter(
    (s) => s.status === "pendente" && s.tipo !== "folga",
  ).length;

  const diasBloqueados = useMemo(() => {
    const set = new Set<string>();
    for (const b of bloqueios) {
      const start = new Date(b.inicio);
      const end = b.fim ? new Date(b.fim) : start;
      for (let d = start; d <= end; d = addDays(d, 1)) {
        set.add(format(d, "yyyy-MM-dd"));
      }
    }
    return set.size;
  }, [bloqueios]);

  const stats: Stat[] = [
    { label: "EQUIPE ATIVA", value: String(equipeAtiva), icon: Users, tone: "bg-blue-100 text-blue-600" },
    { label: "FOLGAS HOJE", value: `${folgasHoje} / ${equipeAtiva || 0}`, icon: CalendarCheck, tone: "bg-violet-100 text-violet-600" },
    { label: "FOLGAS NO MÊS", value: String(folgasMes), icon: Calendar, tone: "bg-emerald-100 text-emerald-600" },
    { label: "PEDIDOS ESPECIAIS", value: String(pedidosEspeciais), icon: ClipboardList, tone: "bg-orange-100 text-orange-600" },
    { label: "TROCAS PENDENTES", value: String(trocas.length), icon: ArrowLeftRight, tone: "bg-purple-100 text-purple-600" },
    { label: "DIAS BLOQUEADOS", value: String(diasBloqueados), icon: Ban, tone: "bg-red-100 text-red-600" },
  ];

  // Próximos 4 fins de semana (sábado + domingo)
  const proximosDias = useMemo(() => {
    const dias: Date[] = [];
    let d = isSaturday(today) ? today : nextSaturday(today);
    for (let i = 0; i < 4; i++) {
      dias.push(d);
      dias.push(addDays(d, 1));
      d = addDays(d, 7);
    }
    return dias;
  }, [today]);

  const ocupacaoPorDia = useMemo(() => {
    return proximosDias.map((dia) => {
      const key = format(dia, "yyyy-MM-dd");
      const ocupados = solicitacoes.filter(
        (s) => s.tipo === "folga" && s.status === "aprovada" && s.data_alvo === key,
      ).length;
      // Prioridade: limite configurado em dp_dia_config; fallback ~10% da equipe.
      const configurado = diaConfig[key];
      const cap = configurado && configurado > 0
        ? configurado
        : Math.max(1, Math.round(equipeAtiva * 0.1));
      const pct = Math.min(100, Math.round((ocupados / cap) * 100));
      return { dia, ocupados, cap, pct, configurado: !!(configurado && configurado > 0) };
    });
  }, [proximosDias, solicitacoes, equipeAtiva, diaConfig]);

  const proximoMes = addMonths(today, 1);
  const sortear = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("Sem empresa");
      const { data, error } = await supabase.functions.invoke("dp-sorteio-folgas", {
        body: {
          company_id: selectedCompanyId,
          ano: proximoMes.getFullYear(),
          mes: proximoMes.getMonth() + 1,
          regenerar_prioridades: true,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(`Sorteio concluído: ${data?.inseridas ?? 0} folgas inseridas`);
      if (data?.ignoradas?.length) toast.info(`${data.ignoradas.length} ignoradas (limites/bloqueios)`);
      qc.invalidateQueries({ queryKey: ["dp_folgas_hub_sol"] });
      qc.invalidateQueries({ queryKey: ["dp_folgas_admin"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro no sorteio"),
  });

  return (
    <DpPage>
      <Helmet><title>Dashboard de Folgas — Pessoas 360°</title></Helmet>
      <DpPageHeader
        icon={Shield}
        title="Dashboard de Folgas"
        description="Visão geral das escalas e solicitações."
        actions={
          <Button className="gap-2" onClick={() => sortear.mutate()} disabled={sortear.isPending}>
            {sortear.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Sortear folgas de {format(proximoMes, "MMMM/yyyy", { locale: ptBR })}
          </Button>
        }
      />

      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-[hsl(var(--dp-border))] bg-card p-4 flex items-start justify-between gap-3"
          >
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground leading-tight">
                {s.label}
              </p>
              <p className="text-2xl font-bold text-foreground mt-2">{s.value}</p>
            </div>
            <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", s.tone)}>
              <s.icon className="h-4 w-4" />
            </div>
          </div>
        ))}
      </div>

      <DpContentCard contentClassName="p-4 md:p-5">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-foreground">Ocupação dos Próximos Fins de Semana</h2>
        </div>
        <div className="space-y-4">
          {ocupacaoPorDia.map(({ dia, ocupados, cap, pct, configurado }) => {
            const lotado = pct >= 100;
            return (
              <div key={dia.toISOString()} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-foreground">
                    {format(dia, "dd/MM/yyyy", { locale: ptBR })}
                    <span className="ml-2 text-xs text-muted-foreground uppercase">
                      {isSunday(dia) ? "Domingo" : "Sábado"}
                    </span>
                  </p>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs",
                      lotado
                        ? "bg-orange-50 text-orange-700 border-orange-200"
                        : "bg-emerald-50 text-emerald-700 border-emerald-200",
                    )}
                  >
                    {lotado ? "Lotado" : "Disponível"}
                  </Badge>
                </div>
                <Progress value={pct} className="h-2" />
                <div className="flex justify-between gap-4 text-xs text-muted-foreground">
                  <span>{configurado ? "Limite configurado" : "Capacidade estimada (10% da equipe)"}</span>
                  <div className="flex gap-3">
                    <span>{ocupados}/{cap}</span>
                    <span>{pct}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </DpContentCard>
    </DpPage>
  );
}
