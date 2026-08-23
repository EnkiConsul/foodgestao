import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { eachDayOfInterval, endOfMonth, startOfMonth } from "date-fns";
import {
  AlertCircle,
  ArrowLeftRight,
  CalendarDays,
  Send,
  User as UserIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { FolgaCalendarShared } from "@/components/dp/FolgaCalendarShared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDpRegrasColaborador } from "@/hooks/useDpRegrasColaborador";
import { resumoEscolhaFolgas } from "@/lib/dp/dsr-rules";

import {
  buildOccupantsByDate,
  calculateDateStatus,
  dayType,
  formatBR,
  monthKey,
  normalizeWeekday,
  parseYMD,
  ymd,
  type ColaboradorRecord,
  type DateStatusKind,
  type FolgaRecord,
} from "@/lib/dp/folga-rules";
import { buildBloqueiosDeRegras, type RegraRow } from "@/lib/dp/bloqueio-rules";
import { cn } from "@/lib/utils";
import { CalendarioMobileLista } from "@/components/dp/CalendarioMobileLista";
import { SocioBloqueioDialog } from "@/components/dp/SocioBloqueioDialog";
import { isSocio } from "@/lib/dp/contrato-policy";

const STATUS_LABEL: Record<DateStatusKind, string> = {
  available: "Disponível",
  mine: "Sua folga",
  fixed: "Folga semanal",
  blocked: "Bloqueado",
  taken: "Lotado",
  past: "Passado",
  pending: "Pendente",
  birthday: "Aniversariante",
  swapped: "Troca aprovada",
  weekday: "Dia útil",
};

const STATUS_BADGE: Record<DateStatusKind, string> = {
  available: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
  mine: "bg-amber-500/10 text-amber-700 border-amber-200",
  fixed: "bg-blue-500/10 text-blue-700 border-blue-200",
  blocked: "bg-red-500/10 text-red-700 border-red-200",
  taken: "bg-red-500/10 text-red-700 border-red-200",
  past: "bg-muted text-muted-foreground border-transparent",
  pending: "bg-violet-500/10 text-violet-700 border-violet-200",
  birthday: "bg-amber-500/10 text-amber-700 border-amber-200",
  swapped: "bg-amber-500/10 text-amber-700 border-amber-200",
  weekday: "bg-muted text-muted-foreground border-transparent",
};

export default function DpMeuCalendario() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const today = new Date();
  const [ano, setAno] = useState(today.getFullYear());
  const [mes, setMes] = useState(today.getMonth() + 1);

  const [selectedDay, setSelectedDay] = useState<{ iso: string; status: DateStatusKind } | null>(null);
  const [exceptionOpen, setExceptionOpen] = useState(false);
  const [exceptionMotivo, setExceptionMotivo] = useState("");
  const [tradeOpen, setTradeOpen] = useState<{ occupantId: string; occupantName: string; iso: string } | null>(null);
  const [tradeMyDate, setTradeMyDate] = useState<string>("");
  const [tradeMotivo, setTradeMotivo] = useState("");
  const [socioBloqueio, setSocioBloqueio] = useState<{ nome: string; datas: string[]; unidadeId: string | null } | null>(
    null,
  );

  const meRef = useQuery({
    queryKey: ["dp_colaborador_of", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.rpc("dp_colaborador_of", { _user_id: user!.id });
      if (!data) return null;
      const { data: c } = await supabase
        .from("dp_colaboradores")
        .select("id, company_id, nome, sexo, domingos_folga_mes, folga_fixa_semana, ativo, unidade_id, vinculo_label")
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
  const myUnidade = meRef.data?.unidade_id ?? null;
  const { config: regrasConfig, diasElegiveis, tetoMensal } = useDpRegrasColaborador(companyId, myUnidade, (meRef.data as { sexo?: string | null } | undefined)?.sexo ?? null, (meRef.data as { domingos_folga_mes?: number | null } | undefined)?.domingos_folga_mes ?? null);
  const resumoFolgas = resumoEscolhaFolgas(regrasConfig, { sexo: (meRef.data as { sexo?: string | null } | undefined)?.sexo ?? null });
  /** No padrão CLT o sistema gera a folga dominical — o colaborador não marca nem remove. */
  const folgaCltAutomatica = folgaDominicalAutomatica(regrasConfig);



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

  const unidadesQuery = useQuery({
    queryKey: ["dp_unidades_ativas", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_unidades")
        .select("id, nome")
        .eq("company_id", companyId!)
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string }[];
    },
  });
  const unidadesLista = unidadesQuery.data ?? [];



  const folgasQuery = useQuery({
    queryKey: ["dp_folgas_meu_cal", companyId, ano, mes],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_folgas")
        .select(
          "id, data, colaborador_id, status, tipo, extra, origem, criado_por, dp_colaboradores(nome, unidade_id)",
        )
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
        .select("data, motivo, liberada_por_solicitacao, unidade_id")
        .eq("company_id", companyId!)
        .gte("data", range.start)
        .lte("data", range.end);
      return data ?? [];
    },
  });

  const regrasBloqueioQuery = useQuery({
    queryKey: ["dp_bloq_regras_meu_cal", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const [{ data: regras }, { data: vinc }] = await Promise.all([
        supabase
          .from("dp_bloqueio_regras")
          .select("id, company_id, nome, tipo, mes, dia, regra_json, ativo")
          .eq("company_id", companyId!)
          .eq("ativo", true),
        supabase
          .from("dp_bloqueio_regra_unidades")
          .select("regra_id, unidade_id"),
      ]);
      return {
        regras: (regras ?? []) as RegraRow[],
        vinculos: (vinc ?? []) as { regra_id: string; unidade_id: string }[],
      };
    },
  });

  const diaConfigQuery = useQuery({
    queryKey: ["dp_dia_config_meu_cal", companyId, ano, mes],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("dp_dia_config")
        .select("data, limite_folgas, unidade_id")
        .eq("company_id", companyId!)
        .gte("data", range.start)
        .lte("data", range.end);
      return data ?? [];
    },
  });

  // Realtime — invalida queries quando qualquer fonte muda
  useEffect(() => {
    if (!companyId) return;
    const ch = supabase
      .channel(`cal-portal-${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "dp_folgas", filter: `company_id=eq.${companyId}` }, () => {
        qc.invalidateQueries({ queryKey: ["dp_folgas_meu_cal"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "dp_solicitacoes", filter: `company_id=eq.${companyId}` }, () => {
        qc.invalidateQueries({ queryKey: ["dp_solic_meu_cal"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "dp_datas_bloqueadas", filter: `company_id=eq.${companyId}` }, () => {
        qc.invalidateQueries({ queryKey: ["dp_datas_bloq_meu_cal"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "dp_dia_config", filter: `company_id=eq.${companyId}` }, () => {
        qc.invalidateQueries({ queryKey: ["dp_dia_config_meu_cal"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "dp_bloqueio_regras", filter: `company_id=eq.${companyId}` }, () => {
        qc.invalidateQueries({ queryKey: ["dp_bloq_regras_meu_cal"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "dp_bloqueio_regra_unidades" }, () => {
        qc.invalidateQueries({ queryKey: ["dp_bloq_regras_meu_cal"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [companyId, qc]);

  const colaboradoresAll = colaboradoresQuery.data ?? [];
  // Filtra colaboradores da minha unidade (se eu tiver)
  const colaboradores = useMemo(
    () => (myUnidade ? colaboradoresAll.filter((c) => c.unidade_id === myUnidade) : colaboradoresAll),
    [colaboradoresAll, myUnidade],
  );
  const folgas = (folgasQuery.data ?? []) as any[];
  const pendentes = (pendentesQuery.data ?? []) as any[];

  const occupantsByDate = useMemo(() => {
    const days = eachDayOfInterval({ start: range.startDate, end: range.endDate });
    // Também filtra folgas/pendentes pela unidade
    const filteredFolgas = myUnidade
      ? folgas.filter((f) => f.dp_colaboradores?.unidade_id === myUnidade)
      : folgas;
    const filteredPend = myUnidade
      ? pendentes.filter((p) => p.dp_colaboradores?.unidade_id === myUnidade)
      : pendentes;
    return buildOccupantsByDate({
      days,
      colaboradores,
      folgas: filteredFolgas,
      pendentes: filteredPend,
    });
  }, [colaboradores, folgas, pendentes, myUnidade, range.startDate, range.endDate]);

  const manualBlocked = useMemo(() => {
    const m = new Map<string, { reason: string; liberada: boolean }>();
    // 1) datas pontuais em dp_datas_bloqueadas
    for (const b of bloqueiosQuery.data ?? []) {
      const row = b as any;
      if (row.unidade_id !== null && row.unidade_id !== myUnidade) continue;
      m.set(row.data, { reason: row.motivo, liberada: !!row.liberada_por_solicitacao });
    }
    // 2) regras dinâmicas expandidas em runtime — não sobrescreve liberação individual
    const regrasData = regrasBloqueioQuery.data;
    if (regrasData) {
      const fromRegras = buildBloqueiosDeRegras({
        regras: regrasData.regras,
        vinculos: regrasData.vinculos,
        unidadeId: myUnidade,
        from: range.startDate,
        to: range.endDate,
      });
      fromRegras.forEach((motivo, iso) => {
        if (!m.has(iso)) m.set(iso, { reason: motivo, liberada: false });
      });
    }
    return m;
  }, [bloqueiosQuery.data, regrasBloqueioQuery.data, myUnidade, range.startDate, range.endDate]);

  const dayLimits = useMemo(() => {
    const m = new Map<string, number>();
    const rows = [...(diaConfigQuery.data ?? [])] as any[];
    // prioriza unidade específica sobre nulo
    rows
      .filter((r) => r.unidade_id === null || r.unidade_id === myUnidade)
      .sort((a, b) => (b.unidade_id ? 1 : 0) - (a.unidade_id ? 1 : 0))
      .forEach((r) => {
        if (!m.has(r.data)) m.set(r.data, r.limite_folgas);
      });
    return m;
  }, [diaConfigQuery.data, myUnidade]);

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

  // Minhas folgas futuras (para oferecer troca)
  const minhasFolgasFuturas = useMemo(() => {
    if (!meRef.data?.id) return [];
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return folgas
      .filter((f) => f.colaborador_id === meRef.data!.id && f.status !== "cancelada" && parseYMD(f.data) >= hoje)
      .sort((a, b) => a.data.localeCompare(b.data));
  }, [folgas, meRef.data?.id]);

  // -------- Mutations --------
  const marcarFolga = useMutation({
    mutationFn: async (iso: string) => {
      if (!meRef.data) throw new Error("Colaborador não encontrado");
      const d = parseYMD(iso);
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);

      // 1) data passada
      if (d < hoje) throw new Error("Não é possível marcar folga em data passada.");

      // 2) fim de semana
      const wd = d.getDay();
      if (wd !== 0 && wd !== 6) {
        throw new Error('Apenas fins de semana podem ser marcados diretamente. Use "Solicitar exceção".');
      }

      // 2b) folga dominical automática (padrão CLT): definida pelo sistema
      if (wd === 0 && folgaCltAutomatica) {
        throw new Error(
          "No padrão CLT a folga dominical é definida automaticamente pelo sistema. Use uma troca ou solicite exceção.",
        );
      }



      // 3) folga fixa própria
      const fixa = normalizeWeekday(meRef.data.folga_fixa_semana);
      if (fixa != null && fixa === wd) {
        throw new Error('Este é seu dia de folga fixa. Use "Solicitar exceção" ou uma troca.');
      }

      // 4) já tem folga própria nesse dia
      const jaNoDia = folgas.some(
        (f) => f.colaborador_id === meRef.data!.id && f.data === iso && f.status !== "cancelada",
      );
      if (jaNoDia) throw new Error("Você já tem folga marcada neste dia.");

      // 5) limite mensal (1 folga de fim de semana)
      const mk = monthKey(d);
      const jaTem = folgas.some(
        (f) =>
          f.colaborador_id === meRef.data!.id &&
          monthKey(parseYMD(f.data)) === mk &&
          f.extra !== true &&
          f.status !== "cancelada" &&
          [0, 6].includes(parseYMD(f.data).getDay()),
      );
      if (jaTem) throw new Error("Você já possui uma folga de fim de semana neste mês.");

      // 6) bloqueio manual
      const bloq = manualBlocked.get(iso);
      if (bloq && !bloq.liberada) throw new Error("Esta data está bloqueada administrativamente.");

      // 7) lotação (limite efetivo x ocupantes da unidade)
      const limite = dayLimits.get(iso) ?? 1;
      const ocupados = folgas.filter(
        (f: any) =>
          f.data === iso &&
          f.extra !== true &&
          f.status !== "cancelada" &&
          (!myUnidade || f.dp_colaboradores?.unidade_id === myUnidade),
      ).length;
      if (ocupados >= limite) throw new Error("Data indisponível. Limite de folgas atingido.");

      const { error } = await supabase.from("dp_folgas").insert({
        company_id: meRef.data.company_id,
        colaborador_id: meRef.data.id,
        data: iso,
        tipo: "normal",
        origem: "solicitacao",
        status: "agendada",
        extra: false,
        criado_por: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: (_data, iso: string) => {
      toast.success("Folga marcada!");
      setSelectedDay(null);
      qc.invalidateQueries({ queryKey: ["dp_folgas_meu_cal"] });
      const me = meRef.data as { nome?: string; unidade_id?: string | null; vinculo_label?: string | null } | null;
      if (me && isSocio(me.vinculo_label)) {
        setSocioBloqueio({ nome: me.nome ?? "Sócio", datas: [iso], unidadeId: me.unidade_id ?? null });
      }
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao marcar folga"),
  });

  const removerFolga = useMutation({
    mutationFn: async (iso: string) => {
      if (!meRef.data) throw new Error("Colaborador não encontrado");
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      if (parseYMD(iso) < hoje) throw new Error("Não é possível remover folga passada.");
      const folga = folgas.find(
        (f) => f.colaborador_id === meRef.data!.id && f.data === iso && f.status !== "cancelada",
      );
      if (!folga) throw new Error("Folga não encontrada.");
      const { error } = await supabase.from("dp_folgas").delete().eq("id", folga.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Folga removida.");
      setSelectedDay(null);
      qc.invalidateQueries({ queryKey: ["dp_folgas_meu_cal"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao remover folga"),
  });

  const enviarExcecao = useMutation({
    mutationFn: async () => {
      if (!meRef.data || !selectedDay) throw new Error("Sem contexto");
      const motivo = exceptionMotivo.trim() || "Solicitação de exceção (sem motivo informado)";
      const { error } = await supabase.from("dp_solicitacoes").insert({
        company_id: meRef.data.company_id,
        colaborador_id: meRef.data.id,
        tipo: "folga",
        data_alvo: selectedDay.iso,
        motivo,
        criado_por: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Solicitação de exceção enviada.");
      setExceptionOpen(false);
      setExceptionMotivo("");
      setSelectedDay(null);
      qc.invalidateQueries({ queryKey: ["dp_solic_meu_cal"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao enviar exceção"),
  });

  const solicitarTroca = useMutation({
    mutationFn: async () => {
      if (!meRef.data || !tradeOpen) throw new Error("Sem contexto");
      if (!tradeMyDate) throw new Error("Escolha uma folga sua para oferecer.");
      const motivo = tradeMotivo.trim() || "Solicitação de troca via calendário";
      // duplicidade
      const { data: existing } = await supabase
        .from("dp_trocas")
        .select("id")
        .eq("solicitante_id", meRef.data.id)
        .eq("destino_id", tradeOpen.occupantId)
        .eq("data_proposta", tradeOpen.iso)
        .eq("status", "pendente_colega")
        .maybeSingle();
      if (existing) throw new Error("Você já enviou uma troca pendente para este dia com este colega.");

      const { error } = await supabase.from("dp_trocas").insert({
        company_id: meRef.data.company_id,
        solicitante_id: meRef.data.id,
        destino_id: tradeOpen.occupantId,
        data_original: tradeMyDate,
        data_proposta: tradeOpen.iso,
        motivo,
        status: "pendente_colega",
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Solicitação de troca enviada ao colega.");
      setTradeOpen(null);
      setTradeMyDate("");
      setTradeMotivo("");
      setSelectedDay(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao solicitar troca"),
  });

  // -------- Dados do dia selecionado --------
  const dayInfo = useMemo(() => {
    if (!selectedDay) return null;
    const date = parseYMD(selectedDay.iso);
    const isWeekend = !!dayType(date);
    const occupants = occupantsByDate.get(selectedDay.iso) ?? [];
    const isMine = occupants.some((o) => o.colaboradorId === meRef.data?.id);

    // canTrade — só se eu tenho folga futura para oferecer e o dia está em outra ocupação (não meu, não passado)
    const canTrade = minhasFolgasFuturas.length > 0 && !isMine && selectedDay.status !== "past";
    return { date, isWeekend, occupants, isMine, canTrade };
  }, [selectedDay, occupantsByDate, meRef.data?.id, minhasFolgasFuturas]);

  const showExceptionBtn =
    selectedDay &&
    !["past", "mine", "fixed", "pending", "swapped", "weekday"].includes(selectedDay.status);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <Helmet>
        <title>Meu calendário — Portal DP</title>
      </Helmet>

      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-4xl font-black text-foreground flex items-center gap-4 tracking-tight">
            <div className="size-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <CalendarDays className="size-7 text-primary" />
            </div>
            Meu calendário
          </h1>
          <p className="text-muted-foreground mt-2 font-medium">
            Escolha suas folgas de fim de semana.
          </p>
          <p className="text-xs text-muted-foreground mt-1">{resumoFolgas.texto}</p>
        </div>

        <Button
          variant="outline"
          className="rounded-full"
          onClick={() => navigate("/dp/meu/trocas")}
        >
          <ArrowLeftRight className="size-4 mr-2" /> Minhas trocas
        </Button>
      </div>

      <div className="hidden md:block">
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
          diasElegiveis={diasElegiveis}
          tetoMensal={tetoMensal}
          variant="chunky"
          onPrev={goPrev}
          onNext={goNext}
          onSelectDay={(iso, info) => {
            const st = calculateDateStatus({
              date: parseYMD(iso),
              myColaboradorId: meRef.data?.id ?? null,
              allFolgas: allFolgasRecords,
              allColaboradores: colaboradores,
              manualBlocked,
              dayLimits,
              pendingRequests,
              isAdmin: false,
              diasElegiveis,
              tetoMensal,
            });
            setSelectedDay({ iso, status: (info?.status ?? st.status) as DateStatusKind });
          }}
        />
      </div>
      <div className="md:hidden">
        <CalendarioMobileLista
          year={ano}
          month0={mes - 1}
          occupantsByDate={occupantsByDate as any}
          manualBlocked={manualBlocked}
          myColaboradorId={meRef.data?.id ?? null}
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
              diasElegiveis,
              tetoMensal,
            });
            setSelectedDay({ iso, status: st.status as DateStatusKind });
          }}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Clique em um dia para ver detalhes, marcar folga de fim de semana, pedir troca ou solicitar exceção.
      </p>


      {/* Dialog do dia */}
      <Dialog open={!!selectedDay} onOpenChange={(o) => !o && setSelectedDay(null)}>
        <DialogContent className="max-w-md rounded-2xl sm:rounded-[2rem] border-none shadow-2xl p-5 sm:p-8">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black flex items-center gap-3">
              <CalendarDays className="size-6 text-primary" />
              {selectedDay && formatBR(parseYMD(selectedDay.iso))}
            </DialogTitle>
            <DialogDescription className="sr-only">Detalhes do dia selecionado</DialogDescription>
          </DialogHeader>

          {selectedDay && dayInfo && (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-2xl border bg-muted/50 p-5 text-sm">
                <span className="font-bold">Status</span>
                <Badge variant="outline" className={cn("text-xs", STATUS_BADGE[selectedDay.status])}>
                  {STATUS_LABEL[selectedDay.status]}
                </Badge>
              </div>

              {dayInfo.occupants.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-bold text-muted-foreground">
                    Colaboradores neste dia:
                  </h4>
                  {dayInfo.occupants.map((occ) => {
                    const isMe = occ.colaboradorId === meRef.data?.id;
                    const showTrade =
                      !isMe && dayInfo.canTrade && !["blocked", "past", "mine", "fixed"].includes(selectedDay.status);
                    return (
                      <div
                        key={occ.key}
                        className="flex items-center justify-between rounded-xl border bg-background p-3 text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <UserIcon className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{occ.colaboradorNome}</span>
                          {isMe && (
                            <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                              Você
                            </Badge>
                          )}
                          <span className="text-[10px] text-muted-foreground">{occ.origin}</span>
                        </div>
                        {showTrade && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-full"
                            onClick={() =>
                              setTradeOpen({
                                occupantId: occ.colaboradorId,
                                occupantName: occ.colaboradorNome,
                                iso: selectedDay.iso,
                              })
                            }
                          >
                            <ArrowLeftRight className="h-3 w-3 mr-1" /> Trocar
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex flex-col gap-2">
                {selectedDay.status === "available" && dayInfo.isWeekend && (
                  <Button onClick={() => marcarFolga.mutate(selectedDay.iso)} disabled={marcarFolga.isPending}>
                    {marcarFolga.isPending ? "Marcando..." : "Marcar folga"}
                  </Button>
                )}
                {selectedDay.status === "available" && !dayInfo.isWeekend && (
                  <p className="text-xs text-muted-foreground">
                    Somente fins de semana podem ser marcados diretamente. Use "Solicitar exceção" para outros dias.
                  </p>
                )}
                {selectedDay.status === "mine" && (
                  <Button
                    variant="destructive"
                    onClick={() => removerFolga.mutate(selectedDay.iso)}
                    disabled={removerFolga.isPending}
                  >
                    {removerFolga.isPending ? "Removendo..." : "Remover folga"}
                  </Button>
                )}
                {selectedDay.status === "fixed" && (
                  <p className="text-xs text-muted-foreground">
                    Esta é sua folga semanal fixa. Para trocar, selecione o dia desejado e use o botão "Trocar" ao
                    lado do colega.
                  </p>
                )}
                {selectedDay.status === "blocked" && (
                  <p className="text-xs text-muted-foreground">
                    Data bloqueada administrativamente. Você pode pedir uma exceção abaixo.
                  </p>
                )}
                {selectedDay.status === "taken" && (
                  <p className="text-xs text-muted-foreground">Limite de folgas atingido neste dia.</p>
                )}
                {selectedDay.status === "pending" && (
                  <p className="text-xs text-muted-foreground">Solicitação pendente de aprovação.</p>
                )}
                {selectedDay.status === "birthday" && (
                  <p className="text-xs text-muted-foreground">Data reservada para aniversariante.</p>
                )}
                {selectedDay.status === "swapped" && (
                  <p className="text-xs text-muted-foreground">Troca aprovada para esta data.</p>
                )}
                {selectedDay.status === "past" && (
                  <p className="text-xs text-muted-foreground">Data já passou.</p>
                )}

                {showExceptionBtn && (
                  <Button
                    variant="outline"
                    className="border-amber-200 text-amber-700 hover:bg-amber-50"
                    onClick={() => {
                      setExceptionMotivo("");
                      setExceptionOpen(true);
                    }}
                  >
                    <AlertCircle className="h-4 w-4 mr-2" /> Solicitar exceção
                  </Button>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button
              variant="ghost"
              onClick={() => setSelectedDay(null)}
              className="uppercase tracking-[0.2em] text-[11px] font-black text-muted-foreground hover:text-foreground min-h-10 w-full sm:w-auto"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog exceção */}
      <Dialog open={exceptionOpen} onOpenChange={(o) => !o && setExceptionOpen(false)}>
        <DialogContent className="max-w-md rounded-2xl sm:rounded-[2rem] border-none shadow-2xl p-5 sm:p-8">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black flex items-center gap-3">
              <AlertCircle className="size-6 text-amber-500" />
              Solicitar exceção
            </DialogTitle>
            <DialogDescription>
              Envie ao DP uma justificativa para folgar em {selectedDay && formatBR(parseYMD(selectedDay.iso))}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="flex items-center gap-2">
                Justificativa
                <span className="text-muted-foreground text-xs font-normal">(opcional)</span>
              </Label>
              <Textarea
                rows={4}
                className="rounded-xl"
                placeholder="Descreva o motivo (compromisso pessoal, urgência, etc.)"
                value={exceptionMotivo}
                onChange={(e) => setExceptionMotivo(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button variant="ghost" onClick={() => setExceptionOpen(false)} className="min-h-10 w-full sm:w-auto">
              Cancelar
            </Button>
            <Button onClick={() => enviarExcecao.mutate()} disabled={enviarExcecao.isPending} className="min-h-10 w-full sm:w-auto">
              {enviarExcecao.isPending ? (
                "Enviando..."
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" /> Enviar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog troca */}
      <Dialog open={!!tradeOpen} onOpenChange={(o) => !o && setTradeOpen(null)}>
        <DialogContent className="max-w-md rounded-2xl sm:rounded-[2rem] border-none shadow-2xl p-5 sm:p-8">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black flex items-center gap-3">
              <ArrowLeftRight className="size-6 text-primary" />
              Solicitar troca
            </DialogTitle>
            <DialogDescription>
              Você pega o dia <b>{tradeOpen && formatBR(parseYMD(tradeOpen.iso))}</b> de{" "}
              <b>{tradeOpen?.occupantName}</b> em troca de uma folga sua.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Folga que você oferece</Label>
              <Select value={tradeMyDate} onValueChange={setTradeMyDate}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Escolha uma folga sua" />
                </SelectTrigger>
                <SelectContent>
                  {minhasFolgasFuturas.map((f) => (
                    <SelectItem key={f.id} value={f.data}>
                      {formatBR(parseYMD(f.data))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {minhasFolgasFuturas.length === 0 && (
                <p className="text-xs text-destructive mt-1">
                  Você não tem folgas futuras para oferecer em troca.
                </p>
              )}
            </div>
            <div>
              <Label className="flex items-center gap-2">
                Mensagem
                <span className="text-muted-foreground text-xs font-normal">(opcional)</span>
              </Label>
              <Textarea
                rows={3}
                className="rounded-xl"
                placeholder="Alguma observação para o colega?"
                value={tradeMotivo}
                onChange={(e) => setTradeMotivo(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button variant="ghost" onClick={() => setTradeOpen(null)} className="min-h-10 w-full sm:w-auto">
              Cancelar
            </Button>
            <Button
              onClick={() => solicitarTroca.mutate()}
              disabled={solicitarTroca.isPending || !tradeMyDate}
              className="min-h-10 w-full sm:w-auto"
            >
              {solicitarTroca.isPending ? "Enviando..." : "Enviar troca"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {socioBloqueio && companyId && (
        <SocioBloqueioDialog
          open
          onOpenChange={(o) => !o && setSocioBloqueio(null)}
          companyId={companyId}
          nome={socioBloqueio.nome}
          datas={socioBloqueio.datas}
          unidadeId={socioBloqueio.unidadeId}
          unidades={unidadesLista}
          tipo="folga"
        />
      )}
    </div>
  );
}
