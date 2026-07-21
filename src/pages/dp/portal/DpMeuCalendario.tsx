import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { eachDayOfInterval, endOfMonth, startOfMonth } from "date-fns";
import { CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { FolgaCalendarShared } from "@/components/dp/FolgaCalendarShared";
import { DpContentCard, DpPage, DpPageHeader } from "@/components/dp/DpPage";
import {
  buildOccupantsByDate,
  calculateDateStatus,
  parseYMD,
  ymd,
  type ColaboradorRecord,
  type FolgaRecord,
} from "@/lib/dp/folga-rules";

export default function DpMeuCalendario() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const today = new Date();
  const [ano, setAno] = useState(today.getFullYear());
  const [mes, setMes] = useState(today.getMonth() + 1);

  const meRef = useQuery({
    queryKey: ["dp_colaborador_of", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.rpc("dp_colaborador_of", { _user_id: user!.id });
      if (!data) return null;
      const { data: c } = await supabase
        .from("dp_colaboradores")
        .select("id, company_id, nome, folga_fixa_semana, ativo, unidade_id")
        .eq("id", data)
        .single();
      return c;
    },
  });

  const range = useMemo(() => {
    const s = startOfMonth(new Date(ano, mes - 1, 1));
    const e = endOfMonth(s);
    return { start: ymd(s), end: ymd(e), startDate: s, endDate: e };
  }, [ano, mes]);

  const companyId = meRef.data?.company_id;

  const colaboradoresQuery = useQuery({
    queryKey: ["dp_colabs_meu_cal", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_colaboradores")
        .select("id, nome, folga_fixa_semana, ativo, unidade_id")
        .eq("company_id", companyId!);
      if (error) throw error;
      return (data ?? []) as ColaboradorRecord[];
    },
  });

  const folgasQuery = useQuery({
    queryKey: ["dp_folgas_meu_cal", companyId, ano, mes],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_folgas")
        .select("id, data, colaborador_id, status, tipo, extra, origem, criado_por, dp_colaboradores(nome, unidade_id)")
        .eq("company_id", companyId!)
        .gte("data", range.start)
        .lte("data", range.end);
      if (error) throw error;
      return data ?? [];
    },
  });

  const pendentesQuery = useQuery({
    queryKey: ["dp_solic_meu_cal", companyId, ano, mes],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_solicitacoes")
        .select("id, colaborador_id, data_alvo, tipo, status, dp_colaboradores(nome, unidade_id)")
        .eq("company_id", companyId!)
        .eq("status", "pendente")
        .eq("tipo", "folga")
        .gte("data_alvo", range.start)
        .lte("data_alvo", range.end);
      if (error) throw error;
      return data ?? [];
    },
  });

  const bloqueiosQuery = useQuery({
    queryKey: ["dp_datas_bloq_meu_cal", companyId, ano, mes],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("dp_datas_bloqueadas")
        .select("data, motivo, liberada_por_solicitacao")
        .eq("company_id", companyId!)
        .gte("data", range.start)
        .lte("data", range.end);
      return data ?? [];
    },
  });

  const diaConfigQuery = useQuery({
    queryKey: ["dp_dia_config_meu_cal", companyId, ano, mes],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("dp_dia_config")
        .select("data, limite_folgas")
        .eq("company_id", companyId!)
        .is("unidade_id", null)
        .gte("data", range.start)
        .lte("data", range.end);
      return data ?? [];
    },
  });

  const colaboradores = colaboradoresQuery.data ?? [];
  const folgas = (folgasQuery.data ?? []) as any[];
  const pendentes = (pendentesQuery.data ?? []) as any[];

  const occupantsByDate = useMemo(() => {
    const days = eachDayOfInterval({ start: range.startDate, end: range.endDate });
    return buildOccupantsByDate({
      days,
      colaboradores,
      folgas,
      pendentes,
    });
  }, [colaboradores, folgas, pendentes, range.startDate, range.endDate]);

  const manualBlocked = useMemo(() => {
    const m = new Map<string, { reason: string; liberada: boolean }>();
    for (const b of bloqueiosQuery.data ?? []) {
      m.set((b as any).data, { reason: (b as any).motivo, liberada: !!(b as any).liberada_por_solicitacao });
    }
    return m;
  }, [bloqueiosQuery.data]);

  const dayLimits = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of diaConfigQuery.data ?? []) m.set((r as any).data, (r as any).limite_folgas);
    return m;
  }, [diaConfigQuery.data]);

  const allFolgasRecords: FolgaRecord[] = useMemo(
    () =>
      folgas.map((f: any) => ({
        colaborador_id: f.colaborador_id,
        data: f.data,
        tipo: f.tipo,
        extra: !!f.extra,
      })),
    [folgas],
  );

  const pendingRequests = useMemo(
    () => pendentes.map((p: any) => ({ data: p.data_alvo, colaborador_id: p.colaborador_id })),
    [pendentes],
  );

  const goPrev = () => {
    const d = new Date(ano, mes - 2, 1);
    setAno(d.getFullYear());
    setMes(d.getMonth() + 1);
  };
  const goNext = () => {
    const d = new Date(ano, mes, 1);
    setAno(d.getFullYear());
    setMes(d.getMonth() + 1);
  };

  return (
    <DpPage>
      <Helmet>
        <title>Calendário — Portal</title>
      </Helmet>
      <DpPageHeader icon={CalendarDays} title="Calendário de folgas" />

      <DpContentCard contentClassName="p-4 md:p-6">
        <FolgaCalendarShared
          year={ano}
          month0={mes - 1}
          occupantsByDate={occupantsByDate}
          manualBlocked={manualBlocked}
          dayLimits={dayLimits}
          myColaboradorId={meRef.data?.id ?? null}
          allFolgas={allFolgasRecords}
          allColaboradores={colaboradores}
          pendingRequests={pendingRequests}
          isAdmin={false}
          variant="compact"
          onPrev={goPrev}
          onNext={goNext}
          onSelectDay={(iso) => {
            const st = calculateDateStatus({
              date: parseYMD(iso),
              myColaboradorId: meRef.data?.id ?? null,
              allFolgas: allFolgasRecords,
              allColaboradores: colaboradores,
              manualBlocked,
              dayLimits,
              pendingRequests,
              isAdmin: false,
            });
            if (st.status === "taken") {
              toast.error(`Data indisponível. Limite de folgas atingido (${st.occupancy ?? 0}/${st.limit ?? 0}).`);
              return;
            }
            if (st.status === "blocked") {
              toast.error(`Data bloqueada pelo DP${st.reason ? `: ${st.reason}` : ""}.`);
              return;
            }
            if (st.status === "past") {
              toast.error("Não é possível solicitar folga em data passada.");
              return;
            }
            navigate(`/dp/meu/solicitacoes?data=${iso}`);
          }}
        />
      </DpContentCard>

      <p className="text-xs text-muted-foreground">
        Clique em um dia para abrir uma nova solicitação já com a data preenchida. Sua folga semanal fixa aparece
        marcada em azul.
      </p>
    </DpPage>
  );
}
