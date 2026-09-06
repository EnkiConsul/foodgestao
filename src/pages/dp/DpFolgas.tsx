import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isWeekend,
  isWithinInterval,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Plus,
  CheckCircle2,
  Users,
  AlertTriangle,
  Calendar as CalendarIcon,
  Building2,
  User as UserIcon,
  Filter,
  Lock,
  Unlock,
  Settings2,
  Save,
  
  MapPin,
  Globe2,
  ChevronDown,
  Wand2,

} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CalendarSkeleton } from "@/components/dp/DpSkeletons";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useCompanyPermissions } from "@/hooks/useCompanyPermissions";
import { useAuth } from "@/hooks/useAuth";
import {
  diasValidosDoItem,
  parsePlanoAutoatribuicao,
  parseResultadoAutoatribuicao,
  resumoPlano,
  resumoResultado,
  type PlanoItem,
} from "@/lib/dp/folga-autoatribuicao";

import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { useDpFolgasQueries } from "@/hooks/useDpFolgasQueries";
import { useDpFolgaLimites } from "@/hooks/useDpFolgaLimites";
import {
  origemLimiteLabel,
  resolverLimiteFolga,
  type LimiteResolvido,
} from "@/lib/dp/folga-limites";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { DpContentCard, DpFilterCard, DpPage, DpPageHeader, useDpEmbedded } from "@/components/dp/DpPage";
import { DpStatusBadge, statusToneFor } from "@/components/dp/DpStatusBadge";
import { normalizeWeekday } from "@/lib/dp/folga-rules";
import {
  buildBloqueiosDeRegras,
  buildBloqueiosDeRegrasDetalhado,
  type RegraRow,
} from "@/lib/dp/bloqueio-rules";
import { LiberarEscopoDialog } from "@/components/dp/bloqueios/LiberarEscopoDialog";
import type { Database } from "@/integrations/supabase/types";

type Row = Database["public"]["Tables"]["dp_solicitacoes"]["Row"] & {
  dp_colaboradores: { nome: string; unidade_id: string | null } | null;
};
type Tipo = Database["public"]["Enums"]["dp_solicitacao_tipo"];
type Status = Database["public"]["Enums"]["dp_solicitacao_status"];

const TIPO_LABEL: Record<Tipo, string> = {
  folga: "Folga",
  ferias: "Férias",
  atestado: "Atestado",
  adiantamento: "Adiantamento",
  outros: "Outros",
};

const STATUS_LABEL: Record<Status, string> = {
  pendente: "Pendente",
  aprovada: "Aprovada",
  recusada: "Recusada",
  cancelada: "Cancelada",
};

const LEGEND = [
  { label: "Disponível", color: "bg-emerald-500" },
  { label: "Folga Semanal", color: "bg-blue-500" },
  { label: "Folga Mensal", color: "bg-amber-500" },
  { label: "Pendente", color: "bg-violet-500" },
  { label: "Bloqueado", color: "bg-red-500" },
];

const PREFS_KEY = (companyId: string | null) => `dp:folgas:filters:${companyId ?? "none"}`;
const WEEKLY_FOLGA_ID_PREFIX = "folga-semanal:";

type SavedPrefs = {
  unidade?: string;
  colaborador?: string;
  tipo?: Tipo | "todos";
};

function loadPrefs(companyId: string | null): SavedPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY(companyId));
    return raw ? (JSON.parse(raw) as SavedPrefs) : {};
  } catch {
    return {};
  }
}

export default function DpFolgas() {
  const embedded = useDpEmbedded();
  const { selectedCompanyId } = useCompanyContext();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const colabs = useDpColaboradores();
  const [cursor, setCursor] = useState(startOfMonth(new Date()));
  const initialPrefs = loadPrefs(selectedCompanyId);
  const [unidadeFilter, setUnidadeFilter] = useState<string>(initialPrefs.unidade ?? "todas");
  const [colabFilter, setColabFilter] = useState<string>(initialPrefs.colaborador ?? "todos");
  const [tipoFilter, setTipoFilter] = useState<Tipo | "todos">(initialPrefs.tipo ?? "todos");

  // Reaplica preferências ao trocar de empresa
  useEffect(() => {
    const p = loadPrefs(selectedCompanyId);
    setUnidadeFilter(p.unidade ?? "todas");
    setColabFilter(p.colaborador ?? "todos");
    setTipoFilter(p.tipo ?? "todos");
     
  }, [selectedCompanyId]);

  // Persiste alterações
  useEffect(() => {
    try {
      localStorage.setItem(
        PREFS_KEY(selectedCompanyId),
        JSON.stringify({ unidade: unidadeFilter, colaborador: colabFilter, tipo: tipoFilter }),
      );
    } catch {
      /* ignore */
    }
  }, [selectedCompanyId, unidadeFilter, colabFilter, tipoFilter]);

  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [quickColabId, setQuickColabId] = useState<string>("");
  const [editLimit, setEditLimit] = useState<number>(1);
  
  const [autoOpen, setAutoOpen] = useState(false);
  const { role } = useCompanyPermissions();
  const podeDistribuir = role === "owner" || role === "admin";
  /** Folga efetivada em gestão (remarcar/cancelar) pelo diálogo do dia. */
  const [folgaGerenciar, setFolgaGerenciar] = useState<{
    id: string;
    colaboradorId: string;
    nome: string;
    data: string;
  } | null>(null);
  const [remarcarData, setRemarcarData] = useState("");
  const [cancelMotivo, setCancelMotivo] = useState("");

  const quickAssign = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      if (!selectedDay) throw new Error("Selecione um dia");
      if (!quickColabId) throw new Error("Escolha um colaborador");
      const { error } = await supabase.from("dp_solicitacoes").insert({
        company_id: selectedCompanyId,
        colaborador_id: quickColabId,
        tipo: "folga",
        data_alvo: format(selectedDay, "yyyy-MM-dd"),
        data_fim: null,
        motivo: null,
        criado_por: user?.id,
        status: "aprovada",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Folga atribuída");
      qc.invalidateQueries({ queryKey: ["dp_folgas"] });
      qc.invalidateQueries({ queryKey: ["dp_solicitacoes"] });
      qc.invalidateQueries({ queryKey: ["dp_home_stats"] });
      setQuickColabId("");
    },
    onError: (e) => toast.error("Erro", { description: e instanceof Error ? e.message : String(e) }),
  });

  const [liberarEscopoOpen, setLiberarEscopoOpen] = useState(false);

  const liberarData = useMutation({
    mutationFn: async (params: { unidadeId: string | null }) => {
      if (!selectedCompanyId || !selectedDay) return;
      const { error } = await supabase
        .from("dp_datas_bloqueadas")
        .upsert(
          {
            company_id: selectedCompanyId,
            data: format(selectedDay, "yyyy-MM-dd"),
            unidade_id: params.unidadeId,
            liberada: true,
            motivo: "Liberado manualmente pelo administrador",
            criado_por: user?.id ?? null,
          },
          { onConflict: "company_id,unidade_id,data" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Data liberada");
      qc.invalidateQueries({ queryKey: ["dp_datas_bloqueadas_geral"] });
      qc.invalidateQueries({ queryKey: ["dp_datas_bloqueadas"] });
      qc.invalidateQueries({ queryKey: ["dp_datas_bloqueadas_admin"] });
      qc.invalidateQueries({ queryKey: ["dp_bloqueio_regras"] });
      setLiberarEscopoOpen(false);
      setSelectedDay(null);
    },
    onError: (e: any) => toast.error("Erro ao liberar", { description: e?.message ?? e?.error_description ?? "Tente novamente." }),
  });

  const rebloquearOverride = useMutation({
    mutationFn: async (overrideId: string) => {
      const { error } = await supabase
        .from("dp_datas_bloqueadas")
        .delete()
        .eq("id", overrideId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Data bloqueada novamente para a unidade");
      qc.invalidateQueries({ queryKey: ["dp_datas_bloqueadas_geral"] });
      qc.invalidateQueries({ queryKey: ["dp_datas_bloqueadas"] });
      qc.invalidateQueries({ queryKey: ["dp_datas_bloqueadas_admin"] });
    },
    onError: (e: any) => toast.error("Erro ao bloquear novamente", { description: e?.message ?? "Tente novamente." }),
  });


  const salvarLimite = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId || !selectedDay) return;
      const { error } = await supabase
        .from("dp_dia_config")
        .upsert(
          {
            company_id: selectedCompanyId,
            data: format(selectedDay, "yyyy-MM-dd"),
            limite_folgas: editLimit,
            criado_por: user?.id ?? null,
          },
          { onConflict: "company_id,unidade_id,data" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Limite atualizado");
      qc.invalidateQueries({ queryKey: ["dp_dia_config"] });
    },
    onError: (e) => toast.error("Erro", { description: e instanceof Error ? e.message : String(e) }),
  });

  /** Cancela a folga (mantém o histórico); o dia volta a ficar livre. */
  const cancelarFolga = useMutation({
    mutationFn: async ({ id, colaboradorId, data, motivo }: { id: string; colaboradorId: string; data: string; motivo: string }) => {
      const resposta = motivo
        ? `Cancelada pelo gestor: ${motivo}`
        : "Cancelada pelo gestor.";

      if (id.startsWith("folga:")) {
        const { error } = await supabase
          .from("dp_folgas")
          .update({ status: "cancelada", observacao: resposta })
          .eq("id", id.slice("folga:".length));
        if (error) throw error;
      }

      const solicitacao = supabase
        .from("dp_solicitacoes")
        .update({
          status: "cancelada",
          resposta_admin: resposta,
          respondido_por: user?.id ?? null,
          respondido_em: new Date().toISOString(),
        })
        .eq("company_id", selectedCompanyId ?? "")
        .eq("colaborador_id", colaboradorId)
        .eq("tipo", "folga")
        .eq("status", "aprovada")
        .eq("data_alvo", data);
      if (!id.startsWith("folga:")) solicitacao.eq("id", id);
      const { error: solicitacaoError } = await solicitacao;
      if (solicitacaoError) throw solicitacaoError;
    },
    onSuccess: () => {
      toast.success("Folga cancelada", {
        description: "O dia voltou a ficar livre no calendário.",
      });
      qc.invalidateQueries({ queryKey: ["dp_folgas"] });
      qc.invalidateQueries({ queryKey: ["dp_folgas_efetivadas"] });
      qc.invalidateQueries({ queryKey: ["dp_panorama_base"] });
      setFolgaGerenciar(null);
    },
    onError: (e) =>
      toast.error("Erro ao cancelar", { description: e instanceof Error ? e.message : String(e) }),
  });

  /** Remarca a folga para outro dia, no mesmo registro. */
  const remarcarFolga = useMutation({
    mutationFn: async ({ id, colaboradorId, dataAtual, novaData }: { id: string; colaboradorId: string; dataAtual: string; novaData: string }) => {
      if (!novaData) throw new Error("Escolha a nova data");

      if (id.startsWith("folga:")) {
        const { error } = await supabase
          .from("dp_folgas")
          .update({ data: novaData })
          .eq("id", id.slice("folga:".length));
        if (error) throw error;
      }

      const solicitacao = supabase
        .from("dp_solicitacoes")
        .update({ data_alvo: novaData })
        .eq("company_id", selectedCompanyId ?? "")
        .eq("colaborador_id", colaboradorId)
        .eq("tipo", "folga")
        .eq("status", "aprovada")
        .eq("data_alvo", dataAtual);
      if (!id.startsWith("folga:")) solicitacao.eq("id", id);
      const { error: solicitacaoError } = await solicitacao;
      if (solicitacaoError) throw solicitacaoError;
    },
    onSuccess: () => {
      toast.success("Folga remarcada");
      qc.invalidateQueries({ queryKey: ["dp_folgas"] });
      qc.invalidateQueries({ queryKey: ["dp_folgas_efetivadas"] });
      qc.invalidateQueries({ queryKey: ["dp_panorama_base"] });
      setFolgaGerenciar(null);
    },
    onError: (e) =>
      toast.error("Erro ao remarcar", { description: e instanceof Error ? e.message : String(e) }),
  });





  const rangeStart = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
  const rangeEnd = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });
  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);




  const competenciaAtual = format(startOfMonth(cursor), "yyyy-MM-dd");
  const unidadeAlvo = unidadeFilter === "todas" ? null : unidadeFilter;

  /** Plano da distribuição automática do mês em foco (somente administradores). */
  const planoAutoQuery = useQuery({
    queryKey: ["dp_folga_auto_plano", selectedCompanyId, unidadeAlvo, competenciaAtual],
    enabled: !!selectedCompanyId && podeDistribuir && autoOpen,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dp_folga_autoatribuicao_plano", {
        _company: selectedCompanyId!,
        _unidade: unidadeAlvo,
        _competencia: competenciaAtual,
      });
      if (error) throw error;
      return parsePlanoAutoatribuicao(data);
    },
  });

  /** Datas editadas/removidas pelo gestor antes de confirmar. */
  const [autoEdits, setAutoEdits] = useState<Record<string, string>>({});
  const [autoRemovidos, setAutoRemovidos] = useState<string[]>([]);

  useEffect(() => {
    if (!autoOpen) {
      setAutoEdits({});
      setAutoRemovidos([]);
    }
  }, [autoOpen]);

  const planoItens = useMemo(() => {
    const plano = planoAutoQuery.data;
    if (!plano) return [] as { item: PlanoItem; data: string | null }[];
    return plano.itens.map((item) => ({
      item,
      data: autoEdits[item.colaboradorId] ?? item.data,
    }));
  }, [planoAutoQuery.data, autoEdits]);


  const itensConfirmados = useMemo(
    () =>
      planoItens
        .filter((p) => !autoRemovidos.includes(p.item.colaboradorId) && !!p.data)
        .map((p) => ({ colaborador_id: p.item.colaboradorId, data: p.data as string })),
    [planoItens, autoRemovidos],
  );

  /** Cria apenas as folgas confirmadas pelo gestor. */
  const distribuirAuto = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      const { data, error } = await supabase.rpc("dp_folga_autoatribuir_aplicar", {
        _company: selectedCompanyId,
        _unidade: unidadeAlvo,
        _competencia: competenciaAtual,
        _itens: itensConfirmados,
      });
      if (error) throw error;
      return parseResultadoAutoatribuicao(data);
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["dp_folgas"] });
      qc.invalidateQueries({ queryKey: ["dp_folgas_efetivadas"] });
      qc.invalidateQueries({ queryKey: ["dp_folga_auto_exec"] });
      qc.invalidateQueries({ queryKey: ["dp_folga_auto_plano"] });
      setAutoOpen(false);
      if (res.geradas > 0) toast.success("Folgas distribuídas", { description: resumoResultado(res) });
      else toast.info("Nada a distribuir", { description: resumoResultado(res) });
    },
    onError: (e) =>
      toast.error("Erro ao distribuir folgas", {
        description: e instanceof Error ? e.message : String(e),
      }),
  });






  const {
    unidadesQuery,
    diaConfigQuery,
    regrasBloqueioQuery,
    datasBloqueadasQuery,
    query,
    folgasQuery,
  } = useDpFolgasQueries({ cursor, rangeStart, rangeEnd, unidadeFilter, colabFilter, tipoFilter });

  const { regras: regrasLimite } = useDpFolgaLimites(
    unidadeFilter === "todas" ? null : unidadeFilter,
  );





  const days = useMemo(
    () => eachDayOfInterval({ start: rangeStart, end: rangeEnd }),
    [rangeStart, rangeEnd],
  );

  const eventsByDay = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of query.data ?? []) {
      if (!r.data_alvo) continue;
      const start = parseISO(r.data_alvo);
      const end = r.data_fim ? parseISO(r.data_fim) : start;
      for (const d of eachDayOfInterval({ start, end })) {
        if (!isWithinInterval(d, { start: rangeStart, end: rangeEnd })) continue;
        const key = format(d, "yyyy-MM-dd");
        const list = map.get(key) ?? [];
        list.push(r);
        map.set(key, list);
      }
    }
    // Merge dp_folgas efetivadas como eventos sintéticos aprovados
    for (const f of folgasQuery.data ?? []) {
      const key = f.data;
      const list = map.get(key) ?? [];
      const dup = list.some(
        (e) =>
          e.colaborador_id === f.colaborador_id &&
          e.tipo === "folga" &&
          e.status === "aprovada",
      );
      if (dup) continue;
      list.push({
        id: `folga:${f.id}`,
        colaborador_id: f.colaborador_id,
        tipo: "folga" as Tipo,
        status: "aprovada" as Status,
        data_alvo: f.data,
        data_fim: null,
        motivo: f.observacao,
        dp_colaboradores: f.dp_colaboradores,
      } as unknown as Row);
      map.set(key, list);
    }

    if (tipoFilter === "todos" || tipoFilter === "folga") {
      const eligibleColabs = (colabs.data ?? [])
        .filter((c) => c.ativo !== false)
        .filter((c) => (unidadeFilter === "todas" ? true : c.unidade_id === unidadeFilter))
        .filter((c) => (colabFilter === "todos" ? true : c.id === colabFilter));

      for (const day of days) {
        const key = format(day, "yyyy-MM-dd");
        const weekday = day.getDay();
        const list = map.get(key) ?? [];

        for (const c of eligibleColabs) {
          const fixedWeekday = normalizeWeekday(c.folga_fixa_semana);
          if (fixedWeekday == null || fixedWeekday !== weekday) continue;

          const alreadyHasApprovedFolga = list.some(
            (e) => e.colaborador_id === c.id && e.tipo === "folga" && e.status === "aprovada",
          );
          if (alreadyHasApprovedFolga) continue;

          list.push({
            id: `${WEEKLY_FOLGA_ID_PREFIX}${c.id}:${key}`,
            colaborador_id: c.id,
            tipo: "folga" as Tipo,
            status: "aprovada" as Status,
            data_alvo: key,
            data_fim: null,
            motivo: "Folga semanal fixa",
            dp_colaboradores: {
              nome: c.nome,
              unidade_id: c.unidade_id,
            },
          } as unknown as Row);
        }

        if (list.length > 0) map.set(key, list);
      }
    }
    return map;
  }, [query.data, folgasQuery.data, tipoFilter, colabs.data, unidadeFilter, colabFilter, days, rangeStart, rangeEnd]);

  /** Limite efetivo de pessoas em folga por dia: exceção da data ou regra fixa cadastrada. */
  const limiteByDay = useMemo(() => {
    const map = new Map<string, LimiteResolvido>();
    for (const d of days) {
      const key = format(d, "yyyy-MM-dd");
      map.set(
        key,
        resolverLimiteFolga({
          data: key,
          unidadeId: unidadeFilter !== "todas" ? unidadeFilter : null,
          regras: regrasLimite,
          diaConfig: diaConfigQuery.data ?? [],
        }),
      );
    }
    return map;
  }, [days, unidadeFilter, regrasLimite, diaConfigQuery.data]);

  const capacityByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const [key, res] of limiteByDay) {
      if (res.limite != null) map.set(key, res.limite);
    }
    return map;
  }, [limiteByDay]);


  const blockedByDate = useMemo(() => {
    type BlockInfo = {
      reason: string;
      auto: boolean;
      hasGlobal: boolean;
      hasUnidade: boolean;
      partials: Array<{ id: string; unidade_id: string; unidade_nome: string }>;
    };
    const m = new Map<string, BlockInfo>();
    const liberadasGlobal = new Set<string>();
    const partialsByIso = new Map<string, Array<{ id: string; unidade_id: string; unidade_nome: string }>>();
    const unidadeFilterId = unidadeFilter === "todas" ? null : unidadeFilter;
    const unidadesList = unidadesQuery.data ?? [];
    const unidadeNomeById = new Map<string, string>();
    for (const u of unidadesList) unidadeNomeById.set(u.id, u.nome);

    for (const b of datasBloqueadasQuery.data ?? []) {
      // Escopo por unidade: bloqueio de outra unidade não afeta a visão filtrada
      if (b.unidade_id && unidadeFilterId && b.unidade_id !== unidadeFilterId) continue;

      const liberado = b.liberada === true || b.liberada_por_solicitacao != null;
      if (liberado) {
        if (b.unidade_id == null) {
          // Override global libera a data inteira
          liberadasGlobal.add(b.data);
        } else if (unidadeFilterId == null) {
          // Filtro "todas": rastreia libração parcial por unidade
          const nome = unidadeNomeById.get(b.unidade_id) ?? "Unidade";
          const arr = partialsByIso.get(b.data) ?? [];
          arr.push({ id: b.id, unidade_id: b.unidade_id, unidade_nome: nome });
          partialsByIso.set(b.data, arr);
        } else if (unidadeFilterId === b.unidade_id) {
          // Filtro em uma unidade específica com override liberada dela → libera nesta visão
          liberadasGlobal.add(b.data);
        }
        continue;
      }
      m.set(b.data, {
        reason: b.motivo ?? "Bloqueado",
        auto: !!b.regra_id,
        hasGlobal: b.unidade_id == null,
        hasUnidade: b.unidade_id != null,
        partials: [],
      });
    }
    const regrasData = regrasBloqueioQuery.data;
    if (regrasData) {
      const fromRegras = buildBloqueiosDeRegrasDetalhado({
        regras: regrasData.regras,
        vinculos: regrasData.vinculos,
        unidadeId: unidadeFilterId,
        from: rangeStart,
        to: rangeEnd,
      });
      fromRegras.forEach((orig, iso) => {
        if (liberadasGlobal.has(iso)) return;
        if (!m.has(iso)) {
          m.set(iso, {
            reason: orig.motivo,
            auto: true,
            hasGlobal: orig.hasGlobal,
            hasUnidade: orig.hasUnidade,
            partials: [],
          });
        }
      });
    }
    // Anexa partials a datas ainda bloqueadas
    partialsByIso.forEach((partials, iso) => {
      const info = m.get(iso);
      if (info) info.partials = partials;
    });
    return m;
  }, [datasBloqueadasQuery.data, regrasBloqueioQuery.data, unidadeFilter, rangeStart, rangeEnd, unidadesQuery.data]);

  // Stats do mês corrente (dias dentro do mês). Dias sem limite cadastrado
  // não entram na capacidade — o limite passou a ser opcional.
  /** Distribuições automáticas que precisaram passar do limite do dia. */
  const execucoesQuery = useQuery({
    queryKey: ["dp_folga_auto_exec", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_folga_autoatribuicao_execucoes")
        .select("id, competencia, quantidade_gerada, quantidade_excedida")
        .eq("company_id", selectedCompanyId!)
        .gt("quantidade_excedida", 0)
        .order("competencia", { ascending: false })
        .limit(3);
      if (error) throw error;
      return data ?? [];
    },
  });

  const execucoesExcedidas = execucoesQuery.data ?? [];

  const stats = useMemo(() => {
    let marcadas = 0;
    let capacidade = 0;
    let lotados = 0;
    let semLimite = 0;
    for (const d of eachDayOfInterval({ start: monthStart, end: monthEnd })) {
      const key = format(d, "yyyy-MM-dd");
      const evs = eventsByDay.get(key) ?? [];
      const aprov = evs.filter((e) => e.status === "aprovada" && e.tipo === "folga").length;
      const cap = capacityByDay.get(key) ?? null;
      marcadas += aprov;
      if (cap == null) {
        semLimite += 1;
        continue;
      }
      capacidade += cap;
      if (aprov >= cap && cap > 0) lotados += 1;
    }
    return {
      marcadas,
      capacidade,
      lotados,
      semLimite,
      restantes: Math.max(0, capacidade - marcadas),
    };
  }, [eventsByDay, capacityByDay, monthStart, monthEnd]);


  const selectedEvents = selectedDay
    ? eventsByDay.get(format(selectedDay, "yyyy-MM-dd")) ?? []
    : [];
  const selectedIso = selectedDay ? format(selectedDay, "yyyy-MM-dd") : null;
  const selectedBlock = selectedIso ? blockedByDate.get(selectedIso) ?? null : null;
  const selectedIsWeekend = selectedDay ? isWeekend(selectedDay) : false;

  const openDay = (day: Date) => {
    setSelectedDay(day);
    setQuickColabId("");
    const iso = format(day, "yyyy-MM-dd");
    setEditLimit(capacityByDay.get(iso) ?? 1);
  };

  const clearFilters = () => {
    setUnidadeFilter("todas");
    setColabFilter("todos");
    setTipoFilter("todos");
  };
  const hasFilters =
    unidadeFilter !== "todas" || colabFilter !== "todos" || tipoFilter !== "todos";

  const statCards = [
    { label: "FOLGAS MARCADAS", value: stats.marcadas, icon: CheckCircle2, tone: "text-emerald-600" },
    { label: "VAGAS RESTANTES", value: stats.restantes, icon: Users, tone: "text-blue-600" },
    { label: "DIAS LOTADOS", value: stats.lotados, icon: AlertTriangle, tone: "text-red-600" },
    { label: "CAPACIDADE TOTAL", value: stats.capacidade, icon: CalendarIcon, tone: "text-primary" },
  ];

  return (
    <DpPage>
      {!embedded && (
        <Helmet>
          <title>Folgas — Pessoas 360°</title>
        </Helmet>
      )}

      <DpPageHeader
        icon={CalendarDays}
        title="Calendário de Folgas"
        description="Gestão centralizada de escalas e folgas da equipe."
        actions={
          <div className="flex items-center gap-2">
            {podeDistribuir && (
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => setAutoOpen(true)}
                title="Gera as folgas de fim de semana de quem ainda não marcou neste mês, conforme a regra da unidade"
              >
                <Wand2 className="h-4 w-4" />
                Gerar Folgas
              </Button>
            )}

          </div>


        }
      />

      {execucoesExcedidas.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-500/10 p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-amber-800">
                Folgas definidas automaticamente acima do limite
              </p>
              {execucoesExcedidas.map((e) => (
                <p key={e.id} className="text-xs text-amber-800/90">
                  {format(new Date(`${e.competencia}T00:00:00`), "MMMM 'de' yyyy", { locale: ptBR })}:{" "}
                  {e.quantidade_gerada} folga(s) definida(s) pelo sistema, sendo {e.quantidade_excedida}{" "}
                  em dias que já estavam no limite. Revise esses dias no calendário.
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {statCards.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-[hsl(var(--dp-border))] bg-card p-4"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {s.label}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <s.icon className={cn("h-5 w-5", s.tone)} />
              <span className="text-3xl font-bold text-foreground">{s.value}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <DpFilterCard>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 items-end">
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" /> Unidade
            </label>
            <Select value={unidadeFilter} onValueChange={setUnidadeFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as Unidades</SelectItem>
                {(unidadesQuery.data ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <UserIcon className="h-3.5 w-3.5" /> Colaborador
            </label>
            <Select value={colabFilter} onValueChange={setColabFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os colaboradores</SelectItem>
                {(colabs.data ?? []).filter((c) => c.ativo).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5" /> Tipo de Folga
            </label>
            <Select value={tipoFilter} onValueChange={(v) => setTipoFilter(v as Tipo | "todos")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os tipos</SelectItem>
                {(Object.keys(TIPO_LABEL) as Tipo[]).map((t) => (
                  <SelectItem key={t} value={t}>{TIPO_LABEL[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Button
              variant="ghost"
              onClick={clearFilters}
              disabled={!hasFilters}
              className="text-primary font-semibold uppercase text-xs tracking-wide"
            >
              Limpar filtros
            </Button>
          </div>
        </div>
      </DpFilterCard>

      {/* Calendar */}
      <DpContentCard contentClassName="p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="text-3xl font-bold text-foreground">
            <span className="capitalize">{format(cursor, "MMMM", { locale: ptBR })}</span>{" "}
            <span className="text-muted-foreground/50 font-semibold">
              {format(cursor, "yyyy")}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => setCursor(startOfMonth(new Date()))}>
              Hoje
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setCursor(subMonths(cursor, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setCursor(addMonths(cursor, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {query.isLoading ? (
          <CalendarSkeleton />
        ) : (
          <>
            {/* Desktop: grid semanal */}
            <div className="hidden md:grid grid-cols-7 gap-px bg-[hsl(var(--dp-border))] rounded-lg overflow-hidden border border-[hsl(var(--dp-border))]">
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
                <div
                  key={d}
                  className="bg-muted/40 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  {d}
                </div>
              ))}
              {days.map((day) => {
                const key = format(day, "yyyy-MM-dd");
                const events = eventsByDay.get(key) ?? [];
                const inMonth = isSameMonth(day, cursor);
                const isToday = isSameDay(day, new Date());
                const cap = capacityByDay.get(key) ?? null;
                const aprov = events.filter((e) => e.status === "aprovada" && e.tipo === "folga").length;
                const blocked = blockedByDate.get(key);
                const lotado = !blocked && cap != null && cap > 0 && aprov >= cap;

                const parcial = !blocked && aprov > 0 && !lotado;

                return (
                  <button
                    key={key}
                    onClick={() => openDay(day)}
                    title={blocked?.reason}
                    className={cn(
                      "min-h-[112px] bg-card p-2 text-left flex flex-col gap-1.5 transition-colors hover:bg-muted/30",
                      !inMonth && "bg-muted/10 text-muted-foreground",
                      blocked && inMonth && "bg-destructive/15 border border-destructive/40",
                      lotado && inMonth && "bg-red-50/60",
                      parcial && inMonth && "bg-emerald-50/40",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          "text-sm font-semibold",
                          isToday && "text-primary",
                          blocked && inMonth && "text-destructive",
                          lotado && inMonth && "text-red-700",
                          parcial && inMonth && "text-emerald-700",
                        )}
                      >
                        {format(day, "d")}
                      </span>
                      {inMonth && blocked && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-destructive/20 text-destructive uppercase tracking-wider">
                          Bloqueado
                        </span>
                      )}
                      {inMonth && !blocked && (
                        <span
                          className={cn(
                            "text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                            lotado
                              ? "bg-red-100 text-red-700"
                              : "bg-emerald-100 text-emerald-700",
                          )}
                        >
                          {aprov}{cap != null ? `/${cap}` : ""}

                        </span>
                      )}
                    </div>

                    <div className="flex flex-col gap-1 overflow-hidden">
                      {events.slice(0, 3).map((ev) => {
                        const isWeekly = ev.id.startsWith(WEEKLY_FOLGA_ID_PREFIX);
                        return (
                        <div
                          key={ev.id + key}
                          className={cn(
                            "truncate rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase text-center",
                            ev.status === "pendente"
                              ? "bg-violet-100 text-violet-700"
                              : isWeekly
                                ? "bg-blue-100 text-blue-700"
                                : ev.tipo === "folga"
                                  ? "bg-amber-100 text-amber-700"
                                  : ev.tipo === "ferias"
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-slate-100 text-slate-700",
                          )}
                          title={`${ev.dp_colaboradores?.nome ?? ""} — ${isWeekly ? "Folga Semanal" : TIPO_LABEL[ev.tipo]}`}
                        >
                          {(ev.dp_colaboradores?.nome ?? "—").split(" ")[0]}
                        </div>
                        );
                      })}
                      {events.length > 3 && (
                        <div className="text-[10px] text-muted-foreground pl-1">
                          +{events.length - 3}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Mobile: lista vertical (uma linha por dia do mês) */}
            <ul className="md:hidden divide-y rounded-lg border border-[hsl(var(--dp-border))] overflow-hidden bg-card">
              {days.filter((d) => isSameMonth(d, cursor)).map((day) => {
                const key = format(day, "yyyy-MM-dd");
                const events = eventsByDay.get(key) ?? [];
                const isToday = isSameDay(day, new Date());
                const cap = capacityByDay.get(key) ?? null;
                const aprov = events.filter((e) => e.status === "aprovada" && e.tipo === "folga").length;
                const blocked = blockedByDate.get(key);
                const lotado = !blocked && cap != null && cap > 0 && aprov >= cap;

                const parcial = !blocked && aprov > 0 && !lotado;
                const wd = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][day.getDay()];
                const hasEvents = events.length > 0 || !!blocked;

                return (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => openDay(day)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors active:bg-muted/60 hover:bg-muted/40",
                        isToday && "bg-primary/5",
                        blocked && "bg-destructive/5",
                      )}
                    >
                      <div className="grid w-16 shrink-0 grid-cols-[2.25rem_1.75rem] items-center gap-1">
                        <span className={cn(
                          "text-left text-[11px] font-semibold uppercase tracking-wide leading-none",
                          hasEvents ? "text-muted-foreground" : "text-muted-foreground/60",
                        )}>
                          {wd}
                        </span>
                        <span className={cn(
                          "text-right text-lg font-bold tabular-nums leading-none",
                          isToday && "text-primary",
                          blocked && "text-destructive",
                          !hasEvents && "text-muted-foreground/50",
                        )}>
                          {format(day, "d")}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0 flex flex-wrap gap-1">
                        {blocked && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-destructive/25 bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive max-w-full">
                            <Lock className="h-3 w-3 shrink-0" />
                            <span className="truncate">{blocked.reason || "Bloqueado"}</span>
                          </span>
                        )}
                        {!blocked && (
                          <span className={cn(
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                            lotado
                              ? "bg-red-100 text-red-700 border-red-200"
                              : parcial
                                ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                                : "bg-muted text-muted-foreground border-border",
                          )}>
                            {aprov}{cap != null ? `/${cap}` : ""}
                          </span>
                        )}
                        {events.map((ev) => {
                          const isWeekly = ev.id.startsWith(WEEKLY_FOLGA_ID_PREFIX);
                          const chipClass = ev.status === "pendente"
                            ? "bg-violet-100 text-violet-700 border-violet-200"
                            : isWeekly
                              ? "bg-blue-100 text-blue-700 border-blue-200"
                              : ev.tipo === "folga" || ev.tipo === "ferias"
                                ? "bg-amber-100 text-amber-700 border-amber-200"
                                : "bg-slate-100 text-slate-700 border-slate-200";
                          return (
                            <span
                              key={ev.id + key}
                              className={cn(
                                "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium max-w-full",
                                chipClass,
                              )}
                              title={`${ev.dp_colaboradores?.nome ?? ""} — ${isWeekly ? "Folga Semanal" : TIPO_LABEL[ev.tipo]}`}
                            >
                              <span className="truncate">
                                {(ev.dp_colaboradores?.nome ?? "—").split(" ")[0]}
                              </span>
                            </span>
                          );
                        })}
                      </div>

                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {/* Legend */}
        <div className="flex flex-wrap gap-x-6 gap-y-2 pt-5 mt-2 border-t border-[hsl(var(--dp-border))]">
          {LEGEND.map((l) => (
            <div key={l.label} className="flex items-center gap-2">
              <span className={cn("h-2.5 w-2.5 rounded-full", l.color)} />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {l.label}
              </span>
            </div>
          ))}
        </div>
      </DpContentCard>

      <Dialog
        open={!!selectedDay}
        onOpenChange={(o) => {
          if (!o) {
            setSelectedDay(null);
            setQuickColabId("");
          }
        }}
      >
        <DialogContent className="max-w-lg rounded-3xl border-none p-7 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-3xl font-black tracking-tight">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <CalendarDays className="h-6 w-6" />
              </div>
              {selectedDay && format(selectedDay, "dd/MM/yyyy")}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {selectedDay && format(selectedDay, "PPPP", { locale: ptBR })}
            </DialogDescription>
          </DialogHeader>

          {selectedDay && (
            <div className="space-y-6 py-2">
              {selectedBlock && (
                <div className="space-y-3 rounded-2xl border border-destructive/20 bg-destructive/10 p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-destructive">
                      <Lock className="h-3.5 w-3.5" /> Data Bloqueada
                    </h3>
                    <Badge
                      variant="outline"
                      className="border-destructive/30 text-[9px] font-black uppercase text-destructive"
                    >
                      {selectedBlock.auto ? "Automático" : "Manual"}
                    </Badge>
                  </div>
                  <div className="flex items-start gap-2 text-sm font-semibold text-destructive">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                    {selectedBlock.reason}
                  </div>
                  {selectedBlock.partials.length > 0 && (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-1.5">
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] text-emerald-700">
                        <MapPin className="h-3 w-3" />
                        Liberada em {selectedBlock.partials.length} unidade
                        {selectedBlock.partials.length > 1 ? "s" : ""}
                      </div>
                      <div className="text-xs text-emerald-800 space-y-0.5">
                        {selectedBlock.partials.map((p) => (
                          <div key={p.id}>• {p.unidade_nome}</div>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedBlock.partials.length > 0 && selectedBlock.auto ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          className="h-11 w-full rounded-xl border-emerald-500/40 font-bold text-emerald-700 hover:bg-emerald-500/10"
                          disabled={liberarData.isPending || rebloquearOverride.isPending}
                        >
                          <Unlock className="mr-2 h-4 w-4" />
                          Gerenciar liberações
                          <ChevronDown className="ml-1 h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-64">
                        <DropdownMenuLabel className="text-xs">Liberadas por unidade</DropdownMenuLabel>
                        {selectedBlock.partials.map((p) => (
                          <DropdownMenuItem
                            key={p.id}
                            onClick={() => rebloquearOverride.mutate(p.id)}
                          >
                            <Lock className="mr-2 h-4 w-4 text-rose-600" />
                            Bloquear em {p.unidade_nome}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => liberarData.mutate({ unidadeId: null })}>
                          <Globe2 className="mr-2 h-4 w-4 text-amber-600" />
                          Liberar para todas as unidades
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <Button
                      variant="outline"
                      className="h-11 w-full rounded-xl border-destructive/30 font-bold text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        if (selectedBlock.auto && selectedBlock.hasGlobal && unidadeFilter !== "todas") {
                          setLiberarEscopoOpen(true);
                        } else if (selectedBlock.auto && selectedBlock.hasGlobal) {
                          liberarData.mutate({ unidadeId: null });
                        } else {
                          const unidadeId = unidadeFilter === "todas" ? null : unidadeFilter;
                          liberarData.mutate({ unidadeId });
                        }
                      }}
                      disabled={liberarData.isPending}
                    >
                      <Unlock className="mr-2 h-4 w-4" /> Liberar Data
                    </Button>
                  )}
                </div>
              )}

              {selectedDay && (
                <div className="space-y-3 rounded-2xl border bg-muted/30 p-5">
                  <h3 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                    <Settings2 className="h-3.5 w-3.5" /> Quantas Pessoas Podem Folgar
                  </h3>
                  {(() => {
                    const res = limiteByDay.get(format(selectedDay, "yyyy-MM-dd"));
                    return (
                      <p className="text-[11px] text-muted-foreground">
                        {res?.limite != null
                          ? `Hoje o limite é ${res.limite} ${res.limite === 1 ? "pessoa" : "pessoas"} em folga — ${origemLimiteLabel(res.origem).toLowerCase()}.`
                          : "Nenhum limite para este dia. Cadastre uma regra fixa em Folgas > Regras ou informe uma exceção abaixo."}
                      </p>
                    );
                  })()}
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <Label className="mb-1.5 block text-[10px] font-bold text-muted-foreground">
                        Exceção só para esta data
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
                  <p className="text-[11px] text-muted-foreground">0 = ninguém pode folgar neste dia.</p>
                </div>
              )}


              <div className="space-y-3">
                <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                  Escala do dia
                </h3>
                <div className="space-y-2">
                  {selectedEvents.length === 0 ? (
                    <div className="rounded-2xl border-2 border-dashed py-10 text-center text-sm text-muted-foreground">
                      Ninguém escalado para este dia.
                    </div>
                  ) : (
                    selectedEvents.map((ev) => {
                      const isWeekly = ev.id.startsWith(WEEKLY_FOLGA_ID_PREFIX);
                      const podeGerenciar = !isWeekly && ev.tipo === "folga" && ev.status === "aprovada";
                      return (
                        <div
                          key={ev.id}
                          className="group flex items-center justify-between rounded-2xl border bg-card p-4 transition-all hover:shadow-md"
                        >
                          <div className="flex items-center gap-4">
                            <div
                              className={cn(
                                "h-3 w-3 rounded-full",
                                isWeekly && "bg-blue-500",
                                !isWeekly && ev.status === "pendente" && "bg-violet-500",
                                !isWeekly && ev.status === "aprovada" && ev.tipo === "folga" && "bg-primary",
                                !isWeekly && ev.tipo === "ferias" && "bg-amber-500",
                              )}
                            />
                            <div>
                              <div className="font-bold">{ev.dp_colaboradores?.nome ?? "—"}</div>
                              <div className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                {isWeekly ? "Folga Semanal" : TIPO_LABEL[ev.tipo]}
                                {ev.data_fim ? ` · até ${ev.data_fim}` : ""}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <DpStatusBadge tone={isWeekly ? "info" : statusToneFor(ev.status)}>
                              {isWeekly ? "Semanal" : STATUS_LABEL[ev.status]}
                            </DpStatusBadge>
                            {podeGerenciar && podeDistribuir && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground"
                                onClick={() => {
                                  setFolgaGerenciar({
                                    id: ev.id,
                                     colaboradorId: ev.colaborador_id,
                                    nome: ev.dp_colaboradores?.nome ?? "",
                                    data: ev.data_alvo,
                                  });
                                  setRemarcarData(ev.data_alvo);
                                  setCancelMotivo("");
                                }}
                              >
                                Gerenciar
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="space-y-3 border-t pt-5">
                <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                  Atribuir folga manual
                </h3>
                <div className="flex gap-3">
                  <Select value={quickColabId} onValueChange={setQuickColabId}>
                    <SelectTrigger className="h-12 flex-1 rounded-2xl font-semibold">
                      <SelectValue placeholder="Escolher colaborador..." />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl">
                      {(colabs.data ?? [])
                        .filter((c) => c.ativo !== false)
                        .filter((c) =>
                          unidadeFilter === "todas" ? true : c.unidade_id === unidadeFilter,
                        )
                        .map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.nome}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={() => quickAssign.mutate()}
                    disabled={!quickColabId || quickAssign.isPending}
                    className="h-12 rounded-2xl px-6 font-bold"
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    {quickAssign.isPending ? "Atribuindo..." : "Atribuir"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="sm:justify-center">
            <Button
              variant="ghost"
              onClick={() => {
                setSelectedDay(null);
                setQuickColabId("");
              }}
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Fechar detalhes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>



      <Dialog
        open={!!folgaGerenciar}
        onOpenChange={(o) => {
          if (!o) {
            setFolgaGerenciar(null);
            setRemarcarData("");
            setCancelMotivo("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Gerenciar folga</DialogTitle>
            <DialogDescription>
              {folgaGerenciar
                ? `${folgaGerenciar.nome} — ${format(parseISO(folgaGerenciar.data), "dd/MM/yyyy")}`
                : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Remarcar para outro dia
              </Label>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={remarcarData}
                  onChange={(e) => setRemarcarData(e.target.value)}
                  className="h-11"
                />
                <Button
                  onClick={() =>
                    folgaGerenciar &&
                    remarcarFolga.mutate({
                      id: folgaGerenciar.id,
                      colaboradorId: folgaGerenciar.colaboradorId,
                      dataAtual: folgaGerenciar.data,
                      novaData: remarcarData,
                    })
                  }
                  disabled={
                    !folgaGerenciar ||
                    !remarcarData ||
                    remarcarData === folgaGerenciar.data ||
                    remarcarFolga.isPending
                  }
                >
                  {remarcarFolga.isPending ? "Salvando..." : "Remarcar"}
                </Button>
              </div>
            </div>

            <div className="space-y-2 border-t pt-4">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Cancelar esta folga
              </Label>
              <Textarea
                rows={2}
                maxLength={500}
                placeholder="Motivo do cancelamento (fica visível no histórico)"
                value={cancelMotivo}
                onChange={(e) => setCancelMotivo(e.target.value)}
              />
              <Button
                variant="destructive"
                onClick={() =>
                  folgaGerenciar &&
                  cancelarFolga.mutate({
                    id: folgaGerenciar.id,
                    colaboradorId: folgaGerenciar.colaboradorId,
                    data: folgaGerenciar.data,
                    motivo: cancelMotivo.trim(),
                  })
                }
                disabled={!folgaGerenciar || cancelarFolga.isPending}
              >
                {cancelarFolga.isPending ? "Cancelando..." : "Cancelar folga"}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setFolgaGerenciar(null)}
              disabled={cancelarFolga.isPending || remarcarFolga.isPending}
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LiberarEscopoDialog
        open={liberarEscopoOpen}
        onOpenChange={setLiberarEscopoOpen}
        dataLabel={selectedDay ? format(selectedDay, "dd/MM/yyyy") : ""}
        unidadeNome={(() => {
          if (unidadeFilter === "todas") return null;
          const u = (unidadesQuery.data ?? []).find((x: any) => x.id === unidadeFilter);
          return u?.nome ?? null;
        })()}
        motivo={selectedBlock?.reason}
        loading={liberarData.isPending}
        onLiberarUnidade={() => {
          if (unidadeFilter === "todas") return;
          liberarData.mutate({ unidadeId: unidadeFilter });
        }}
        onLiberarGlobal={() => liberarData.mutate({ unidadeId: null })}
      />

      <Dialog open={autoOpen} onOpenChange={setAutoOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Gerar Folgas</DialogTitle>
            <DialogDescription>
              {format(cursor, "MMMM 'de' yyyy", { locale: ptBR })}
              {unidadeAlvo
                ? ` — ${(unidadesQuery.data ?? []).find((u: { id: string; nome: string }) => u.id === unidadeAlvo)?.nome ?? "unidade selecionada"}`
                : " — todas as unidades"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            {planoAutoQuery.isLoading && <p className="text-muted-foreground">Calculando...</p>}
            {planoAutoQuery.isError && (
              <p className="text-destructive">
                Não foi possível calcular a prévia. Tente novamente.
              </p>
            )}
            {planoAutoQuery.data && (
              <>
                <p className="font-medium">{resumoPlano(planoAutoQuery.data)}</p>

                {planoItens.length > 0 && (
                  <div className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
                    {planoItens.map(({ item, data }) => {
                      const removido = autoRemovidos.includes(item.colaboradorId);
                      
                      return (
                        <div
                          key={item.colaboradorId}
                          className={cn(
                            "flex flex-wrap items-center gap-2 rounded-md border p-2",
                            removido && "opacity-50",
                          )}
                        >
                          <span className="min-w-[10rem] flex-1 font-medium">{item.nome}</span>

                          {!item.data && !removido && (
                            <Badge
                              variant="outline"
                              className={
                                item.motivo === "ACIMA_DO_LIMITE"
                                  ? "text-destructive"
                                  : "text-amber-600"
                              }
                            >
                              {item.motivo === "ACIMA_DO_LIMITE"
                                ? "Acima do limite — escolha o dia"
                                : item.motivo === "SEM_DIA_SEM_CONFLITO"
                                  ? "Todos os dias têm conflito"
                                  : "Sem dia disponível"}
                            </Badge>
                          )}
                          <Select
                            value={data ?? undefined}
                            disabled={removido}
                            onValueChange={(v) =>
                              setAutoEdits((prev) => ({ ...prev, [item.colaboradorId]: v }))
                            }
                          >
                            <SelectTrigger className="h-8 w-[13rem]">
                              <SelectValue placeholder="Escolher dia" />
                            </SelectTrigger>
                            <SelectContent>
                              {diasValidosDoItem(
                                planoAutoQuery.data?.competencia ?? competenciaAtual,
                                item,
                              ).map((d) => {
                                const emFolga = item.ocupacao[d] ?? 0;
                                return (
                                  <SelectItem key={d} value={d}>
                                    {format(parseISO(d), "dd/MM (EEE)", { locale: ptBR })}
                                    {emFolga > 0 ? ` — ${emFolga} em folga` : ""}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>

                          {item.excedeLimite && !removido && (
                            <Badge variant="outline" className="text-destructive">
                              Acima do limite
                            </Badge>
                          )}

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setAutoRemovidos((prev) =>
                                removido
                                  ? prev.filter((id) => id !== item.colaboradorId)
                                  : [...prev, item.colaboradorId],
                              )
                            }
                          >
                            {removido ? "Incluir" : "Remover"}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  O sistema sugere primeiro os últimos dias possíveis do mês, preferindo os dias
                  mais vazios e respeitando os limites por dia e cargo e as pessoas que não podem
                  folgar juntas. Você pode trocar a data ou remover alguém da geração. Quando todos
                  os dias de alguém já estão no limite, nenhuma folga é criada — escolha o dia
                  manualmente. Quem já tem folga no mês não aparece aqui.
                </p>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setAutoOpen(false)} disabled={distribuirAuto.isPending}>
              {itensConfirmados.length === 0 ? "Fechar" : "Cancelar"}
            </Button>
            {itensConfirmados.length > 0 && (
              <Button
                onClick={() => distribuirAuto.mutate()}
                disabled={distribuirAuto.isPending || planoAutoQuery.isLoading}
              >
                {distribuirAuto.isPending
                  ? "Distribuindo..."
                  : `Criar ${itensConfirmados.length} folga(s)`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DpPage>

  );
}
