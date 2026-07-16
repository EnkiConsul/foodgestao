import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { CalendarDays } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { FolgaCalendar, type FolgaCell } from "@/components/dp/FolgaCalendar";
import { DpContentCard, DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const TIPO_FILTROS: { value: string; label: string }[] = [
  { value: "folga", label: "Folga" },
  { value: "ferias", label: "Férias" },
  { value: "atestado", label: "Atestado" },
  { value: "outro", label: "Outro" },
];

export default function DpMeuCalendario() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const today = new Date();
  const [ano, setAno] = useState(today.getFullYear());
  const [mes, setMes] = useState(today.getMonth() + 1);
  const [tipos, setTipos] = useState<string[]>([]);

  const meRef = useQuery({
    queryKey: ["dp_colaborador_of", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.rpc("dp_colaborador_of", { _user_id: user!.id });
      if (!data) return null;
      const { data: c } = await supabase
        .from("dp_colaboradores").select("id, company_id, nome").eq("id", data).single();
      return c;
    },
  });

  const range = useMemo(() => {
    const s = startOfMonth(new Date(ano, mes - 1, 1));
    const e = endOfMonth(s);
    return { start: format(s, "yyyy-MM-dd"), end: format(e, "yyyy-MM-dd") };
  }, [ano, mes]);

  const folgasQuery = useQuery({
    queryKey: ["dp_folgas_meu", meRef.data?.company_id, ano, mes],
    enabled: !!meRef.data?.company_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_folgas")
        .select("id, data, colaborador_id, status, tipo, extra, origem, dp_colaboradores(nome)")
        .eq("company_id", meRef.data!.company_id!)
        .gte("data", range.start).lte("data", range.end);
      if (error) throw error;
      return (data ?? []).map((f: any) => ({
        id: f.id, data: f.data, colaborador_id: f.colaborador_id,
        colaborador_nome: f.dp_colaboradores?.nome, status: f.status,
        tipo: f.tipo, extra: f.extra, origem: f.origem,
      })) as FolgaCell[];
    },
  });

  const folgasFiltradas = useMemo(() => {
    const list = folgasQuery.data ?? [];
    if (!tipos.length) return list;
    return list.filter((f) => tipos.includes(f.tipo as any));
  }, [folgasQuery.data, tipos]);

  const bloqueiosQuery = useQuery({
    queryKey: ["dp_datas_bloqueadas_meu", meRef.data?.company_id, ano, mes],
    enabled: !!meRef.data?.company_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("dp_datas_bloqueadas").select("data, motivo")
        .eq("company_id", meRef.data!.company_id!)
        .gte("data", range.start).lte("data", range.end);
      return data ?? [];
    },
  });

  const diaConfigQuery = useQuery({
    queryKey: ["dp_dia_config_meu", meRef.data?.company_id, ano, mes],
    enabled: !!meRef.data?.company_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("dp_dia_config").select("data, limite_folgas")
        .eq("company_id", meRef.data!.company_id!)
        .is("unidade_id", null)
        .gte("data", range.start).lte("data", range.end);
      const m: Record<string, number> = {};
      for (const r of data ?? []) m[r.data as string] = r.limite_folgas as number;
      return m;
    },
  });

  const toggleTipo = (v: string) =>
    setTipos((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));

  return (
    <DpPage>
      <Helmet><title>Calendário — Portal</title></Helmet>
      <DpPageHeader icon={CalendarDays} title="Calendário de folgas" />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground mr-1">Filtrar por tipo:</span>
        {TIPO_FILTROS.map((t) => {
          const active = tipos.includes(t.value);
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => toggleTipo(t.value)}
              className={cn(
                "text-xs rounded-full border px-2.5 py-1 transition-colors",
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-foreground/70 border-[hsl(var(--dp-border))] hover:bg-accent",
              )}
            >
              {t.label}
            </button>
          );
        })}
        {tipos.length > 0 && (
          <Badge variant="outline" className="text-[10px]">
            {folgasFiltradas.length} de {folgasQuery.data?.length ?? 0}
          </Badge>
        )}
      </div>

      <DpContentCard contentClassName="p-4 md:p-6">
        <FolgaCalendar
          ano={ano} mes={mes}
          folgas={folgasFiltradas}
          datasBloqueadas={bloqueiosQuery.data ?? []}
          diaConfigLimite={diaConfigQuery.data ?? {}}
          onChangeMonth={(a, m) => { setAno(a); setMes(m); }}
          onDayClick={(iso) => navigate(`/dp/meu/solicitacoes?data=${iso}`)}
          highlightColaboradorId={meRef.data?.id}
        />
      </DpContentCard>
      <p className="text-xs text-muted-foreground">
        Clique em um dia para abrir uma nova solicitação já com a data preenchida. Suas folgas aparecem destacadas com borda.
      </p>
    </DpPage>
  );
}
