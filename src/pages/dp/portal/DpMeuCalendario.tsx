import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, eachDayOfInterval, endOfMonth, startOfMonth } from "date-fns";
import {
  AlertCircle,
  ArrowLeftRight,
  CalendarDays,
  CalendarClock,
  Send,
  User as UserIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { FolgaCalendarShared } from "@/components/dp/FolgaCalendarShared";
import { Button } from "@/components/ui/button";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { Badge } from "@/components/ui/badge";
import { ConfirmarAcaoDialog } from "@/components/dp/ConfirmarAcaoDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useDpFolgaLimites } from "@/hooks/useDpFolgaLimites";
import { ocupacaoNoEscopo, resolverLimiteFolga } from "@/lib/dp/folga-limites";
import {
  resolverJanela,
  podeMarcarNormal,
  mensagemJanela,
  type JanelaResolvida,
} from "@/lib/dp/folga-janela";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDpRegrasColaborador } from "@/hooks/useDpRegrasColaborador";
import { resumoEscolhaFolgas, folgaDominicalAutomatica, podeTrocarFolga, domingosFolgaNoPeriodo } from "@/lib/dp/dsr-rules";
import { folgasOfertaveis } from "@/lib/dp/troca-oferta";
import { mensagemErroTroca } from "@/lib/dp/trocas-erros";
import { avaliarRiscoDsrTroca, avisoDsr } from "@/lib/dp/dsr-consecutivo";
import {
  diasParaRemarcar,
  mensagemErroRemarcacao,
  pedirAoDp,
  trocaExigeAprovacaoGestor,
} from "@/lib/dp/folga-remarcacao";


import {
  buildOccupantsByDate,
  calculateDateStatus,
  dayType,
  diasFixosDeFolga,
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
import { MinhaDisponibilidadeCard } from "@/components/dp/MinhaDisponibilidadeCard";
import { pessoaConvocavel } from "@/lib/dp/convocacoes-planejamento";
import { notifyError } from "@/lib/notifyError";
import { negarRegra } from "@/lib/dp/regraAviso";

/** Retorno do cálculo do período de escolha feito no servidor. */
interface JanelaRemota {
  ativa: boolean;
  abre_dia: number;
  fecha_dia: number;
  hoje: string;
  competencia: string;
  estado: string;
}

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

/** Nome do dia da semana em português, para deixar claro qual folga está em jogo. */
const DIA_SEMANA_BR = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];
const diaSemanaBR = (iso: string) => DIA_SEMANA_BR[parseYMD(iso).getDay()];
/** Ex.: "domingo, 25/10/2026" */
const descreverDia = (iso: string) => `${diaSemanaBR(iso)}, ${formatBR(parseYMD(iso))}`;

/** Motivo, em linguagem simples, de o dia escolhido depender do gestor. */
const MOTIVO_STATUS: Partial<Record<DateStatusKind, string>> = {
  taken: "Neste dia já foi atingido o número de pessoas que podem folgar",
  blocked: "Este dia está bloqueado pelo setor de pessoal",
  pending: "Este dia já tem uma solicitação em análise",
  birthday: "Este dia está reservado para aniversariante",
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
  /** Mudança do dia da própria folga: dia atual, novo dia e motivo. */
  const [remarcarOpen, setRemarcarOpen] = useState<string | null>(null);
  const [remarcarNova, setRemarcarNova] = useState("");
  const [remarcarMotivo, setRemarcarMotivo] = useState("");
  const [remarcarAviso, setRemarcarAviso] = useState<string | null>(null);
  const [socioBloqueio, setSocioBloqueio] = useState<{ nome: string; datas: string[]; unidadeId: string | null } | null>(
    null,
  );

  const meRef = useQuery({
    queryKey: ["dp_meu_colaborador", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.rpc("dp_meu_colaborador");
      if (!data) return null;
      const { data: c } = await supabase
        .from("dp_colaboradores")
        .select("id, company_id, nome, sexo, regime, forma_pagamento, cargo_id, domingos_folga_mes, folga_dif_dias, folga_fixa_semana, ativo, unidade_id, vinculo_label")
        .eq("id", data)
        .single();
      return c;
    },
  });

  /** Intermitente/Freelancer usam a agenda de disponibilidade. */
  const convocavel = pessoaConvocavel(meRef.data ?? {});



  const range = useMemo(() => {
    const s = startOfMonth(new Date(ano, mes - 1, 1));
    const e = endOfMonth(s);
    return { start: ymd(s), end: ymd(e), startDate: s, endDate: e };
  }, [ano, mes]);

  const companyId = meRef.data?.company_id;
  const myUnidade = meRef.data?.unidade_id ?? null;
  const { config: regrasConfig, diasElegiveis, tetoMensal, domingosMes: domingosMesEfetivo } = useDpRegrasColaborador(companyId, myUnidade, (meRef.data as { sexo?: string | null } | undefined)?.sexo ?? null, (meRef.data as { domingos_folga_mes?: number | null } | undefined)?.domingos_folga_mes ?? null, (meRef.data as { cargo_id?: string | null } | undefined)?.cargo_id ?? null, (meRef.data as { folga_dif_dias?: number[] | null } | undefined)?.folga_dif_dias ?? null);
  const resumoFolgas = resumoEscolhaFolgas(regrasConfig, { sexo: (meRef.data as { sexo?: string | null } | undefined)?.sexo ?? null });
  /** No padrão CLT o sistema gera a folga dominical — o colaborador não marca nem remove. */
  const folgaCltAutomatica = folgaDominicalAutomatica(regrasConfig);

  /** Período mensal de escolha das folgas (fonte da verdade no servidor). */
  const janelaQuery = useQuery({
    queryKey: ["dp_folga_janela", companyId, myUnidade],
    enabled: !!companyId,
    queryFn: async (): Promise<JanelaRemota | null> => {
      const { data, error } = await supabase.rpc("dp_folgas_janela_efetiva", {
        _company: companyId!,
        _unidade: myUnidade ?? undefined,
      });
      if (error) throw error;
      return (data ?? null) as unknown as JanelaRemota | null;
    },
  });

  const janela = useMemo<JanelaResolvida>(() => {
    const remota = janelaQuery.data;
    return resolverJanela(
      {
        ativa: remota?.ativa === true,
        abreDia: Number(remota?.abre_dia ?? 10),
        fechaDia: Number(remota?.fecha_dia ?? 20),
      },
      remota?.hoje ? parseYMD(remota.hoje) : new Date(),
    );
  }, [janelaQuery.data]);

  const avisoJanela = janela.estado === "inativa" ? "" : mensagemJanela(janela, formatBR);



  /**
   * Colegas da minha loja. A leitura direta de `dp_colaboradores` é restrita ao
   * próprio registro, então o portal usa a consulta segura da equipe, que
   * devolve apenas nome, nome social, função e dia de folga fixa.
   */
  const colaboradoresQuery = useQuery({
    queryKey: ["dp_equipe_meu_cal", companyId, myUnidade],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dp_portal_equipe_unidade");
      if (error) throw error;
      return ((data ?? []) as any[]).map((c) => ({
        id: c.id,
        nome: c.nome_social || c.nome,
        folga_fixa_semana: c.folga_fixa_semana ?? null,
        folgas_fixas_dow: Array.isArray(c.folgas_fixas_dow) ? c.folgas_fixas_dow.map(Number) : null,
        ativo: c.ativo,
        unidade_id: c.unidade_id,
      })) as ColaboradorRecord[];
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
          "id, data, colaborador_id, status, tipo, extra, origem, criado_por, dp_colaboradores(nome, unidade_id, cargo_id)",
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
        .is("removido_em", null)
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

  /**
   * Dias em que alguém da equipe cedeu a folga semanal numa troca: nesse dia a
   * pessoa trabalha, então o calendário não pode desenhar folga fixa ali.
   */
  const trabalhoExcepcionalQuery = useQuery({
    queryKey: ["dp_trab_excep_meu_cal", companyId, ano, mes],
    enabled: !!companyId,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase.rpc("dp_portal_trabalho_excepcional" as any, {
        _de: range.start,
        _ate: range.end,
      });
      if (error) throw error;
      const s = new Set<string>();
      for (const r of (data ?? []) as { colaborador_id: string; data: string }[]) {
        s.add(`${r.colaborador_id}|${r.data}`);
      }
      return s;
    },
  });

  /** Trocas minhas que ainda aguardam o colega ou o gestor. */
  const trocasPendentesQuery = useQuery({
    queryKey: ["dp_trocas_pend_meu_cal", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_trocas")
        .select("id, solicitante_id, destino_id, data_original, data_proposta, status")
        .eq("company_id", companyId!)
        .in("status", ["pendente_colega", "pendente_gestor"]);
      if (error) throw error;
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

  /**
   * Dias fixos de descanso da minha configuração de trabalho. Quem descansa em
   * mais de um dia (sábado e domingo, por exemplo) não cabe no campo único do
   * cadastro, então o calendário lê a configuração.
   */
  const meusDiasFixosQuery = useQuery({
    queryKey: ["dp_meus_dias_fixos", meRef.data?.id],
    enabled: !!meRef.data?.id,
    queryFn: async (): Promise<number[]> => {
      const { data: cfg } = await supabase
        .from("dp_colaborador_config_trabalho")
        .select("id")
        .eq("colaborador_id", meRef.data!.id)
        .order("vigencia_inicio", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cfg?.id) return [];
      const { data: dias } = await supabase
        .from("dp_colaborador_config_dias")
        .select("dow, trabalha")
        .eq("config_id", cfg.id);
      return (dias ?? []).filter((d: any) => d.trabalha === false).map((d: any) => Number(d.dow));
    },
  });

  const colaboradoresAll = useMemo(() => {
    const lista = colaboradoresQuery.data ?? [];
    const fixos = meusDiasFixosQuery.data ?? [];
    if (!fixos.length || !meRef.data?.id) return lista;
    return lista.map((c) =>
      c.id === meRef.data!.id ? { ...c, folgas_fixas_dow: fixos } : c,
    );
  }, [colaboradoresQuery.data, meusDiasFixosQuery.data, meRef.data?.id]);
  // Filtra colaboradores da minha unidade (se eu tiver)
  const colaboradores = useMemo(
    () => (myUnidade ? colaboradoresAll.filter((c) => c.unidade_id === myUnidade) : colaboradoresAll),
    [colaboradoresAll, myUnidade],
  );
  const folgas = (folgasQuery.data ?? []) as any[];
  const pendentes = (pendentesQuery.data ?? []) as any[];

  /**
   * Folgas de descanso semanal: quantas a regra prevê no mês visto e quantas
   * já estão marcadas para mim. Conta todos os dias elegíveis da regra da
   * unidade (ex.: CCT com sábado e domingo), não só domingos.
   */
  const resumoDomingos = useMemo(() => {
    const elegiveis = diasElegiveis.length ? diasElegiveis : [0];
    const soDomingo = elegiveis.length === 1 && elegiveis[0] === 0;
    const rotulo = soDomingo ? "em domingo" : "de fim de semana";
    const dias = eachDayOfInterval({ start: range.startDate, end: range.endDate });
    const domingosNoMes = dias.filter((d) => d.getDay() === 0).length;
    const previstas = domingosFolgaNoPeriodo(regrasConfig, domingosNoMes, {
      sexo: (meRef.data as { sexo?: string | null } | undefined)?.sexo ?? null,
      domingosMes: domingosMesEfetivo,
    });
    // Férias no mês: a folga continua valendo, mas só pode cair nos dias
    // trabalhados — a pessoa precisa saber disso antes de escolher.
    const temFerias = folgas.some(
      (f) =>
        f.colaborador_id === meRef.data?.id &&
        f.status !== "cancelada" &&
        (f.tipo === "ferias" || f.tipo === "licenca") &&
        parseYMD(f.data) >= range.startDate &&
        parseYMD(f.data) <= range.endDate,
    );
    const avisoFerias = temFerias
      ? " Neste mês você tem férias: sua folga fica restrita aos dias em que você trabalha, com prioridade para os dias mais próximos da saída e do retorno."
      : "";
    if (previstas <= 0)
      return `Neste mês a regra da sua loja não prevê folga ${rotulo}.` + avisoFerias;
    const minhas = folgas.filter(
      (f) =>
        f.colaborador_id === meRef.data?.id &&
        f.status !== "cancelada" &&
        elegiveis.includes(parseYMD(f.data).getDay()) &&
        parseYMD(f.data) >= range.startDate &&
        parseYMD(f.data) <= range.endDate,
    ).length;
    const fixos = diasFixosDeFolga({
      folga_fixa_semana: meRef.data?.folga_fixa_semana ?? null,
      folgas_fixas_dow: meusDiasFixosQuery.data ?? [],
    });
    if (elegiveis.some((dow) => fixos.includes(dow)))
      return (soDomingo ? "Domingo é seu dia de folga fixa." : "Seu dia de folga fixa já cobre o descanso deste mês.") + avisoFerias;
    if (minhas >= previstas)
      return `Sua folga ${rotulo} deste mês já está marcada.` + avisoFerias;
    const plural = previstas === 1 ? `folga ${rotulo}` : `folgas ${rotulo}`;
    return (
      `Você tem ${previstas} ${plural} neste mês e ${minhas} já marcada(s). ${
        folgaCltAutomatica
          ? soDomingo
            ? "O domingo é definido pelo setor de pessoal."
            : "O dia é definido pelo setor de pessoal."
          : soDomingo
            ? "Toque em um domingo livre para marcar."
            : "Toque em um dia livre de fim de semana para marcar."
      }` + avisoFerias
    );

  }, [
    diasElegiveis,
    domingosMesEfetivo,
    folgas,
    folgaCltAutomatica,
    meRef.data,
    meusDiasFixosQuery.data,
    range.endDate,
    range.startDate,
    regrasConfig,
  ]);

  const occupantsByDate = useMemo(() => {
    const days = eachDayOfInterval({ start: range.startDate, end: range.endDate });
    // A unidade vem da lista de colegas: o portal não lê o cadastro dos outros,
    // então filtrar pelo vínculo aninhado deixava o calendário vazio.
    const idsUnidade = new Set(colaboradores.map((c) => c.id));
    // A equipe já vem sem sócios e só do meu período de turno: nada fora dela aparece.
    const filteredFolgas = folgas.filter((f) => idsUnidade.has(f.colaborador_id));
    const filteredPend = pendentes.filter((p) => idsUnidade.has(p.colaborador_id));
    return buildOccupantsByDate({
      days,
      colaboradores,
      folgas: filteredFolgas,
      pendentes: filteredPend,
      trabalhoExcepcional: trabalhoExcepcionalQuery.data,
    });
  }, [
    colaboradores,
    folgas,
    pendentes,
    myUnidade,
    range.startDate,
    range.endDate,
    trabalhoExcepcionalQuery.data,
  ]);

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

  const { regras: regrasLimite } = useDpFolgaLimites(myUnidade);

  const myCargoId = (meRef.data as { cargo_id?: string | null } | undefined)?.cargo_id ?? null;

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
    // Dias sem exceção herdam a regra fixa cadastrada pela empresa
    for (const d of eachDayOfInterval({ start: range.startDate, end: range.endDate })) {
      const iso = ymd(d);
      if (m.has(iso)) continue;
      const res = resolverLimiteFolga({
        data: iso,
        unidadeId: myUnidade,
        cargoId: myCargoId,
        regras: regrasLimite,
      });
      if (res.limite != null) m.set(iso, res.limite);
    }
    return m;
  }, [diaConfigQuery.data, myUnidade, myCargoId, regrasLimite, range.startDate, range.endDate]);

  // Escopo de cargos da regra recorrente resolvida por dia (null = todos os cargos).
  // Exceções de data específica (dia_config) valem para a unidade inteira.
  const dayRegraCargos = useMemo(() => {
    const m = new Map<string, string[] | null>();
    for (const d of eachDayOfInterval({ start: range.startDate, end: range.endDate })) {
      const iso = ymd(d);
      const res = resolverLimiteFolga({
        data: iso,
        unidadeId: myUnidade,
        cargoId: myCargoId,
        regras: regrasLimite,
      });
      m.set(iso, res.origem === "regra_recorrente" ? res.regra?.cargo_ids ?? null : null);
    }
    return m;
  }, [myUnidade, myCargoId, regrasLimite, range.startDate, range.endDate]);


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
  const hojeIso = useMemo(() => ymd(new Date()), []);
  const minhasFolgasFuturas = useMemo(
    () => folgasOfertaveis(folgas, { meuId: meRef.data?.id, hojeIso }),
    [folgas, meRef.data?.id, hojeIso],
  );

  /**
   * Dias de folga semanal fixa do mês visto (de hoje em diante). Não existem
   * como registro de folga, mas podem ser cedidos numa troca ou numa exceção.
   */
  const minhasFixasFuturas = useMemo(() => {
    const fixos = diasFixosDeFolga({
      folga_fixa_semana: meRef.data?.folga_fixa_semana ?? null,
      folgas_fixas_dow: meusDiasFixosQuery.data ?? [],
    });
    if (!fixos.length || !meRef.data?.id) return [] as { id: string; data: string; fixa: true }[];
    const comRegistro = new Set(
      folgas.filter((f) => f.colaborador_id === meRef.data!.id && f.status !== "cancelada").map((f) => f.data as string),
    );
    return eachDayOfInterval({ start: range.startDate, end: range.endDate })
      .filter((d) => fixos.includes(d.getDay()))
      .map((d) => ymd(d))
      .filter((iso) => iso >= hojeIso && !comRegistro.has(iso))
      .map((iso) => ({ id: `fixa-${iso}`, data: iso, fixa: true as const }));
  }, [meRef.data, meusDiasFixosQuery.data, folgas, range.startDate, range.endDate, hojeIso]);

  /** Folgas ofertáveis para o dia aberto no diálogo (sem o próprio dia pedido). */
  const folgasParaOferecer = useMemo(() => {
    const avulsas = folgasOfertaveis(folgas, { meuId: meRef.data?.id, hojeIso, diaPedidoIso: tradeOpen?.iso }).map(
      (f) => ({ id: f.id as string, data: f.data as string, fixa: false }),
    );
    const fixas = minhasFixasFuturas.filter((f) => f.data !== tradeOpen?.iso);
    return [...avulsas, ...fixas].sort((a, b) => a.data.localeCompare(b.data));
  }, [folgas, meRef.data?.id, hojeIso, tradeOpen?.iso, minhasFixasFuturas]);

  /** Exceção ao gestor: folga extra ou troca de um dia da folga semanal. */
  const [excecaoModo, setExcecaoModo] = useState<"extra" | "troca_semanal">("extra");
  const [excecaoDiaTrabalho, setExcecaoDiaTrabalho] = useState("");
  const fixasParaExcecao = useMemo(() => {
    if (!selectedDay) return [];
    const alvo = parseYMD(selectedDay.iso).getTime();
    return minhasFixasFuturas
      .filter((f) => f.data !== selectedDay.iso)
      .sort((a, b) => Math.abs(parseYMD(a.data).getTime() - alvo) - Math.abs(parseYMD(b.data).getTime() - alvo));
  }, [minhasFixasFuturas, selectedDay]);


  // -------- Mutations --------
  const marcarFolga = useMutation({
    mutationFn: async (iso: string) => {
      if (!meRef.data) throw new Error("Colaborador não encontrado");
      const d = parseYMD(iso);
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);

      // 1) data passada
      if (d < hoje) negarRegra("Não é possível marcar folga em data passada.");

      // 2) fim de semana
      const wd = d.getDay();
      if (wd !== 0 && wd !== 6) {
        negarRegra('Apenas fins de semana podem ser marcados diretamente. Use "Solicitar exceção".');
      }

      // 2a) período mensal de escolha (só o início da escolha é restrito)
      if (!podeMarcarNormal(janela, d)) {
        const alvo = janela.competencia.toLocaleDateString("pt-BR", {
          month: "long",
          year: "numeric",
        });
        if (janela.estado === "antes") {
          negarRegra(
            `A escolha das folgas de ${alvo} abre em ${formatBR(janela.abreEm)}. Até lá, use "Solicitar exceção".`,
          );
        }
        negarRegra(
          `Agora você escolhe as folgas de ${alvo}. Para folgar neste dia, use "Solicitar exceção".`,
        );
      }

      // 2b) folga dominical automática (padrão CLT): definida pelo sistema
      if (wd === 0 && folgaCltAutomatica) {
        negarRegra(
          "No padrão CLT a folga dominical é definida automaticamente pelo sistema. Use uma troca ou solicite exceção.",
        );
      }



      // 3) folga fixa própria
      const fixos = diasFixosDeFolga({
        folga_fixa_semana: meRef.data.folga_fixa_semana,
        folgas_fixas_dow: meusDiasFixosQuery.data ?? [],
      });
      if (fixos.includes(wd)) {
        negarRegra('Este é seu dia de folga fixa. Use "Solicitar exceção" ou uma troca.');
      }

      // 4) já tem folga própria nesse dia
      const jaNoDia = folgas.some(
        (f) => f.colaborador_id === meRef.data!.id && f.data === iso && f.status !== "cancelada",
      );
      if (jaNoDia) negarRegra("Você já tem folga marcada neste dia.");

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
      if (jaTem)
        negarRegra(
          "Você já possui uma folga de fim de semana neste mês. Remova a folga atual para escolher outra data.",
        );

      // 6) bloqueio manual
      const bloq = manualBlocked.get(iso);
      if (bloq && !bloq.liberada) negarRegra("Esta data está bloqueada administrativamente.");

      // 7) lotação efetiva incluindo reservas de indisponibilidade (Fase 4)
      const { data: limiteDia, error: limiteErr } = await supabase.rpc("dp_folga_limite_dia", {
        p_company: meRef.data.company_id,
        p_unidade: myUnidade as string,
        p_cargo: myCargoId as string,
        p_data: iso,
        p_ignorar_colaborador: undefined,
        p_setor: undefined,
      });
      if (limiteErr) throw limiteErr;
      const limiteInfo = (limiteDia ?? {}) as Record<string, any>;
      if (limiteInfo.excedido) {
        negarRegra(
          limiteInfo.reserva && limiteInfo.reserva > 0
            ? "Data indisponível. Vagas reservadas por indisponibilidade de convocáveis."
            : "Data indisponível. Limite de folgas atingido.",
        );
      }

      // 8) pessoas que não podem folgar no mesmo dia
      const { data: conflito, error: conflitoErr } = await supabase.rpc(
        "dp_folga_conflito_colaboradores",
        {
          _company: meRef.data.company_id,
          _colaborador: meRef.data.id,
          _data: iso,
        },
      );
      if (conflitoErr) throw conflitoErr;
      const c = (conflito ?? null) as { conflito?: boolean; colega_nome?: string | null } | null;
      if (c?.conflito) {
        negarRegra(
          `${c.colega_nome ?? "Um colega"} já está de folga neste dia e vocês não podem folgar juntos. Escolha outro dia.`,
        );
      }



      const { error } = await supabase.rpc("dp_folga_marcar", { p_data: iso });
      if (error) {
        const raw = error.message ?? "";
        if (raw.includes("FOLGA_FORA_DA_JANELA"))
          negarRegra('Fora do período de escolha das folgas. Use "Solicitar exceção".');
        if (raw.includes("FOLGA_LIMITE_DIA"))
          negarRegra("Data indisponível. Limite de folgas atingido.");
        if (raw.includes("FOLGA_INCOMPATIBILIDADE"))
          negarRegra(
            raw.split("FOLGA_INCOMPATIBILIDADE:").pop()?.trim() ||
              "Você não pode folgar no mesmo dia de um colega desta regra.",
          );
        if (raw.includes("DUPLICATE_REQUEST")) negarRegra("Você já tem folga marcada neste dia.");
        if (raw.includes("PAST_DATE_NOT_EDITABLE"))
          negarRegra("Não é possível marcar folga em datas passadas.");
        throw error;
      }
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
    onError: (e: any) => notifyError(e, { surface: "Meu calendário", action: "concluir a ação", fallback: "Erro ao marcar folga" }),
  });

  const removerFolga = useMutation({
    mutationFn: async (iso: string) => {
      if (!meRef.data) throw new Error("Colaborador não encontrado");
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      if (parseYMD(iso) < hoje) negarRegra("Não é possível remover folga passada.");
      const folga = folgas.find(
        (f) => f.colaborador_id === meRef.data!.id && f.data === iso && f.status !== "cancelada",
      );
      if (!folga) negarRegra("Folga não encontrada.");
      if (folga!.origem === "automatica_clt") {
        negarRegra(
          "Esta folga dominical é definida pela CLT e não pode ser removida. Solicite uma troca ou uma exceção.",
        );
      }

      const { error } = await supabase.rpc("dp_folga_remover", { p_data: iso });
      if (error) {
        const raw = error.message ?? "";
        if (raw.includes("FOLGA_OBRIGATORIA"))
          negarRegra(
            "Esta folga dominical é definida pela CLT e não pode ser removida. Solicite uma troca ou uma exceção.",
          );
        if (raw.includes("FOLGA_NAO_REMOVIVEL"))
          negarRegra("Apenas folgas marcadas por você podem ser removidas. Fale com o DP.");
        if (raw.includes("FOLGA_NAO_ENCONTRADA")) negarRegra("Folga não encontrada.");
        if (raw.includes("PAST_DATE_NOT_EDITABLE"))
          negarRegra("Não é possível remover folga passada.");
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Folga removida.");
      setSelectedDay(null);
      qc.invalidateQueries({ queryKey: ["dp_folgas_meu_cal"] });
    },
    onError: (e: any) => notifyError(e, { surface: "Meu calendário", action: "concluir a ação", fallback: "Erro ao remover folga" }),
  });

  const enviarExcecao = useMutation({
    mutationFn: async () => {
      if (!meRef.data || !selectedDay) throw new Error("Sem contexto");
      const troca = excecaoModo === "troca_semanal";
      if (troca && !excecaoDiaTrabalho) negarRegra("Escolha qual dia da sua folga semanal você vai trabalhar.");
      const motivo =
        exceptionMotivo.trim() ||
        (troca ? "Troca da folga semanal solicitada ao gestor" : "Folga extra solicitada ao gestor");
      const { error } = troca
        ? await supabase.rpc("dp_folga_troca_fds_solicitar", {
            p_data_folga: selectedDay.iso,
            p_data_trabalho: excecaoDiaTrabalho,
            p_motivo: motivo,
          })
        : await supabase.rpc("dp_folga_solicitar", {
            p_data: selectedDay.iso,
            p_motivo: motivo,
            p_fora_da_janela: true,
          });
      if (error) {
        const raw0 = error.message ?? "";
        if (raw0.includes("TROCA_DIA_TRABALHO_INVALIDO"))
          negarRegra("O dia que você vai trabalhar precisa ser um dia da sua folga semanal.");
        if (raw0.includes("TROCA_DIA_FOLGA_INVALIDO")) negarRegra("Esse dia já é sua folga semanal.");
        if (raw0.includes("TROCA_JA_TEM_FOLGA")) negarRegra("Você já tem folga registrada nesse dia.");
        if (raw0.includes("TROCA_SEM_FOLGA_FIXA")) negarRegra("Seu cadastro não tem folga semanal fixa.");
        const raw = error.message ?? "";
        if (raw.includes("FOLGA_LIMITE_DIA"))
          negarRegra(
            "Neste dia já foi atingido o número de pessoas que podem folgar. Escolha outro dia ou fale com o DP.",
          );

        if (raw.includes("FOLGA_INCOMPATIBILIDADE"))
          negarRegra(
            raw.split("FOLGA_INCOMPATIBILIDADE:").pop()?.trim() ||
              "Você não pode folgar no mesmo dia de um colega desta regra.",
          );
        if (raw.includes("DUPLICATE_REQUEST"))
          negarRegra("Você já tem uma solicitação pendente para este dia.");
        if (raw.includes("PAST_DATE_NOT_EDITABLE"))
          negarRegra("Não é possível solicitar folga em datas passadas.");
        throw new Error("Não foi possível enviar a solicitação. Tente novamente.");
      }
    },
    onSuccess: () => {
      toast.success("Solicitação de exceção enviada.");
      setExceptionOpen(false);
      setExceptionMotivo("");
      setSelectedDay(null);
      qc.invalidateQueries({ queryKey: ["dp_solic_meu_cal"] });
    },
    onError: (e: any) => notifyError(e, { surface: "Meu calendário", action: "concluir a ação", fallback: "Erro ao enviar exceção" }),
  });


  const solicitarTroca = useMutation({
    mutationFn: async () => {
      if (!meRef.data || !tradeOpen) throw new Error("Sem contexto");
      if (!tradeMyDate) negarRegra("Escolha uma folga sua para oferecer.");
      if (tradeOpen.occupantId === meRef.data.id)
        negarRegra("Não é possível trocar uma folga com você mesmo.");
      if (tradeMyDate === tradeOpen.iso)
        negarRegra("Escolha uma folga sua em outro dia: a troca precisa ser entre dias diferentes.");
      const motivo = tradeMotivo.trim() || "Solicitação de troca via calendário";
      // regra da unidade: modo e escopo da troca (o fim do período não altera isso)
      const tipoTroca = parseYMD(tradeMyDate).getDay() === 0 ? "dominical" : "semanal";
      const check = podeTrocarFolga(regrasConfig, tipoTroca);
      if (!check.permitida) negarRegra(check.motivo ?? "Troca de folga não permitida.");


      // duplicidade, folgas envolvidas e concorrência são revalidadas no servidor
      const { error } = await supabase.rpc("dp_troca_propor", {
        p_destino: tradeOpen.occupantId,
        p_data_original: tradeMyDate,
        p_data_proposta: tradeOpen.iso,
        p_motivo: motivo,
      });
      if (error) throw new Error(mensagemErroTroca(error.message));
    },
    onSuccess: () => {
      toast.success(
        tradeMyDate && tradeOpen && trocaExigeAprovacaoGestor(tradeMyDate, tradeOpen.iso)
          ? "Troca enviada ao colega. Depois do aceite, o gestor precisa aprovar."
          : "Solicitação de troca enviada ao colega.",
      );
      setTradeOpen(null);
      setTradeMyDate("");
      setTradeMotivo("");
      setSelectedDay(null);
    },
    onError: (e: any) => notifyError(e, { surface: "Meu calendário", action: "concluir a ação", fallback: "Erro ao solicitar troca" }),
  });

  /** Dias do mês para onde a folga aberta no diálogo pode ser movida. */
  const diasRemarcacao = useMemo(() => {
    if (!remarcarOpen) return [];
    const lotadas: string[] = [];
    dayLimits.forEach((limite, iso) => {
      const ocupantes = (occupantsByDate.get(iso) ?? []).filter(
        (o) => o.colaboradorId !== meRef.data?.id,
      ).length;
      if (limite != null && ocupantes >= limite) lotadas.push(iso);
    });
    const bloqueadas: string[] = [];
    manualBlocked.forEach((b, iso) => {
      if (!b.liberada) bloqueadas.push(iso);
    });
    return diasParaRemarcar({
      dataAtualIso: remarcarOpen,
      hojeIso,
      diasElegiveis: diasElegiveis.length ? diasElegiveis : [0, 6],
      bloqueadas,
      lotadas,
      minhasFolgas: folgas
        .filter((f) => f.colaborador_id === meRef.data?.id && f.status !== "cancelada")
        .map((f) => f.data as string),
    });
  }, [
    remarcarOpen,
    hojeIso,
    diasElegiveis,
    dayLimits,
    manualBlocked,
    occupantsByDate,
    folgas,
    meRef.data?.id,
  ]);

  const diaRemarcacaoEscolhido = diasRemarcacao.find((d) => d.iso === remarcarNova) ?? null;

  /**
   * Colegas que folgam no dia desejado. Antes de pedir a exceção ao gestor,
   * o colaborador pode propor a troca direta com um deles.
   */
  const colegasNoDiaDesejado = useMemo(() => {
    if (!remarcarNova) return [] as { colaboradorId: string; nome: string }[];
    const vistos = new Set<string>();
    return (occupantsByDate.get(remarcarNova) ?? [])
      .filter((o) => o.colaboradorId !== meRef.data?.id && o.type !== "pending")
      .filter((o) => (vistos.has(o.colaboradorId) ? false : (vistos.add(o.colaboradorId), true)))
      .map((o) => ({ colaboradorId: o.colaboradorId, nome: o.colaboradorNome || "Colega" }));
  }, [remarcarNova, occupantsByDate, meRef.data?.id]);

  /** A loja permite troca direta entre colegas para a folga que está sendo cedida? */
  const trocaDiretaLiberada = useMemo(() => {
    if (!remarcarOpen) return false;
    const tipo = parseYMD(remarcarOpen).getDay() === 0 ? "dominical" : "semanal";
    return podeTrocarFolga(regrasConfig, tipo).permitida;
  }, [remarcarOpen, regrasConfig]);

  /** Meus dias de descanso no mês visto (folgas marcadas + folga semanal fixa). */
  const meusDescansosIso = useMemo(() => {
    const s = new Set<string>();
    const meuId = meRef.data?.id;
    if (!meuId) return s;
    for (const f of folgas) {
      if (f.colaborador_id === meuId && f.status !== "cancelada") s.add(f.data as string);
    }
    const fixos = diasFixosDeFolga({
      folga_fixa_semana: meRef.data?.folga_fixa_semana ?? null,
      folgas_fixas_dow: meusDiasFixosQuery.data ?? [],
    });
    if (fixos.length) {
      // A folga fixa vale em qualquer semana: cobre também as semanas vizinhas
      // ao mês aberto, senão a contagem de dias seguidos "vaza" para fora do mês.
      for (const d of eachDayOfInterval({
        start: addDays(range.startDate, -21),
        end: addDays(range.endDate, 21),
      })) {
        const iso = ymd(d);
        if (!fixos.includes(d.getDay())) continue;
        if (trabalhoExcepcionalQuery.data?.has(`${meuId}|${iso}`)) continue;
        s.add(iso);
      }
    }
    return s;
  }, [
    folgas,
    meRef.data,
    meusDiasFixosQuery.data,
    range.startDate,
    range.endDate,
    trabalhoExcepcionalQuery.data,
  ]);

  /** Risco de descanso semanal (DSR) na troca aberta no diálogo. */
  const riscoDsrTroca = useMemo(() => {
    if (!tradeOpen || !tradeMyDate) return null;
    const r = avaliarRiscoDsrTroca({
      descansoIso: meusDescansosIso,
      diaCedidoIso: tradeMyDate,
      diaNovoIso: tradeOpen.iso,
    });
    return r.risco ? avisoDsr(r.sequencia) : null;
  }, [tradeOpen, tradeMyDate, meusDescansosIso]);

  /** Troca pendente que envolve o dia aberto no diálogo. */
  const trocaPendenteDoDia = useMemo(() => {
    const iso = selectedDay?.iso;
    const meuId = meRef.data?.id;
    if (!iso || !meuId) return null;
    return (
      ((trocasPendentesQuery.data ?? []) as any[]).find(
        (t) =>
          (t.solicitante_id === meuId || t.destino_id === meuId) &&
          (t.data_original === iso || t.data_proposta === iso),
      ) ?? null
    );
  }, [selectedDay?.iso, meRef.data?.id, trocasPendentesQuery.data]);

  const cancelarTroca = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("dp_troca_cancelar_self", { p_id: id });
      if (error) throw new Error(mensagemErroTroca(error.message));
    },
    onSuccess: () => {
      toast.success("Pedido de troca cancelado.");
      setSelectedDay(null);
      qc.invalidateQueries({ queryKey: ["dp_trocas_pend_meu_cal"] });
      qc.invalidateQueries({ queryKey: ["dp_folgas_meu_cal"] });
    },
    onError: (e: any) =>
      notifyError(e, {
        surface: "Meu calendário",
        action: "cancelar a troca",
        fallback: "Erro ao cancelar a troca",
      }),
  });



  const remarcarFolga = useMutation({
    mutationFn: async () => {
      if (!remarcarOpen) throw new Error("Sem contexto");
      if (!remarcarNova) negarRegra("Escolha o novo dia da sua folga.");
      const { error } = await supabase.rpc("dp_folga_remarcar", {
        p_data_atual: remarcarOpen,
        p_data_nova: remarcarNova,
        p_motivo: remarcarMotivo.trim() || null,
      });
      if (error) {
        const raw = error.message ?? "";
        const msg = mensagemErroRemarcacao(raw);
        if (pedirAoDp(raw)) {
          setRemarcarAviso(msg);
          const aviso = new Error(msg);
          (aviso as any).avisoTratado = true;
          throw aviso;
        }
        throw new Error(msg);
      }
    },
    onSuccess: () => {
      toast.success("Folga mudada de dia. O setor de pessoal foi avisado.");
      setRemarcarOpen(null);
      setRemarcarNova("");
      setRemarcarMotivo("");
      setRemarcarAviso(null);
      setSelectedDay(null);
      qc.invalidateQueries({ queryKey: ["dp_folgas_meu_cal"] });
    },
    onError: (e: any) => {
      // Dia lotado/bloqueado não é erro: o aviso no diálogo já orienta a troca
      // com um colega ou o pedido ao gestor.
      if (e?.avisoTratado) return;
      notifyError(e, {
        surface: "Meu calendário",
        action: "mudar o dia da folga",
        fallback: "Não foi possível mudar o dia da folga",
      });
    },

  });

  const pedirRemarcacao = useMutation({
    mutationFn: async () => {
      if (!remarcarOpen) throw new Error("Sem contexto");
      if (!remarcarNova) negarRegra("Escolha o dia que você quer folgar.");
      const { error } = await supabase.rpc("dp_folga_remarcar_solicitar", {
        p_data_atual: remarcarOpen,
        p_data_nova: remarcarNova,
        p_motivo: remarcarMotivo.trim() || null,
      });
      if (error) {
        const raw = error.message ?? "";
        if (raw.includes("DUPLICATE_REQUEST"))
          negarRegra("Você já tem um pedido pendente para este dia.");
        throw new Error("Não foi possível enviar o pedido. Tente novamente.");
      }
    },
    onSuccess: () => {
      toast.success("Pedido de mudança enviado ao setor de pessoal.");
      setRemarcarOpen(null);
      setRemarcarNova("");
      setRemarcarMotivo("");
      setRemarcarAviso(null);
      setSelectedDay(null);
      qc.invalidateQueries({ queryKey: ["dp_solic_meu_cal"] });
    },
    onError: (e: any) =>
      notifyError(e, {
        surface: "Meu calendário",
        action: "pedir a mudança da folga",
        fallback: "Não foi possível enviar o pedido",
      }),
  });



  // -------- Dados do dia selecionado --------
  const dayInfo = useMemo(() => {
    if (!selectedDay) return null;
    const date = parseYMD(selectedDay.iso);
    const isWeekend = !!dayType(date);
    const occupants = occupantsByDate.get(selectedDay.iso) ?? [];
    const isMine = occupants.some((o) => o.colaboradorId === meRef.data?.id);

    // canTrade — tenho folga (agendada ou semanal fixa) em OUTRO dia para
    // oferecer e o dia não é meu nem passado
    const ofertaveis = [...minhasFolgasFuturas, ...minhasFixasFuturas].filter((f) => f.data !== selectedDay.iso);
    const canTrade = ofertaveis.length > 0 && !isMine && selectedDay.status !== "past";
    return { date, isWeekend, occupants, isMine, canTrade };
  }, [selectedDay, occupantsByDate, meRef.data?.id, minhasFolgasFuturas, minhasFixasFuturas]);

  /** A folga do dia selecionado foi definida pelo sistema no fechamento do período? */
  const minhaFolgaAutomatica = useMemo(() => {
    if (!selectedDay || !meRef.data?.id) return false;
    return folgas.some(
      (f) =>
        f.colaborador_id === meRef.data!.id &&
        f.data === selectedDay.iso &&
        f.status !== "cancelada" &&
        f.origem === "auto_fechamento_periodo",
    );
  }, [selectedDay, folgas, meRef.data?.id]);

  /**
   * Minha folga do mês visto que pode ser movida para o dia selecionado. Assim o
   * colaborador clica no dia que quer e já muda a folga, sem precisar abrir
   * primeiro o dia em que a folga está marcada.
   */
  const folgaParaMover = useMemo(() => {
    if (!selectedDay || !meRef.data?.id) return null;
    if (selectedDay.status === "past" || selectedDay.status === "mine") return null;
    const candidata = minhasFolgasFuturas.find(
      (f) => f.data !== selectedDay.iso && f.data.slice(0, 7) === selectedDay.iso.slice(0, 7),
    );
    return candidata ?? null;
  }, [selectedDay, meRef.data?.id, minhasFolgasFuturas]);

  /**
   * Exceção também vale em dia de meio de semana: é justamente nele que o
   * colaborador precisa pedir uma folga fora da regra.
   */
  const showExceptionBtn =
    selectedDay && !["past", "mine", "fixed", "pending", "swapped"].includes(selectedDay.status);

  return (
    <DpPage className="space-y-6 md:space-y-8">
      <Helmet>
        <title>Meu calendário — Portal DP</title>
      </Helmet>

      <DpPageHeader
        icon={CalendarDays}
        title="Meu Calendário"
        description="Escolha suas folgas de fim de semana."
        actions={
          <Button
            variant="outline"
            className="w-full rounded-full sm:w-auto"
            onClick={() => navigate("/dp/meu/trocas")}
          >
            <ArrowLeftRight className="size-4 mr-2" /> Minhas trocas
          </Button>
        }
      />

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">{resumoFolgas.texto}</p>
        <p className="text-xs text-muted-foreground">{resumoDomingos}</p>
        {avisoJanela && (
          <div
            className={cn(
              "flex items-start gap-2 rounded-xl border px-3 py-2 text-xs font-medium",
              janela.estado === "aberta"
                ? "border-emerald-200 bg-emerald-500/10 text-emerald-700"
                : "border-amber-200 bg-amber-500/10 text-amber-700",
            )}
          >
            <AlertCircle className="size-4 shrink-0" />
            <span>{avisoJanela}</span>
          </div>
        )}
      </div>

      {convocavel && (
        <MinhaDisponibilidadeCard
          colaboradorId={meRef.data?.id ?? null}
          ano={ano}
          mes={mes}
          onPrev={() => (mes === 1 ? (setAno(ano - 1), setMes(12)) : setMes(mes - 1))}
          onNext={() => (mes === 12 ? (setAno(ano + 1), setMes(1)) : setMes(mes + 1))}
        />
      )}



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
        <DialogContent className="max-w-md max-h-[90svh] overflow-y-auto overflow-x-hidden [&_button]:whitespace-normal [&_button]:h-auto [&_button]:min-h-9 [&_button]:py-2 [&_button]:break-words">

          <DialogHeader>
            <DialogTitle className="text-2xl font-black flex items-center gap-3">
              <CalendarDays className="size-6 text-primary" />
              {selectedDay && formatBR(parseYMD(selectedDay.iso))}
            </DialogTitle>
            <DialogDescription className="sr-only">Detalhes do dia selecionado</DialogDescription>
          </DialogHeader>

          {selectedDay && dayInfo && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-muted/50 p-4 text-sm min-w-0">
                <span className="font-bold">Status</span>
                <Badge variant="outline" className={cn("text-xs whitespace-normal text-right break-words max-w-full", STATUS_BADGE[selectedDay.status])}>
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
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-background p-3 text-sm min-w-0"
                      >
                        <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1 break-words">
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
                {folgaParaMover && (
                  <Button
                    variant="outline"
                    className="h-auto min-h-10 w-full whitespace-normal break-words px-3 py-2.5 text-center leading-snug"
                    onClick={() => {
                      setRemarcarOpen(folgaParaMover.data);
                      setRemarcarNova(selectedDay.iso);
                      setRemarcarMotivo("");
                      // Dia lotado ou bloqueado já abre pelo caminho do gestor,
                      // sem tentar uma mudança direta que seria recusada.
                      setRemarcarAviso(
                        MOTIVO_STATUS[selectedDay.status]
                          ? `${MOTIVO_STATUS[selectedDay.status]}. Você pode trocar com um colega que folga neste dia ou pedir a mudança ao gestor.`
                          : null,
                      );
                    }}
                  >
                    <CalendarClock className="mr-2 h-4 w-4 shrink-0" />
                    Trocar minha folga de {diaSemanaBR(folgaParaMover.data)} {formatBR(parseYMD(folgaParaMover.data))} por
                    este dia
                  </Button>
                )}
                {selectedDay.status === "mine" && minhaFolgaAutomatica && (
                  <p className="rounded-xl border border-sky-200 bg-sky-500/10 px-3 py-2 text-xs font-medium text-sky-700">
                    Folga definida automaticamente porque você não escolheu no período de marcação.
                  </p>
                )}
                {selectedDay.status === "mine" && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setRemarcarOpen(selectedDay.iso);
                      setRemarcarNova("");
                      setRemarcarMotivo("");
                      setRemarcarAviso(null);
                    }}
                  >
                    <CalendarClock className="mr-2 h-4 w-4" /> Mudar o dia da minha folga
                  </Button>
                )}
                {selectedDay.status === "mine" && (
                  <ConfirmarAcaoDialog
                    titulo="Remover esta folga?"
                    descricao="O dia volta a ficar livre e pode ser escolhido por outra pessoa da equipe."
                    confirmar="Remover folga"
                    cancelar="Manter"
                    onConfirm={() => removerFolga.mutate(selectedDay.iso)}
                    disabled={removerFolga.isPending}
                  >
                    <Button variant="destructive" disabled={removerFolga.isPending}>
                      {removerFolga.isPending ? "Removendo..." : "Remover folga"}
                    </Button>
                  </ConfirmarAcaoDialog>
                )}

                {selectedDay.status === "fixed" && (
                  <p className="text-xs text-muted-foreground">
                    Esta é sua folga semanal fixa. Para trocá-la, toque no dia em que deseja folgar: use "Trocar" ao
                    lado de um colega que folga nesse dia ou "Solicitar exceção ao gestor".
                  </p>
                )}
                {selectedDay.status === "blocked" && (
                  <div className="space-y-1 rounded-xl border border-destructive/25 bg-destructive/10 p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-destructive">
                      Dia bloqueado
                    </p>
                    {manualBlocked.get(selectedDay.iso)?.reason && (
                      <p className="text-xs font-semibold text-destructive break-words">
                        {manualBlocked.get(selectedDay.iso)!.reason}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Data bloqueada pelo setor de pessoal. Você pode pedir uma exceção abaixo.
                    </p>
                  </div>
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
                {selectedDay.status === "weekday" && (
                  <p className="text-xs text-muted-foreground">
                    Dia de trabalho. Você pode pedir uma troca com um colega que está de folga neste dia ou
                    solicitar uma exceção ao DP.
                  </p>
                )}
                {dayInfo.occupants.length === 0 && selectedDay.status !== "past" && (
                  <p className="text-xs text-muted-foreground">Nenhum colega da sua loja está de folga neste dia.</p>
                )}

                {trocaPendenteDoDia && (
                  <div className="space-y-2 rounded-xl border border-violet-200 bg-violet-500/10 p-3 text-xs text-violet-800">
                    <p className="font-semibold">
                      Troca em análise —{" "}
                      {trocaPendenteDoDia.status === "pendente_colega"
                        ? "aguardando a resposta do colega."
                        : "aguardando a aprovação do gestor."}
                    </p>
                    <p>
                      Sua folga de {descreverDia(trocaPendenteDoDia.data_original)} continua valendo
                      até a decisão.
                    </p>
                    {trocaPendenteDoDia.solicitante_id === meRef.data?.id && (
                      <ConfirmarAcaoDialog
                        titulo="Cancelar o pedido de troca?"
                        descricao="O pedido é encerrado e sua folga atual continua como está."
                        confirmar="Cancelar pedido"
                        cancelar="Manter pedido"
                        onConfirm={() => cancelarTroca.mutate(trocaPendenteDoDia.id)}
                        disabled={cancelarTroca.isPending}
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-auto min-h-9 w-full whitespace-normal break-words bg-background px-3 py-2 text-center leading-snug"
                          disabled={cancelarTroca.isPending}
                        >
                          {cancelarTroca.isPending ? "Cancelando..." : "Cancelar pedido de troca"}
                        </Button>
                      </ConfirmarAcaoDialog>
                    )}
                  </div>
                )}


                {showExceptionBtn && (
                  <Button
                    variant="outline"
                    className="border-amber-200 text-amber-700 hover:bg-amber-50"
                    onClick={() => {
                      setExceptionMotivo("");
                      setExcecaoModo(fixasParaExcecao.length > 0 ? "troca_semanal" : "extra");
                      setExcecaoDiaTrabalho("");
                      setExceptionOpen(true);
                    }}
                  >
                    <AlertCircle className="h-4 w-4 mr-2" /> Solicitar exceção ao gestor
                  </Button>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button
              variant="ghost"
              onClick={() => setSelectedDay(null)}
              className="text-sm font-medium text-muted-foreground hover:text-foreground min-h-10 w-full sm:w-auto"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog exceção */}
      <Dialog open={exceptionOpen} onOpenChange={(o) => !o && setExceptionOpen(false)}>
        <DialogContent className="max-w-md max-h-[90svh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black flex items-center gap-3">
              <AlertCircle className="size-6 text-amber-500" />
              Solicitar exceção ao gestor
            </DialogTitle>
            <DialogDescription>
              Peça ao gestor para folgar em {selectedDay && descreverDia(selectedDay.iso)}. O pedido só vale depois da
              aprovação.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Tipo de pedido</Label>
              <Select
                value={excecaoModo}
                onValueChange={(v) => {
                  setExcecaoModo(v as "extra" | "troca_semanal");
                  setExcecaoDiaTrabalho("");
                }}
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="troca_semanal" disabled={fixasParaExcecao.length === 0}>
                    Troca da folga semanal
                  </SelectItem>
                  <SelectItem value="extra">Folga extra</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {excecaoModo === "troca_semanal"
                  ? "Você trabalha em um dia da sua folga semanal e folga neste dia no lugar dele."
                  : "Um dia de folga a mais, sem mudar sua folga semanal."}
              </p>
            </div>
            {excecaoModo === "troca_semanal" && (
              <div>
                <Label>Dia da folga semanal que você vai trabalhar</Label>
                <Select value={excecaoDiaTrabalho} onValueChange={setExcecaoDiaTrabalho}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Escolha o dia" />
                  </SelectTrigger>
                  <SelectContent>
                    {fixasParaExcecao.map((f) => (
                      <SelectItem key={f.id} value={f.data}>
                        {descreverDia(f.data)} — sua folga semanal
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {excecaoDiaTrabalho && selectedDay && (
                  <p className="mt-2 rounded-xl border border-sky-200 bg-sky-500/10 px-3 py-2 text-xs font-medium text-sky-700">
                    Você pede para trabalhar em {descreverDia(excecaoDiaTrabalho)} (sua folga semanal) e folgar em{" "}
                    {descreverDia(selectedDay.iso)} no lugar dele.
                  </p>
                )}
              </div>
            )}
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
        <DialogContent className="max-w-md max-h-[90svh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black flex items-center gap-3">
              <ArrowLeftRight className="size-6 text-primary" />
              Solicitar troca
            </DialogTitle>
            <DialogDescription>
              Você passa a folgar em <b>{tradeOpen && descreverDia(tradeOpen.iso)}</b>, que hoje é a folga de{" "}
              <b>{tradeOpen?.occupantName}</b>, e cede uma folga sua em troca.
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
                  {folgasParaOferecer.map((f) => (
                    <SelectItem key={f.id} value={f.data}>
                      {descreverDia(f.data)}
                      {f.fixa ? " — sua folga semanal" : " — folga marcada"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {tradeMyDate && tradeOpen && (
                <p className="mt-2 rounded-xl border border-sky-200 bg-sky-500/10 px-3 py-2 text-xs font-medium text-sky-700">
                  Você trabalha em {descreverDia(tradeMyDate)} (a folga que você cede) e folga em{" "}
                  {descreverDia(tradeOpen.iso)} (a folga de {tradeOpen.occupantName}).
                </p>
              )}
              {tradeMyDate && tradeOpen && trocaExigeAprovacaoGestor(tradeMyDate, tradeOpen.iso) && (
                <p className="mt-2 rounded-xl border border-amber-200 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-800">
                  Esta troca envolve folga de fim de semana e dia de semana. Por mudar a escala de
                  descanso, depende da aprovação do gestor depois do aceite do colega.
                </p>
              )}
              {riscoDsrTroca && (
                <p className="mt-2 rounded-xl border border-red-200 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-700">
                  {riscoDsrTroca}
                </p>
              )}
              {folgasParaOferecer.length === 0 && (
                <p className="text-xs text-destructive mt-1">
                  Você não tem folga em outro dia para oferecer nesta troca.
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

      {/* Dialog mudança do dia da minha folga */}
      <Dialog open={!!remarcarOpen} onOpenChange={(o) => !o && setRemarcarOpen(null)}>
        <DialogContent className="max-w-md max-h-[90svh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black flex items-center gap-3">
              <CalendarClock className="size-6 text-primary" />
              Mudar o dia da folga
            </DialogTitle>
            <DialogDescription>
              Sua folga de <b>{remarcarOpen && descreverDia(remarcarOpen)}</b> passa para outro dia de descanso do mesmo
              mês. O setor de pessoal é avisado da mudança.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Novo dia</Label>
              <Select
                value={remarcarNova}
                onValueChange={(v) => {
                  setRemarcarNova(v);
                  setRemarcarAviso(null);
                }}
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Escolha o novo dia" />
                </SelectTrigger>
                <SelectContent>
                  {diasRemarcacao.map((d) => (
                    <SelectItem key={d.iso} value={d.iso}>
                      {descreverDia(d.iso)}
                      {d.disponivel ? "" : ` — ${d.motivo} (depende de aprovação do gestor)`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {diasRemarcacao.length === 0 && (
                <p className="text-xs text-destructive mt-1">
                  Não há outro dia de descanso disponível neste mês. Fale com o setor de pessoal.
                </p>
              )}
              {((diaRemarcacaoEscolhido && !diaRemarcacaoEscolhido.disponivel) || remarcarAviso) && (
                <div className="mt-2 space-y-2 rounded-xl border border-amber-200 bg-amber-500/10 p-3 text-xs text-amber-800">
                  <p className="font-semibold">{remarcarAviso ?? `${diaRemarcacaoEscolhido?.motivo}.`}</p>
                  {colegasNoDiaDesejado.length > 0 && trocaDiretaLiberada && (
                    <div className="space-y-2">
                      <p>
                        Antes de pedir ao gestor, tente a troca direta com quem folga em{" "}
                        <b>{descreverDia(remarcarNova)}</b>:
                      </p>
                      <div className="flex flex-col gap-2">
                        {colegasNoDiaDesejado.map((c) => (
                          <Button
                            key={c.colaboradorId}
                            variant="outline"
                            size="sm"
                            className="h-auto min-h-9 w-full whitespace-normal break-words bg-background px-3 py-2 text-center leading-snug"
                            onClick={() => {
                              setTradeOpen({
                                occupantId: c.colaboradorId,
                                occupantName: c.nome,
                                iso: remarcarNova,
                              });
                              setTradeMyDate(remarcarOpen ?? "");
                              setTradeMotivo("");
                              setRemarcarOpen(null);
                            }}
                          >
                            <ArrowLeftRight className="mr-2 h-4 w-4 shrink-0" />
                            Trocar com {c.nome.split(/\s+/)[0]}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                  <p>
                    A mudança para este dia depende da aprovação do gestor. Até a decisão, sua folga de{" "}
                    <b>{remarcarOpen && descreverDia(remarcarOpen)}</b> continua marcada.
                  </p>
                </div>
              )}
            </div>
            <div>
              <Label className="flex items-center gap-2">
                Motivo
                <span className="text-muted-foreground text-xs font-normal">(opcional)</span>
              </Label>
              <Textarea
                rows={3}
                className="rounded-xl"
                placeholder="Conte o motivo da mudança"
                value={remarcarMotivo}
                onChange={(e) => setRemarcarMotivo(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button
              variant="ghost"
              onClick={() => setRemarcarOpen(null)}
              className="min-h-10 w-full sm:w-auto"
            >
              Cancelar
            </Button>
            {diaRemarcacaoEscolhido && !diaRemarcacaoEscolhido.disponivel ? (
              <Button
                onClick={() => pedirRemarcacao.mutate()}
                disabled={pedirRemarcacao.isPending || !remarcarNova}
                className="min-h-10 w-full sm:w-auto"
              >
                {pedirRemarcacao.isPending ? "Enviando..." : "Pedir a mudança ao gestor"}
              </Button>
            ) : remarcarAviso ? (
              <Button
                onClick={() => pedirRemarcacao.mutate()}
                disabled={pedirRemarcacao.isPending || !remarcarNova}
                className="min-h-10 w-full sm:w-auto"
              >
                {pedirRemarcacao.isPending ? "Enviando..." : "Pedir a mudança ao gestor"}
              </Button>
            ) : (
              <Button
                onClick={() => remarcarFolga.mutate()}
                disabled={remarcarFolga.isPending || !remarcarNova}
                className="min-h-10 w-full sm:w-auto"
              >
                {remarcarFolga.isPending ? "Mudando..." : "Mudar a folga"}
              </Button>
            )}
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
    </DpPage>
  );
}
