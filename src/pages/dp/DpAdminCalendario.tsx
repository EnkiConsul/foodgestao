import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  eachDayOfInterval,
  endOfMonth,
  format,
  getISOWeek,
  getISOWeekYear,
  startOfMonth,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle,
  Building,
  CalendarDays,
  CheckCircle,
  Filter,
  Loader2,
  Lock,
  Plus,
  Save,
  Settings2,
  ShieldAlert,
  Shuffle,
  Trash2,
  Unlock,
  User as UserIcon,
  Users,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DpContentCard, DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { FolgaCalendarShared } from "@/components/dp/FolgaCalendarShared";
import { cn } from "@/lib/utils";
import {
  buildOccupantsByDate,
  isWeekend,
  monthKey,
  parseYMD,
  ymd,
  type ColaboradorRecord,
  type FolgaRecord,
  type OccupantType,
} from "@/lib/dp/folga-rules";
import {
  buildBloqueiosDeRegras,
  buildBloqueiosDeRegrasDetalhado,
  type RegraRow,
} from "@/lib/dp/bloqueio-rules";
import { LiberarEscopoDialog } from "@/components/dp/bloqueios/LiberarEscopoDialog";
import { CalendarioMobileLista } from "@/components/dp/CalendarioMobileLista";
import { SocioBloqueioDialog } from "@/components/dp/SocioBloqueioDialog";
import { isSocio } from "@/lib/dp/contrato-policy";


const isoWeekKey = (d: Date) => `${getISOWeekYear(d)}-${getISOWeek(d)}`;

export default function DpAdminCalendario() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const colabsQ = useDpColaboradores();

  const today = new Date();
  const [ano, setAno] = useState(today.getFullYear());
  const [mes, setMes] = useState(today.getMonth() + 1);

  const [filterUnidade, setFilterUnidade] = useState("all");
  const [filterUser, setFilterUser] = useState("all");
  const [filterType, setFilterType] = useState<"all" | OccupantType>("all");

  const [dayOpen, setDayOpen] = useState<string | null>(null);
  const [assignUser, setAssignUser] = useState("");
  const [editLimit, setEditLimit] = useState<number>(1);
  const [socioBloqueio, setSocioBloqueio] = useState<{
    nome: string;
    datas: string[];
    unidadeId: string | null;
    tipo: "folga" | "ferias";
  } | null>(null);


  const range = useMemo(() => {
    const start = startOfMonth(new Date(ano, mes - 1, 1));
    const end = endOfMonth(start);
    return { start: ymd(start), end: ymd(end), startDate: start, endDate: end };
  }, [ano, mes]);

  const enabled = !!selectedCompanyId;

  const regrasBloqueioQuery = useQuery({
    queryKey: ["dp_bloq_regras_admin_cal", selectedCompanyId],
    enabled,
    queryFn: async () => {
      const [{ data: regras }, { data: vinc }] = await Promise.all([
        supabase
          .from("dp_bloqueio_regras")
          .select("id, company_id, nome, tipo, mes, dia, regra_json, ativo")
          .eq("company_id", selectedCompanyId!)
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

  const queries = useQueries({
    queries: [
      {
        queryKey: ["dp_folgas_admin", selectedCompanyId, ano, mes],
        enabled,
        queryFn: async () => {
          const { data, error } = await supabase
            .from("dp_folgas")
            .select("id, data, colaborador_id, status, tipo, extra, origem, criado_por, dp_colaboradores(nome, unidade_id)")
            .eq("company_id", selectedCompanyId!)
            .gte("data", range.start)
            .lte("data", range.end);
          if (error) throw error;
          return data ?? [];
        },
      },
      {
        queryKey: ["dp_datas_bloqueadas", selectedCompanyId, ano, mes],
        enabled,
        queryFn: async () => {
          const { data, error } = await supabase
            .from("dp_datas_bloqueadas")
            .select("id, data, motivo, liberada_por_solicitacao, liberada, regra_id, unidade_id, created_at")
            .eq("company_id", selectedCompanyId!)
            .gte("data", range.start)
            .lte("data", range.end);
          if (error) throw error;
          return data ?? [];
        },
      },
      {
        queryKey: ["dp_dia_config", selectedCompanyId, ano, mes],
        enabled,
        queryFn: async () => {
          const { data, error } = await supabase
            .from("dp_dia_config")
            .select("data, limite_folgas")
            .eq("company_id", selectedCompanyId!)
            .is("unidade_id", null)
            .gte("data", range.start)
            .lte("data", range.end);
          if (error) throw error;
          return data ?? [];
        },
      },
      {
        queryKey: ["dp_unidades_list", selectedCompanyId],
        enabled,
        queryFn: async () => {
          const { data, error } = await supabase
            .from("dp_unidades")
            .select("id, nome")
            .eq("company_id", selectedCompanyId!)
            .order("nome");
          if (error) throw error;
          return data ?? [];
        },
      },
      {
        queryKey: ["dp_solicitacoes_pend", selectedCompanyId, ano, mes],
        enabled,
        queryFn: async () => {
          const { data, error } = await supabase
            .from("dp_solicitacoes")
            .select("id, colaborador_id, data_alvo, tipo, status, dp_colaboradores(nome, unidade_id)")
            .eq("company_id", selectedCompanyId!)
            .eq("status", "pendente")
            .eq("tipo", "folga")
            .gte("data_alvo", range.start)
            .lte("data_alvo", range.end);
          if (error) throw error;
          return data ?? [];
        },
      },
    ],
  });

  const [folgasQ, blockedQ, diaConfigQ, unidadesQ, pendentesQ] = queries;

  const folgas = (folgasQ.data ?? []) as any[];
  const bloqueios = (blockedQ.data ?? []) as any[];
  const unidades = (unidadesQ.data ?? []) as any[];
  const pendentes = (pendentesQ.data ?? []) as any[];

  const dayLimits = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of (diaConfigQ.data ?? []) as any[]) m.set(r.data, r.limite_folgas);
    return m;
  }, [diaConfigQ.data]);

  const unidadeFilterId = filterUnidade === "all" ? null : filterUnidade;

  /** Overrides de liberação (linhas com `liberada`/`liberada_por_solicitacao`). */
  const releasedByDate = useMemo(() => {
    const m = new Map<
      string,
      { id: string; motivo: string; unidade_id: string | null; porSolicitacao: boolean }
    >();
    for (const b of bloqueios) {
      const liberado = !!b.liberada_por_solicitacao || b.liberada === true;
      if (!liberado) continue;
      // Preferimos o override global quando houver mais de um na mesma data.
      const cur = m.get(b.data);
      if (cur && cur.unidade_id == null) continue;
      m.set(b.data, {
        id: b.id,
        motivo: b.motivo,
        unidade_id: b.unidade_id ?? null,
        porSolicitacao: !!b.liberada_por_solicitacao,
      });
    }
    return m;
  }, [bloqueios]);

  const manualBlocked = useMemo(() => {
    const m = new Map<string, { reason: string; liberada: boolean }>();
    for (const b of bloqueios) {
      const liberado = !!b.liberada_por_solicitacao || b.liberada === true;
      if (liberado) continue;
      m.set(b.data, { reason: b.motivo, liberada: false });
    }
    // Remove datas com override de liberação, independentemente da ordem das linhas.
    releasedByDate.forEach((_v, iso) => m.delete(iso));

    const regrasData = regrasBloqueioQuery.data;
    if (regrasData) {
      const fromRegras = buildBloqueiosDeRegras({
        regras: regrasData.regras,
        vinculos: regrasData.vinculos,
        unidadeId: unidadeFilterId,
        from: range.startDate,
        to: range.endDate,
      });
      fromRegras.forEach((motivo, iso) => {
        if (releasedByDate.has(iso)) return;
        if (!m.has(iso)) m.set(iso, { reason: motivo, liberada: false });
      });
    }
    return m;
  }, [bloqueios, releasedByDate, regrasBloqueioQuery.data, unidadeFilterId, range.startDate, range.endDate]);

  const blockedByDate = useMemo(() => {
    const m = new Map<string, { motivo: string; auto: boolean; id: string; hasGlobal: boolean; hasUnidade: boolean }>();
    for (const b of bloqueios) {
      if (b.liberada_por_solicitacao || b.liberada === true) continue;
      m.set(b.data, {
        motivo: b.motivo,
        auto: !!b.regra_id,
        id: b.id,
        hasGlobal: b.unidade_id == null,
        hasUnidade: b.unidade_id != null,
      });
    }
    releasedByDate.forEach((_v, iso) => m.delete(iso));

    const regrasData = regrasBloqueioQuery.data;
    if (regrasData) {
      const fromRegras = buildBloqueiosDeRegrasDetalhado({
        regras: regrasData.regras,
        vinculos: regrasData.vinculos,
        unidadeId: unidadeFilterId,
        from: range.startDate,
        to: range.endDate,
      });
      fromRegras.forEach((orig, iso) => {
        if (releasedByDate.has(iso)) return;
        if (!m.has(iso)) m.set(iso, { motivo: orig.motivo, auto: true, id: `regra:${iso}`, hasGlobal: orig.hasGlobal, hasUnidade: orig.hasUnidade });
      });
    }
    return m;
  }, [bloqueios, releasedByDate, regrasBloqueioQuery.data, unidadeFilterId, range.startDate, range.endDate]);


  const colaboradores = (colabsQ.data ?? []) as any[];
  const filteredColabs = useMemo(() => {
    if (filterUnidade === "all") return colaboradores;
    return colaboradores.filter((c: any) => c.unidade_id === filterUnidade);
  }, [colaboradores, filterUnidade]);

  const colabsForOccupants: ColaboradorRecord[] = useMemo(
    () =>
      filteredColabs.map((c: any) => ({
        id: c.id,
        nome: c.nome,
        folga_fixa_semana: c.folga_fixa_semana,
        ativo: c.ativo,
        unidade_id: c.unidade_id,
      })),
    [filteredColabs],
  );

  // realtime
  useEffect(() => {
    if (!selectedCompanyId) return;
    const ch = supabase
      .channel(`dp-admin-cal-${selectedCompanyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "dp_folgas" }, () =>
        qc.invalidateQueries({ queryKey: ["dp_folgas_admin"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "dp_dia_config" }, () =>
        qc.invalidateQueries({ queryKey: ["dp_dia_config"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "dp_datas_bloqueadas" }, () =>
        qc.invalidateQueries({ queryKey: ["dp_datas_bloqueadas"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "dp_solicitacoes" }, () =>
        qc.invalidateQueries({ queryKey: ["dp_solicitacoes_pend"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "dp_bloqueio_regras" }, () =>
        qc.invalidateQueries({ queryKey: ["dp_bloq_regras_admin_cal"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "dp_bloqueio_regra_unidades" }, () =>
        qc.invalidateQueries({ queryKey: ["dp_bloq_regras_admin_cal"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [selectedCompanyId, qc]);

  const occupantsByDate = useMemo(() => {
    const days = eachDayOfInterval({ start: range.startDate, end: range.endDate });
    return buildOccupantsByDate({
      days,
      colaboradores: colabsForOccupants,
      folgas,
      pendentes,
      filterUser,
      filterType,
    });
  }, [colabsForOccupants, folgas, pendentes, filterUser, filterType, range.startDate, range.endDate]);

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

  // KPIs
  const stats = useMemo(() => {
    const days = eachDayOfInterval({ start: range.startDate, end: range.endDate });
    let totalFolgas = 0;
    let totalVagas = 0;
    let diasLotados = 0;
    for (const d of days) {
      const iso = ymd(d);
      const occ = occupantsByDate.get(iso)?.length ?? 0;
      const limit = dayLimits.get(iso) ?? 1;
      totalFolgas += occ;
      totalVagas += limit;
      if (occ >= limit && occ > 0) diasLotados++;
    }
    return {
      totalFolgas,
      totalVagas,
      diasLotados,
      vagasRestantes: Math.max(0, totalVagas - totalFolgas),
    };
  }, [occupantsByDate, dayLimits, range.startDate, range.endDate]);

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

  // ===== mutations =====
  const sortear = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("dp-sorteio-folgas", {
        body: { company_id: selectedCompanyId!, ano, mes, regenerar_prioridades: true },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(`Sorteio concluído: ${data?.inseridas ?? 0} folgas inseridas`);
      if (data?.ignoradas?.length) toast.info(`${data.ignoradas.length} ignoradas (limites/bloqueios)`);
      qc.invalidateQueries({ queryKey: ["dp_folgas_admin"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro no sorteio"),
  });

  const gerarBloqueios = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("dp_gerar_bloqueios_ano", {
        _company_id: selectedCompanyId!,
        _ano: ano,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (n) => {
      toast.success(`${n ?? 0} datas bloqueadas geradas para ${ano}`);
      qc.invalidateQueries({ queryKey: ["dp_datas_bloqueadas"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const removerFolga = useMutation({
    mutationFn: async (folgaId: string) => {
      const { error } = await supabase.from("dp_folgas").delete().eq("id", folgaId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Folga removida");
      qc.invalidateQueries({ queryKey: ["dp_folgas_admin"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao remover"),
  });

  const salvarLimite = useMutation({
    mutationFn: async () => {
      if (!dayOpen) return;
      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("dp_dia_config")
        .upsert(
          {
            company_id: selectedCompanyId!,
            data: dayOpen,
            limite_folgas: editLimit,
            criado_por: userRes.user?.id ?? null,
          },
          { onConflict: "company_id,unidade_id,data" },
        )
        .select();
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Limite atualizado");
      qc.invalidateQueries({ queryKey: ["dp_dia_config"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const [liberarEscopoOpen, setLiberarEscopoOpen] = useState(false);

  const liberarData = useMutation({
    mutationFn: async (params: { unidadeId: string | null }) => {
      if (!dayOpen) return;
      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("dp_datas_bloqueadas")
        .upsert(
          {
            company_id: selectedCompanyId!,
            data: dayOpen,
            unidade_id: params.unidadeId,
            liberada: true,
            motivo: "Liberado manualmente pelo administrador",
            criado_por: userRes.user?.id ?? null,
          },
          { onConflict: "company_id,unidade_id,data" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Data liberada");
      qc.invalidateQueries({ queryKey: ["dp_datas_bloqueadas"] });
      qc.invalidateQueries({ queryKey: ["dp_datas_bloqueadas_admin"] });
      qc.invalidateQueries({ queryKey: ["dp_datas_bloqueadas_geral"] });
      setLiberarEscopoOpen(false);
      setDayOpen(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao liberar"),
  });

  /** Remove o override de liberação, devolvendo a data ao estado bloqueado. */
  const rebloquearData = useMutation({
    mutationFn: async (overrideId: string) => {
      const { error } = await supabase.from("dp_datas_bloqueadas").delete().eq("id", overrideId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Data bloqueada novamente");
      qc.invalidateQueries({ queryKey: ["dp_datas_bloqueadas"] });
      qc.invalidateQueries({ queryKey: ["dp_datas_bloqueadas_admin"] });
      qc.invalidateQueries({ queryKey: ["dp_datas_bloqueadas_geral"] });
      setDayOpen(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao bloquear novamente"),
  });



  // ===== conflict / assign =====
  const [confirmDialog, setConfirmDialog] = useState<{
    iso: string;
    conflitos: { id: string; data: string; tipo: string | null }[];
  } | null>(null);

  /** Cobertura mínima que exige confirmação explícita do gestor. */
  const [coberturaAlerta, setCoberturaAlerta] = useState<{
    iso: string;
    extra: boolean;
    deleteIds?: string[];
    mensagem: string;
    minimo: number | null;
    capacidade: number | null;
  } | null>(null);

  const insertFolga = async (
    iso: string,
    opts: { extra: boolean; deleteIds?: string[]; confirmarDeficit?: boolean },
  ) => {
    if (opts.deleteIds && opts.deleteIds.length > 0) {
      const { error: delError } = await supabase.from("dp_folgas").delete().in("id", opts.deleteIds);
      if (delError) throw delError;
    }
    const { data, error } = await supabase.rpc("dp_folga_criar_admin", {
      p_colaborador_id: assignUser,
      p_data: iso,
      p_extra: opts.extra,
      p_confirmar_deficit: opts.confirmarDeficit ?? false,
    });
    if (error) throw error;
    const res = (data ?? {}) as {
      ok?: boolean;
      requer_confirmacao?: boolean;
      mensagem?: string;
      cobertura?: { minimo?: number | null; capacidade_apos_acao?: number | null };
    };
    if (res.ok === false && res.requer_confirmacao) {
      setCoberturaAlerta({
        iso,
        extra: opts.extra,
        deleteIds: opts.deleteIds,
        mensagem: res.mensagem ?? "Esta folga deixará a equipe abaixo da cobertura mínima.",
        minimo: res.cobertura?.minimo ?? null,
        capacidade: res.cobertura?.capacidade_apos_acao ?? null,
      });
      return false;
    }
    return true;
  };

  const atribuirCommit = useMutation({
    mutationFn: async (input: {
      iso: string;
      modo: "force" | "extra" | "substituir";
      conflitoIds?: string[];
      confirmarDeficit?: boolean;
    }) => {
      return insertFolga(input.iso, {
        extra: input.modo === "extra",
        deleteIds: input.modo === "substituir" ? input.conflitoIds : undefined,
        confirmarDeficit: input.confirmarDeficit,
      });
    },
    onSuccess: (aplicado, input) => {
      qc.invalidateQueries({ queryKey: ["dp_folgas_admin"] });
      setConfirmDialog(null);
      if (!aplicado) return; // aguardando confirmação de cobertura
      toast.success(input.modo === "extra" ? "Folga extra atribuída" : "Folga atribuída");
      const colab = colaboradores.find((c: any) => c.id === assignUser);
      if (colab && isSocio(colab.vinculo_label)) {
        setSocioBloqueio({
          nome: colab.nome,
          datas: [input.iso],
          unidadeId: colab.unidade_id ?? null,
          tipo: "folga",
        });
      }
      setAssignUser("");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao atribuir"),
  });

  const confirmarCobertura = useMutation({
    mutationFn: async () => {
      if (!coberturaAlerta) return false;
      return insertFolga(coberturaAlerta.iso, {
        extra: coberturaAlerta.extra,
        deleteIds: undefined,
        confirmarDeficit: true,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dp_folgas_admin"] });
      toast.success("Folga atribuída com registro da exceção de cobertura");
      setCoberturaAlerta(null);
      setAssignUser("");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao atribuir"),
  });



  const prepararAtribuicao = async () => {
    if (!dayOpen) return;
    if (!assignUser) {
      toast.error("Escolha um colaborador");
      return;
    }
    const d = parseYMD(dayOpen);
    const isWknd = isWeekend(d);
    const mesRef = monthKey(d);
    const wkRef = isoWeekKey(d);

    const { data: existing, error } = await supabase
      .from("dp_folgas")
      .select("id, data, tipo")
      .eq("company_id", selectedCompanyId!)
      .eq("colaborador_id", assignUser);
    if (error) {
      toast.error("Erro ao verificar conflitos");
      return;
    }
    const conflitos = (existing ?? []).filter((f: any) => {
      if (f.data === dayOpen) return true;
      const fd = parseYMD(f.data);
      if (isWknd && monthKey(fd) === mesRef) return true;
      if (!isWknd && isoWeekKey(fd) === wkRef) return true;
      return false;
    });
    if (conflitos.length === 0) {
      atribuirCommit.mutate({ iso: dayOpen, modo: "force" });
      return;
    }
    setConfirmDialog({ iso: dayOpen, conflitos });
  };

  const openDay = (iso: string) => {
    setDayOpen(iso);
    setEditLimit(dayLimits.get(iso) ?? 1);
    setAssignUser("");
  };

  const currentDay = dayOpen ? parseYMD(dayOpen) : null;
  const currentIsWeekend = currentDay ? isWeekend(currentDay) : false;
  const currentBlock = dayOpen ? blockedByDate.get(dayOpen) ?? null : null;
  const currentRelease = dayOpen ? releasedByDate.get(dayOpen) ?? null : null;

  const dayOccupants = dayOpen ? occupantsByDate.get(dayOpen) ?? [] : [];

  const clearFilters = () => {
    setFilterUnidade("all");
    setFilterUser("all");
    setFilterType("all");
  };

  return (
    <DpPage>
      <Helmet>
        <title>Calendário de folgas — Pessoas 360°</title>
      </Helmet>
      <DpPageHeader
        icon={CalendarDays}
        title="Calendário Geral"
        description="Gestão centralizada de escalas, folgas e limites da equipe."
        actions={
          <>
            <Button variant="outline" onClick={() => gerarBloqueios.mutate()} disabled={gerarBloqueios.isPending}>
              <ShieldAlert className="mr-1 h-4 w-4" /> Gerar bloqueios do ano
            </Button>
            <Button onClick={() => sortear.mutate()} disabled={sortear.isPending}>
              {sortear.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Shuffle className="mr-1 h-4 w-4" />}
              Sortear folgas do mês
            </Button>
          </>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-4">
        {[
          { label: "Folgas Marcadas", value: stats.totalFolgas, icon: CheckCircle, tone: "text-emerald-500" },
          { label: "Vagas Restantes", value: stats.vagasRestantes, icon: Users, tone: "text-blue-500" },
          { label: "Dias Lotados", value: stats.diasLotados, icon: AlertTriangle, tone: "text-rose-500" },
          { label: "Capacidade Total", value: stats.totalVagas, icon: CalendarDays, tone: "text-muted-foreground" },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border bg-card p-3 shadow-sm md:rounded-2xl md:p-4">
            <div className="mb-0.5 truncate text-[9px] font-black uppercase tracking-widest text-muted-foreground md:mb-1 md:text-[10px]">{k.label}</div>
            <div className="flex items-center gap-1.5 text-lg font-black md:gap-2 md:text-2xl">
              <k.icon className={cn("h-4 w-4 md:h-5 md:w-5", k.tone)} /> {k.value}
            </div>
          </div>
        ))}
      </div>


      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-6 rounded-3xl border bg-card p-5 shadow-sm">
        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.15em] text-muted-foreground">
            <Building className="h-3.5 w-3.5" /> Unidade
          </Label>
          <Select
            value={filterUnidade}
            onValueChange={(v) => {
              setFilterUnidade(v);
              setFilterUser("all");
            }}
          >
            <SelectTrigger className="h-12 w-[240px] rounded-2xl font-semibold">
              <SelectValue placeholder="Todas as Unidades" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl">
              <SelectItem value="all">Todas as Unidades</SelectItem>
              {unidades.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.15em] text-muted-foreground">
            <UserIcon className="h-3.5 w-3.5" /> Colaborador
          </Label>
          <Select value={filterUser} onValueChange={setFilterUser}>
            <SelectTrigger className="h-12 w-[240px] rounded-2xl font-semibold">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl">
              <SelectItem value="all">Todos os colaboradores</SelectItem>
              {filteredColabs.map((c: any) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.15em] text-muted-foreground">
            <Filter className="h-3.5 w-3.5" /> Tipo
          </Label>
          <Select value={filterType} onValueChange={(v) => setFilterType(v as any)}>
            <SelectTrigger className="h-12 w-[200px] rounded-2xl font-semibold">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent className="rounded-2xl">
              <SelectItem value="all">Todos os tipos</SelectItem>
              <SelectItem value="fixed">Semanal</SelectItem>
              <SelectItem value="monthly">Mensal (FDS)</SelectItem>
              <SelectItem value="pending">Pendentes</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-12 px-6 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground"
          onClick={clearFilters}
        >
          Limpar filtros
        </Button>
      </div>

      {/* Calendário */}
      <DpContentCard contentClassName="p-4 md:p-6">
        <div className="hidden md:block">
          <FolgaCalendarShared
            year={ano}
            month0={mes - 1}
            occupantsByDate={occupantsByDate}
            manualBlocked={manualBlocked}
            dayLimits={dayLimits}
            myColaboradorId={null}
            allFolgas={allFolgasRecords}
            allColaboradores={colabsForOccupants}
            pendingRequests={pendingRequests}
            isAdmin
            variant="chunky"
            onPrev={goPrev}
            onNext={goNext}
            onSelectDay={(iso) => openDay(iso)}
          />
        </div>
        <div className="md:hidden">
          <CalendarioMobileLista
            year={ano}
            month0={mes - 1}
            occupantsByDate={occupantsByDate as any}
            manualBlocked={manualBlocked}
            myColaboradorId={null}
            onPrev={goPrev}
            onNext={goNext}
            onSelectDay={(iso) => openDay(iso)}
          />
        </div>
      </DpContentCard>

      {/* Dialog do dia */}
      <Dialog open={!!dayOpen} onOpenChange={(o) => !o && setDayOpen(null)}>
        <DialogContent className="max-w-lg rounded-3xl border-none p-7 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-3xl font-black tracking-tight">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <CalendarDays className="h-6 w-6" />
              </div>
              {currentDay && format(currentDay, "dd/MM/yyyy")}
            </DialogTitle>
          </DialogHeader>

          {dayOpen && (
            <div className="space-y-6 py-2">
              {currentRelease && (
                <div className="space-y-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-emerald-700">
                      <Unlock className="h-3.5 w-3.5" /> Data Liberada
                    </h3>
                    <Badge variant="outline" className="border-emerald-500/30 text-[9px] font-black uppercase text-emerald-700">
                      {currentRelease.unidade_id ? "Unidade" : "Global"}
                    </Badge>
                  </div>
                  <p className="text-sm font-semibold text-emerald-800">
                    {currentRelease.porSolicitacao
                      ? "Liberada por solicitação aprovada — disponível para folgas."
                      : "Liberada manualmente pelo administrador — a regra de bloqueio segue ativa nos demais dias."}
                  </p>
                  <Button
                    variant="outline"
                    className="h-11 w-full rounded-xl border-destructive/30 font-bold text-destructive hover:bg-destructive/10"
                    onClick={() => rebloquearData.mutate(currentRelease.id)}
                    disabled={rebloquearData.isPending}
                  >
                    <Lock className="mr-2 h-4 w-4" /> Bloquear novamente
                  </Button>
                </div>
              )}

              {currentBlock && !currentRelease && (
                <div className="space-y-3 rounded-2xl border border-destructive/20 bg-destructive/10 p-5">

                  <div className="flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-destructive">
                      <Lock className="h-3.5 w-3.5" /> Data Bloqueada
                    </h3>
                    <Badge variant="outline" className="border-destructive/30 text-[9px] font-black uppercase text-destructive">
                      {currentBlock.auto ? "Automático" : "Manual"}
                    </Badge>
                  </div>
                  <div className="flex items-start gap-2 text-sm font-semibold text-destructive">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                    {currentBlock.motivo}
                  </div>
                  <Button
                    variant="outline"
                    className="h-11 w-full rounded-xl border-destructive/30 font-bold text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      if (currentBlock.auto && currentBlock.hasGlobal) {
                        setLiberarEscopoOpen(true);
                      } else {
                        const unidadeId = filterUnidade === "all" ? null : filterUnidade;
                        liberarData.mutate({ unidadeId });
                      }
                    }}
                    disabled={liberarData.isPending}
                  >
                    <Unlock className="mr-2 h-4 w-4" /> Liberar Data
                  </Button>
                </div>
              )}

              {currentIsWeekend && (
                <div className="space-y-3 rounded-2xl border bg-muted/30 p-5">
                  <h3 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                    <Settings2 className="h-3.5 w-3.5" /> Configuração do Dia
                  </h3>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <Label className="mb-1.5 block text-[10px] font-bold text-muted-foreground">
                        Limite de colaboradores
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        max={20}
                        value={editLimit}
                        onChange={(e) => setEditLimit(Number(e.target.value))}
                        className="h-11 rounded-xl font-bold"
                      />
                    </div>
                    <Button
                      onClick={() => salvarLimite.mutate()}
                      disabled={salvarLimite.isPending}
                      className="mt-auto h-11 rounded-xl px-5"
                    >
                      <Save className="mr-2 h-4 w-4" />
                      {salvarLimite.isPending ? "..." : "Salvar"}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">0 = sem limite (livre).</p>
                </div>
              )}

              <div className="space-y-3">
                <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                  Escala do dia
                </h3>
                <div className="space-y-2">
                  {dayOccupants.length === 0 ? (
                    <div className="rounded-2xl border-2 border-dashed py-10 text-center text-sm text-muted-foreground">
                      Ninguém escalado para este dia.
                    </div>
                  ) : (
                    dayOccupants.map((o) => (
                      <div
                        key={o.key}
                        className="group flex items-center justify-between rounded-2xl border bg-card p-4 transition-all hover:shadow-md"
                      >
                        <div className="flex items-center gap-4">
                          <div
                            className={cn(
                              "h-3 w-3 rounded-full",
                              o.type === "fixed" && "bg-blue-500",
                              o.type === "monthly" && (o.extra ? "bg-accent-foreground" : "bg-primary"),
                              o.type === "pending" && "bg-violet-500",
                            )}
                          />
                          <div>
                            <div className="font-bold">{o.colaboradorNome}</div>
                            <div className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                              {o.origin}
                              {o.extra && " · Extra"}
                            </div>
                          </div>
                        </div>
                        {o.type === "monthly" && o.folgaId && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 rounded-xl text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                            onClick={() => removerFolga.mutate(o.folgaId!)}
                            disabled={removerFolga.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-3 border-t pt-5">
                <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                  Atribuir folga manual
                </h3>
                <div className="flex gap-3">
                  <Select value={assignUser} onValueChange={setAssignUser}>
                    <SelectTrigger className="h-12 flex-1 rounded-2xl font-semibold">
                      <SelectValue placeholder="Escolher colaborador..." />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl">
                      {filteredColabs.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    className="h-12 rounded-2xl px-6 text-xs font-black uppercase tracking-widest"
                    onClick={prepararAtribuicao}
                    disabled={atribuirCommit.isPending || !assignUser}
                  >
                    {atribuirCommit.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Plus className="mr-1 h-4 w-4" /> Atribuir
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="sm:justify-center">
            <Button
              variant="ghost"
              onClick={() => setDayOpen(null)}
              className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground"
            >
              Fechar detalhes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDialog} onOpenChange={(o) => !o && setConfirmDialog(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-6 w-6" /> Conflito de folga
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-base">
                Este colaborador já possui folga(s) que conflitam com a nova atribuição:
                <ul className="mt-2 list-inside list-disc text-sm text-muted-foreground">
                  {confirmDialog?.conflitos.map((f) => (
                    <li key={f.id}>
                      {format(parseYMD(f.data), "dd/MM/yyyy")} — {f.tipo ?? "normal"}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 font-semibold text-foreground">Como deseja proceder?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() =>
                confirmDialog &&
                atribuirCommit.mutate({
                  iso: confirmDialog.iso,
                  modo: "substituir",
                  conflitoIds: confirmDialog.conflitos.map((f) => f.id),
                })
              }
            >
              Substituir (remover antigas)
            </AlertDialogAction>
            <AlertDialogAction
              className="rounded-xl bg-amber-500 text-white hover:bg-amber-600"
              onClick={() => confirmDialog && atribuirCommit.mutate({ iso: confirmDialog.iso, modo: "extra" })}
            >
              Manter como Extra
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LiberarEscopoDialog
        open={liberarEscopoOpen}
        onOpenChange={setLiberarEscopoOpen}
        dataLabel={dayOpen ? format(parseYMD(dayOpen), "dd/MM/yyyy") : ""}
        unidadeNome={(() => {
          if (filterUnidade === "all") return null;
          const u = unidades.find((x: any) => x.id === filterUnidade);
          return u?.nome ?? null;
        })()}
        motivo={currentBlock?.motivo}
        loading={liberarData.isPending}
        onLiberarUnidade={() => {
          if (filterUnidade === "all") return;
          liberarData.mutate({ unidadeId: filterUnidade });
        }}
        onLiberarGlobal={() => liberarData.mutate({ unidadeId: null })}
      />

      {socioBloqueio && selectedCompanyId && (
        <SocioBloqueioDialog
          open
          onOpenChange={(o) => !o && setSocioBloqueio(null)}
          companyId={selectedCompanyId}
          nome={socioBloqueio.nome}
          datas={socioBloqueio.datas}
          unidadeId={socioBloqueio.unidadeId}
          unidades={unidades.map((u: any) => ({ id: u.id, nome: u.nome }))}
          tipo={socioBloqueio.tipo}
        />
      )}
    </DpPage>

  );
}
