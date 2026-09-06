import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CalendarDays, Clock, Eye, Loader2, Save, Send, Users } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MonthGridCalendar } from "@/components/dp/convocacoes/MonthGridCalendar";
import {
  DiasSelecionadosLista,
  type OrigemHorario,
} from "@/components/dp/convocacoes/DiasSelecionadosLista";
import { RevisaoConvocacao } from "@/components/dp/convocacoes/RevisaoConvocacao";
import { DiaSimulacaoInline } from "@/components/dp/convocacoes/DiaSimulacaoInline";
import { resolverHorarioDestinatario } from "@/lib/dp/convocacao-revisao";
import type { PessoaPanorama } from "@/lib/dp/operacao-panorama";


import { useDpUnidades, useDpCargos } from "@/hooks/useDpCadastros";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import {
  buscarNecessidadeSugerida,
  useDefinirDestinatarios,
  useDefinirOverrideDestinatario,
  useDpConvocacaoConfig,
  useDpConvocacaoDestinatarios,
  usePublicarConvocacao,
  useSalvarRascunhoConvocacao,
  type GrupoComOcorrencias,
} from "@/hooks/useDpConvocacaoGrupos";
import { useDpConvocacaoPreview } from "@/hooks/useDpConvocacaoPreview";
import {
  ANTECEDENCIA_REFERENCIA_DIAS,
  antecedenciaDias,
  cargaPrevistaHoras,
  coberturaDoDia,
  janelaMinutos,
  minimoDoCargoNaData,
  regimeConvocavel,
  viraNoDiaSeguinte,
} from "@/lib/dp/convocacoes-planejamento";
import { textoDoErroDePublicacao } from "@/lib/dp/convocacoes-motivos";
import { comCarimboAtual } from "@/lib/dp/convocacao-versao";
import { supabase } from "@/integrations/supabase/client";
import { useDpConvocacaoPreAvaliacao } from "@/hooks/useDpConvocacaoPreAvaliacao";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSalvo?: (grupoId: string) => void;
  /** Quando presente, edita o rascunho existente (nunca cria outro). */
  grupo?: GrupoComOcorrencias | null;
}

interface DiaPlanejado {
  id: string;
  cargo_id: string;
  data: string;
  entrada: string;
  saida: string;
  vira: boolean;
  vagas: number;
  /** Origem da janela: convocações anteriores, fixos do cargo, horário geral ou ajuste manual. */
  origem: OrigemHorario;
  /** Havia mais de um horário empatado na sugestão. */
  ambiguo: boolean;
  expected_updated_at: string | null;
}

interface SugestaoCache {
  entrada: string;
  saida: string;
  vira: boolean;
  origem: OrigemHorario;
  ambiguo: boolean;
}

interface HorarioOverride {
  entrada: string;
  saida: string;
  intervalo_minutos: number;
  vira: boolean;
}

const novoId = () => crypto.randomUUID();
const hhmm = (v: string | null | undefined) => (v ? v.slice(0, 5) : "");
const chave = (cargoId: string, data: string) => `${cargoId}|${data}`;
/** Virada de dia é obrigatória quando a saída é igual ou anterior à entrada. */
const normalizarVira = (entrada: string, saida: string, atual: boolean) =>
  viraNoDiaSeguinte(entrada, saida) ? true : atual;
const rotuloData = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "short", day: "2-digit", month: "2-digit",
  });

export function NovaConvocacaoPlanner({ open, onOpenChange, onSalvo, grupo = null }: Props) {
  const agora = new Date();
  const { selectedCompanyId } = useCompanyContext();

  const [grupoId, setGrupoId] = useState<string>(() => novoId());
  const [grupoExpected, setGrupoExpected] = useState<string | null>(null);
  const [unidadeId, setUnidadeId] = useState<string | null>(null);
  const [ano, setAno] = useState(agora.getFullYear());
  const [mes, setMes] = useState(agora.getMonth() + 1);
  const [cargoIds, setCargoIds] = useState<string[]>([]);
  const [cargoAtivo, setCargoAtivo] = useState<string | null>(null);
  const [destinatarios, setDestinatarios] = useState<string[]>([]);
  /** colaborador_id → nível de prioridade (1 recebe primeiro). */
  const [niveis, setNiveis] = useState<Record<string, number>>({});
  const [intervaloNiveisHoras, setIntervaloNiveisHoras] = useState<number | null>(null);

  const [titulo, setTitulo] = useState("");
  const [observacao, setObservacao] = useState("");
  const [usaHorarioGeral, setUsaHorarioGeral] = useState(false);
  const [horarioGeral, setHorarioGeral] = useState<HorarioOverride>({
    entrada: "18:00", saida: "23:00", intervalo_minutos: 0, vira: false,
  });
  const [dias, setDias] = useState<Record<string, DiaPlanejado>>({});
  const [removidas, setRemovidas] = useState<Record<string, string | null>>({});
  const [overrides, setOverrides] = useState<Record<string, HorarioOverride>>({});
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [justificativa, setJustificativa] = useState("");
  const [cienteAntecedencia, setCienteAntecedencia] = useState(false);
  const [revisando, setRevisando] = useState(false);
  /** Cache das sugestões por cargo|data — remarcar um dia não reconsulta. */
  const sugestoesRef = useRef<Map<string, SugestaoCache>>(new Map());

  const unidades = useDpUnidades();
  const cargos = useDpCargos();
  const colaboradores = useDpColaboradores();
  const config = useDpConvocacaoConfig(unidadeId);
  const destinatariosSalvos = useDpConvocacaoDestinatarios(grupo?.id ?? null);
  const { salvarGrupo, salvarOcorrencia, cancelarOcorrencia } = useSalvarRascunhoConvocacao();
  const definirDestinatarios = useDefinirDestinatarios();
  const definirOverride = useDefinirOverrideDestinatario();
  const publicar = usePublicarConvocacao();

  const competencia = `${ano}-${String(mes).padStart(2, "0")}`;
  const antecedenciaMinima = config.data?.antecedencia_minima_dias ?? ANTECEDENCIA_REFERENCIA_DIAS;
  const exigeJustificativa = config.data?.exige_justificativa_excecao !== false;

  // ------------------------------------------------------------ carregar / resetar
  useEffect(() => {
    if (!open) return;
    setDetalhe(null);
    setRevisando(false);
    setRemovidas({});
    setJustificativa("");
    setOverrides({});
    if (grupo) {
      const [a, m] = grupo.competencia.split("-").map(Number);
      setGrupoId(grupo.id);
      setGrupoExpected(grupo.updated_at ?? null);
      setUnidadeId(grupo.unidade_id);
      setAno(a);
      setMes(m);
      setTitulo(grupo.titulo ?? "");
      setObservacao(grupo.observacao ?? "");
      const cargosDoGrupo = Array.from(
        new Set(grupo.ocorrencias.map((o) => o.cargo_id).filter(Boolean) as string[]),
      );
      setCargoIds(cargosDoGrupo);
      setCargoAtivo(cargosDoGrupo[0] ?? null);
      const usaGeral = grupo.ocorrencias.some((o) => o.horario_modo === "horario_unico");
      setUsaHorarioGeral(usaGeral);
      const base = grupo.ocorrencias.find((o) => o.horario_modo === "horario_unico");
      if (base?.entrada && base?.saida) {
        setHorarioGeral({
          entrada: hhmm(base.entrada),
          saida: hhmm(base.saida),
          intervalo_minutos: base.intervalo_minutos ?? 0,
          vira: !!base.termina_no_dia_seguinte,
        });
      }
      setDias(
        Object.fromEntries(
          grupo.ocorrencias
            .filter((o) => !!o.cargo_id)
            .map((o) => [
              chave(o.cargo_id!, o.data),
              {
                id: o.id,
                cargo_id: o.cargo_id!,
                data: o.data,
                entrada: hhmm(o.necessidade_entrada),
                saida: hhmm(o.necessidade_saida),
                vira: !!o.necessidade_termina_no_dia_seguinte,
                vagas: o.vagas ?? 1,
                origem: "manual" as const,
                ambiguo: false,
                expected_updated_at: o.updated_at ?? null,
              },
            ]),
        ),
      );
      return;
    }
    setGrupoId(novoId());
    setGrupoExpected(null);
    setUnidadeId(null);
    setAno(agora.getFullYear());
    setMes(agora.getMonth() + 1);
    setCargoIds([]);
    setCargoAtivo(null);
    setDestinatarios([]);
    setNiveis({});
    setIntervaloNiveisHoras(null);

    setTitulo("");
    setObservacao("");
    setUsaHorarioGeral(false);
    setDias({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, grupo?.id]);

  useEffect(() => {
    if (!open || !grupo) return;
    if (destinatariosSalvos.data?.globais) setDestinatarios(destinatariosSalvos.data.globais);
    if (destinatariosSalvos.data?.niveis) setNiveis(destinatariosSalvos.data.niveis);
    setIntervaloNiveisHoras(grupo.intervalo_niveis_horas ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, grupo?.id, destinatariosSalvos.data]);


  const limites = useMemo(() => {
    const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    return { inicio: `${competencia}-01`, fim: `${competencia}-${String(ultimo).padStart(2, "0")}` };
  }, [ano, mes, competencia]);

  const preview = useDpConvocacaoPreview({ unidadeId, inicio: limites.inicio, fim: limites.fim });

  // ------------------------------------------------------------ pessoas convocáveis
  const convocaveis = useMemo(
    () =>
      (colaboradores.data ?? []).filter(
        (c: any) =>
          regimeConvocavel(c.regime) &&
          c.ativo !== false &&
          (!unidadeId || c.unidade_id === unidadeId) &&
          (cargoIds.length === 0 || (c.cargo_id && cargoIds.includes(c.cargo_id))),
      ),
    [colaboradores.data, unidadeId, cargoIds],
  );

  // Seleção nunca guarda quem deixou de ser elegível pelos filtros.
  useEffect(() => {
    const validos = new Set(convocaveis.map((c: any) => c.id));
    setDestinatarios((prev) => prev.filter((id) => validos.has(id)));
  }, [convocaveis]);

  const nomeCargo = (id: string | null) =>
    (cargos.data ?? []).find((c: any) => c.id === id)?.nome ?? "—";
  const nomePessoa = (id: string) =>
    (colaboradores.data ?? []).find((c: any) => c.id === id)?.nome ?? "—";

  const listaDias = useMemo(() => Object.values(dias), [dias]);
  const diasDoCargo = useMemo(
    () => listaDias.filter((d) => d.cargo_id === cargoAtivo),
    [listaDias, cargoAtivo],
  );
  const datasDoCargo = useMemo(() => new Set(diasDoCargo.map((d) => d.data)), [diasDoCargo]);

  const contagem = (data: string, cargoId: string) =>
    preview.contagemPorDataCargo.get(`${data}|${cargoId}`) ?? { confirmados: 0, aguardando: 0 };

  /** Necessidade real por cargo/dia: mínimo, confirmados e o que falta. */
  const cobertura = (data: string, cargoId: string) => {
    const { confirmados, aguardando } = contagem(data, cargoId);
    const minimo = minimoDoCargoNaData({
      regras: preview.regrasCobertura, data, unidadeId, cargoId,
    });
    return coberturaDoDia({ minimo, confirmados, aguardando });
  };

  const infoDias = useMemo(() => {
    const out: Record<string, any> = {};
    if (!cargoAtivo) return out;
    for (let d = new Date(`${limites.inicio}T12:00:00`); d <= new Date(`${limites.fim}T12:00:00`); d.setDate(d.getDate() + 1)) {
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const cob = cobertura(iso, cargoAtivo);
      const plan = dias[chave(cargoAtivo, iso)];
      const partes: string[] = [];
      if (cob.minimo != null) partes.push(`${cob.confirmados}/${cob.minimo}`);
      else if (cob.confirmados > 0) partes.push(`${cob.confirmados} conf.`);
      if (cob.aguardando > 0) partes.push(`+${cob.aguardando} aguard.`);
      if (plan) partes.push(`${plan.vagas} vaga${plan.vagas > 1 ? "s" : ""}`);
      out[iso] = {
        desabilitado: antecedenciaDias(iso) < 0,
        selo: partes.length ? partes.join(" · ") : null,
        tom: cob.faltam && cob.faltam > 0 ? "atencao" : plan ? "primario" : "neutro",
        titulo: [
          cob.minimo != null
            ? `${nomeCargo(cargoAtivo)} ${cob.confirmados}/${cob.minimo}${cob.faltam ? ` — faltam ${cob.faltam}` : ""}`
            : `${nomeCargo(cargoAtivo)} — ${cob.confirmados} confirmado(s)`,
          cob.aguardando > 0 ? `+${cob.aguardando} aguardando (não conta como confirmado)` : null,
          plan ? `Janela ${plan.entrada}–${plan.saida}${plan.vira ? " (+1)" : ""}` : null,
          antecedenciaDias(iso) < antecedenciaMinima
            ? `Abaixo da antecedência de ${antecedenciaMinima} dias — a publicação exigirá confirmação.`
            : null,
        ].filter(Boolean).join(" · "),
      };
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargoAtivo, limites, dias, preview.regrasCobertura, preview.contagemPorDataCargo, unidadeId, antecedenciaMinima]);

  const preAvaliacao = useDpConvocacaoPreAvaliacao(grupoId, revisando);
  const linhasPreAvaliacao = useMemo(
    () => preAvaliacao.data?.linhas ?? [],
    [preAvaliacao.data],
  );

  /** Dias em rascunho sem nenhuma pessoa apta — publicação fica bloqueada. */
  const diasSemApto = useMemo(() => {
    const porDia = new Map<string, boolean>();
    for (const l of linhasPreAvaliacao) {
      const k = `${l.cargo_id ?? ""}|${l.data}`;
      porDia.set(k, (porDia.get(k) ?? false) || l.apto);
    }
    return [...porDia.entries()].filter(([, temApto]) => !temApto).map(([k]) => k);
  }, [linhasPreAvaliacao]);

  const patchOverride = (k: string, p: Partial<HorarioOverride>) =>
    setOverrides((prev) => {
      const base = prev[k] ?? { entrada: "", saida: "", intervalo_minutos: 0, vira: false };
      const f = { ...base, ...p };
      return { ...prev, [k]: { ...f, vira: normalizarVira(f.entrada, f.saida, f.vira) } };
    });

  const patchHorarioGeral = (p: Partial<HorarioOverride>) =>
    setHorarioGeral((h) => {
      const f = { ...h, ...p };
      return { ...f, vira: normalizarVira(f.entrada, f.saida, f.vira) };
    });

  /**
   * Marcar o dia: sem horário geral, a janela vem dos fixos do mesmo cargo na
   * data (nunca inventada). Sem base cadastrada, o gestor informa manualmente.
   */
  const toggleDia = async (iso: string) => {
    if (!cargoAtivo || !selectedCompanyId) return;
    const k = chave(cargoAtivo, iso);
    if (dias[k]) {
      removerDia(k);
      return;
    }

    const cob = cobertura(iso, cargoAtivo);
    const vagas = Math.max(1, cob.faltam ?? 1);

    if (usaHorarioGeral) {
      setDias((prev) => ({
        ...prev,
        [k]: {
          id: novoId(), cargo_id: cargoAtivo, data: iso,
          entrada: horarioGeral.entrada, saida: horarioGeral.saida,
          vira: normalizarVira(horarioGeral.entrada, horarioGeral.saida, horarioGeral.vira),
          vagas, origem: "geral", ambiguo: false, expected_updated_at: null,
        },
      }));
      return;
    }

    const sug = await resolverSugestao(cargoAtivo, iso);

    setDias((prev) => ({
      ...prev,
      [k]: {
        id: novoId(), cargo_id: cargoAtivo, data: iso,
        entrada: sug?.entrada ?? "",
        saida: sug?.saida ?? "",
        vira: normalizarVira(sug?.entrada ?? "", sug?.saida ?? "", sug?.vira ?? false),
        vagas,
        origem: sug?.origem ?? "manual",
        ambiguo: sug?.ambiguo ?? false,
        expected_updated_at: null,
      },
    }));

    if (!sug?.entrada) {
      toast.warning(
        `Sem horário de referência em ${rotuloData(iso)}. Informe a janela na lista de datas.`,
      );
    }
  };

  /** Sugestão do horário padrão: histórico de convocações e, em seguida, equipe fixa. */
  const resolverSugestao = async (cargoId: string, iso: string): Promise<SugestaoCache | null> => {
    if (!selectedCompanyId) return null;
    const k = chave(cargoId, iso);
    const cache = sugestoesRef.current.get(k);
    if (cache) return cache;
    try {
      const sug = await buscarNecessidadeSugerida({
        company_id: selectedCompanyId, unidade_id: unidadeId, cargo_id: cargoId, data: iso,
      });
      if (!sug?.sugerido) return null;
      const resolvida: SugestaoCache = {
        entrada: hhmm(sug.sugerido.entrada),
        saida: hhmm(sug.sugerido.saida),
        vira: normalizarVira(
          hhmm(sug.sugerido.entrada),
          hhmm(sug.sugerido.saida),
          !!sug.sugerido.termina_no_dia_seguinte,
        ),
        origem: sug.fonte === "historico_convocacoes" ? "historico" : "sugerida",
        ambiguo: !!sug.ambiguo,
      };
      sugestoesRef.current.set(k, resolvida);
      return resolvida;
    } catch {
      /* prévia apenas: falha na sugestão não bloqueia o planejamento */
      return null;
    }
  };

  const removerDia = (k: string) => {
    const alvo = dias[k];
    if (!alvo) return;
    if (alvo.expected_updated_at !== null || grupo?.ocorrencias.some((o) => o.id === alvo.id)) {
      setRemovidas((r) => ({ ...r, [alvo.id]: alvo.expected_updated_at }));
    }
    setDias((prev) => {
      const next = { ...prev };
      delete next[k];
      return next;
    });
  };

  const patchDia = (k: string, p: Partial<DiaPlanejado>) =>
    setDias((prev) => {
      if (!prev[k]) return prev;
      const fundido = { ...prev[k], ...p, origem: "manual" as const, ambiguo: false };
      return { ...prev, [k]: { ...fundido, vira: normalizarVira(fundido.entrada, fundido.saida, fundido.vira) } };
    });

  /** Copia a janela de um dia para os demais dias do mesmo cargo. */
  const aplicarATodos = (k: string) => {
    const base = dias[k];
    if (!base?.entrada || !base?.saida) return;
    setDias((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([key, d]) =>
          d.cargo_id === base.cargo_id
            ? [key, { ...d, entrada: base.entrada, saida: base.saida,
                vira: normalizarVira(base.entrada, base.saida, base.vira),
                origem: "manual" as const, ambiguo: false }]
            : [key, d],
        ),
      ),
    );
    toast.success("Horário aplicado aos dias deste cargo.");
  };

  const diaCompleto = (d: DiaPlanejado) =>
    !!d.entrada && !!d.saida && d.vagas >= 1 &&
    !!janelaMinutos({ entrada: d.entrada, saida: d.saida, termina_no_dia_seguinte: d.vira });

  const diasCompletos = useMemo(() => listaDias.filter(diaCompleto), [listaDias]);
  const diasIncompletos = listaDias.length - diasCompletos.length;
  const foraDaAntecedencia = diasCompletos.filter((d) => antecedenciaDias(d.data) < antecedenciaMinima);

  const podeSalvar = !!unidadeId && cargoIds.length > 0 && destinatarios.length > 0 && diasCompletos.length > 0;

  /** Pessoas que receberiam a convocação num dia/cargo, com o horário já resolvido. */
  const convocadosDoDia = (cargoId: string, data: string): PessoaPanorama[] => {
    const out: PessoaPanorama[] = [];
    for (const id of destinatarios) {
      const c = (colaboradores.data ?? []).find((x: any) => x.id === id);
      if (c?.cargo_id && c.cargo_id !== cargoId) continue;
      const h = resolverHorarioDestinatario({
        override: overrides[`${cargoId}|${data}|${id}`],
        geral: usaHorarioGeral
          ? { ...horarioGeral, termina_no_dia_seguinte: horarioGeral.vira }
          : null,
        jornada: preview.jornadaDe(id, data),
      });
      if (!h) continue;
      out.push({
        colaborador_id: id,
        nome: c?.nome ?? "—",
        categoria: "convocado_pendente",
        turno_id: null,
        turno_nome: null,
        entrada: h.entrada,
        saida: h.saida,
        termina_no_dia_seguinte: h.termina_no_dia_seguinte,
        carga_prevista_horas: h.carga_prevista_horas,
        unidade_id: unidadeId,
        cargo_id: c?.cargo_id ?? null,
        cargo_nome: nomeCargo(c?.cargo_id ?? null),
        socio: false,
        origem: "convocacao",
      });
    }
    return out;
  };


  // ------------------------------------------------------------ gravação
  /**
   * `ajuste` permite gravar valores que acabaram de ser alterados na mesma
   * interação (o estado do React só chega no render seguinte).
   */
  const persistir = async (ajuste?: {
    dias?: Record<string, DiaPlanejado>;
    horarioGeral?: HorarioOverride;
    usaHorarioGeral?: boolean;
  }): Promise<string | null> => {
    const mapaDias = ajuste?.dias ?? dias;
    const diasParaGravar = Object.values(mapaDias).filter(diaCompleto);
    const hg = ajuste?.horarioGeral ?? horarioGeral;
    const usaHg = ajuste?.usaHorarioGeral ?? usaHorarioGeral;

    if (!unidadeId || cargoIds.length === 0 || destinatarios.length === 0 || diasParaGravar.length === 0) {
      toast.error("Informe unidade, cargos, destinatários e ao menos um dia completo.");
      return null;
    }

    const grupoRes: any = await salvarGrupo.mutateAsync({
      grupo_id: grupoId,
      unidade_id: unidadeId,
      competencia,
      modalidade: "aberta",
      titulo: titulo.trim() || null,
      observacao: observacao.trim() || null,
      expected_updated_at: grupoExpected,
    });
    let expected: string | null = grupoRes?.updated_at ?? null;
    setGrupoExpected(expected);

    for (const [id, carimbo] of Object.entries(removidas)) {
      await cancelarOcorrencia.mutateAsync({ ocorrencia_id: id, expected_updated_at: carimbo });
    }
    setRemovidas({});

    for (const d of diasParaGravar) {
      const res: any = await salvarOcorrencia.mutateAsync({
        ocorrencia_id: d.id,
        grupo_id: grupoId,
        cargo_id: d.cargo_id,
        data: d.data,
        necessidade_entrada: d.entrada,
        necessidade_saida: d.saida,
        necessidade_termina_no_dia_seguinte: d.vira,
        vagas: d.vagas,
        colaborador_alvo_id: null,
        expected_updated_at: d.expected_updated_at,
        ...(usaHg
          ? {
              horario_modo: "horario_unico" as const,
              entrada: hg.entrada,
              saida: hg.saida,
              intervalo_minutos: hg.intervalo_minutos,
              termina_no_dia_seguinte: hg.vira,
              carga_prevista_horas: cargaPrevistaHoras({
                entrada: hg.entrada,
                saida: hg.saida,
                intervalo_minutos: hg.intervalo_minutos,
                termina_no_dia_seguinte: hg.vira,
              }),
            }
          : {
              horario_modo: "jornada_individual" as const,
              entrada: null, saida: null, intervalo_minutos: null,
              termina_no_dia_seguinte: null, carga_prevista_horas: null,
            }),
      });
      setDias((prev) =>
        prev[chave(d.cargo_id, d.data)]
          ? {
              ...prev,
              [chave(d.cargo_id, d.data)]: {
                ...prev[chave(d.cargo_id, d.data)],
                expected_updated_at: res?.updated_at ?? null,
              },
            }
          : prev,
      );
      if (res?.grupo_updated_at) expected = res.grupo_updated_at;
    }

    // Público restrito: o backend só envia para estas pessoas.
    const dest: any = await definirDestinatarios.mutateAsync({
      grupo_id: grupoId,
      colaboradores: destinatarios,
      expected_updated_at: expected!,
      niveis: destinatarios.map((id) => ({ colaborador_id: id, nivel: niveis[id] ?? 1 })),
      intervalo_niveis_horas: destinatarios.length > 1 ? intervaloNiveisHoras : null,
    });

    expected = dest?.updated_at ?? expected;

    // Override de horário por pessoa/dia (precedência máxima).
    for (const [k, h] of Object.entries(overrides)) {
      const [cargoId, data, colaboradorId] = k.split("|");
      const dia = mapaDias[chave(cargoId, data)];
      if (!dia) continue;
      const res: any = await definirOverride.mutateAsync({
        ocorrencia_id: dia.id,
        colaborador_id: colaboradorId,
        entrada: h.entrada || null,
        saida: h.saida || null,
        intervalo_minutos: h.intervalo_minutos,
        termina_no_dia_seguinte: h.vira,
        expected_updated_at: expected!,
      });
      expected = res?.grupo_updated_at ?? expected;
    }

    return expected;
  };

  const salvarRascunho = async () => {
    setSalvando(true);
    try {
      const ok = await persistir();
      if (!ok) return;
      toast.success(
        `Rascunho salvo: ${diasCompletos.length} dia(s), ${destinatarios.length} destinatário(s).` +
          (diasIncompletos > 0 ? ` ${diasIncompletos} dia(s) sem horário.` : ""),
      );
      onSalvo?.(grupoId);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível salvar o rascunho.");
    } finally {
      setSalvando(false);
    }
  };

  const publicarGrupo = async () => {
    setPublicando(true);
    try {
      const expected = await persistir();
      if (!expected) return;
      const res = await publicar.mutateAsync({
        grupo_id: grupoId,
        expected_updated_at: expected,
        confirmacoes: foraDaAntecedencia.map((d) => ({
          ocorrencia_id: d.id,
          confirmado: true,
          justificativa: justificativa.trim() || null,
        })),
      });
      const diag = Array.isArray(res?.diagnostico) ? res.diagnostico : [];
      const faltando = diag.filter((x: any) => Number(x?.faltam_pessoas ?? 0) > 0).length;
      toast.success(
        res?.idempotente
          ? "Este grupo já estava publicado — nada foi duplicado."
          : `Convocação publicada: ${res?.ofertas ?? 0} oferta(s) enviada(s).` +
              (faltando > 0 ? ` ${faltando} dia(s) sem preencher todas as vagas.` : ""),
      );
      onSalvo?.(grupoId);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(textoDoErroDePublicacao(String(e?.message ?? "")));
    } finally {
      setPublicando(false);
    }
  };

  const diaDetalhe = detalhe ? dias[detalhe] : null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] max-w-5xl grid-cols-none grid-rows-none flex-col gap-0 overflow-hidden p-0 sm:h-[94dvh] sm:max-h-[94dvh]">
          <DialogHeader className="shrink-0 border-b border-border p-4">
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" />
              {grupo ? "Editar rascunho de convocação" : "Nova convocação"}
            </DialogTitle>
            <DialogDescription>
              Escolha unidade, cargos e quem receberá a convocação. O calendário mostra a
              necessidade real por cargo. Destinatários e vagas são coisas distintas: você pode
              convidar mais pessoas do que o número de vagas.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {revisando ? (
              <div className="p-4">
                <RevisaoConvocacao
                  unidadeId={unidadeId}
                  unidadeNome={(unidades.data ?? []).find((u: any) => u.id === unidadeId)?.nome ?? "—"}
                  competencia={competencia}
                  titulo={titulo.trim()}
                  observacao={observacao.trim()}
                  dias={diasCompletos.map((d) => {
                    const cob = cobertura(d.data, d.cargo_id);
                    return {
                      cargo_id: d.cargo_id,
                      cargo_nome: nomeCargo(d.cargo_id),
                      data: d.data,
                      entrada: d.entrada,
                      saida: d.saida,
                      vira: d.vira,
                      vagas: d.vagas,
                      minimo: cob.minimo ?? null,
                      confirmados: cob.confirmados,
                      aguardando: cob.aguardando,
                      faltam: cob.faltam ?? null,
                      abaixoDaAntecedencia: antecedenciaDias(d.data) < antecedenciaMinima,
                      antecedencia: antecedenciaDias(d.data),
                    };
                  })}
                  destinatarios={destinatarios.map((id) => {
                    const c = (colaboradores.data ?? []).find((x: any) => x.id === id);
                    return {
                      id,
                      nome: c?.nome ?? "—",
                      cargo_id: c?.cargo_id ?? null,
                      cargo_nome: nomeCargo(c?.cargo_id ?? null),
                    };
                  })}
                  overrides={overrides}
                  preAvaliacao={linhasPreAvaliacao}
                  preAvaliacaoCarregando={preAvaliacao.isLoading || preAvaliacao.isFetching}
                  onUsarHorarioParaTodos={async (entrada, saida, vira) => {
                    const novo: HorarioOverride = {
                      ...horarioGeral,
                      entrada, saida, vira: normalizarVira(entrada, saida, vira),
                    };
                    setUsaHorarioGeral(true);
                    setHorarioGeral(novo);
                    await persistir({ horarioGeral: novo, usaHorarioGeral: true });
                    await preAvaliacao.refetch();
                  }}
                  onAjustarNecessidade={async (cargoId, data, saida) => {
                    const k = chave(cargoId, data);
                    const atual = dias[k];
                    if (!atual) return;
                    const fundido: DiaPlanejado = {
                      ...atual, saida, origem: "manual", ambiguo: false,
                      vira: normalizarVira(atual.entrada, saida, atual.vira),
                    };
                    const novoMapa = { ...dias, [k]: fundido };
                    setDias(novoMapa);
                    await persistir({ dias: novoMapa });
                    await preAvaliacao.refetch();
                  }}
                  horarioGeral={usaHorarioGeral ? horarioGeral : null}
                  jornadaDe={preview.jornadaDe}
                  prazoRespostaDias={config.data?.prazo_resposta_dias_uteis ?? null}
                  justificativa={justificativa}
                  antecedenciaMinima={antecedenciaMinima}
                  exigeJustificativa={exigeJustificativa}
                  onJustificativaChange={setJustificativa}
                  ciente={cienteAntecedencia}
                  onCienteChange={setCienteAntecedencia}
                />
              </div>
            ) : (
            <div className="space-y-4 p-4">

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Unidade *</Label>
                  <Select value={unidadeId ?? ""} onValueChange={setUnidadeId} disabled={!!grupo}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {(unidades.data ?? []).map((u: any) => (
                        <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Mês *</Label>
                  <div className="flex gap-2">
                    <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                          <SelectItem key={m} value={String(m)}>
                            {new Date(2000, m - 1, 1).toLocaleDateString("pt-BR", { month: "long" })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      className="w-24"
                      inputMode="numeric"
                      value={String(ano)}
                      onChange={(e) => {
                        const v = Number(e.target.value.replace(/\D/g, ""));
                        if (String(v).length === 4) setAno(v);
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Título (opcional)</Label>
                  <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Fim de semana do evento" />
                </div>
              </div>

              {/* ------------------------------------------------ cargos */}
              <div className="space-y-2">
                <Label>Cargos *</Label>
                <div className="flex flex-wrap gap-2">
                  {(cargos.data ?? []).map((c: any) => {
                    const marcado = cargoIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setCargoIds((prev) => {
                            const next = marcado ? prev.filter((x) => x !== c.id) : [...prev, c.id];
                            setCargoAtivo(next.includes(cargoAtivo ?? "") ? cargoAtivo : next[0] ?? null);
                            return next;
                          });
                          if (marcado) {
                            setDias((prev) =>
                              Object.fromEntries(
                                Object.entries(prev).filter(([, d]) => d.cargo_id !== c.id),
                              ),
                            );
                          }
                        }}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs transition-colors",
                          marcado ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted/50",
                        )}
                      >
                        {c.nome}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ------------------------------------------------ destinatários */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" /> Colaboradores a convocar *
                  </Label>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {destinatarios.length} selecionado(s)
                    </Badge>
                    <Button
                      type="button" size="sm" variant="ghost"
                      onClick={() => setDestinatarios(convocaveis.map((c: any) => c.id))}
                      disabled={!convocaveis.length}
                    >
                      Selecionar todos
                    </Button>
                  </div>
                </div>
                {!unidadeId ? (
                  <p className="text-xs text-muted-foreground">Escolha a unidade para listar as pessoas.</p>
                ) : convocaveis.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nenhum intermitente ou freelancer ativo nesta unidade com os cargos escolhidos.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-1.5 rounded-lg border border-border p-2 md:grid-cols-2">
                    {convocaveis.map((c: any) => {
                      const marcado = destinatarios.includes(c.id);
                      return (
                        <label key={c.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted/50">
                          <Checkbox
                            checked={marcado}
                            onCheckedChange={(v) =>
                              setDestinatarios((prev) =>
                                v === true ? [...prev, c.id] : prev.filter((x) => x !== c.id),
                              )
                            }
                          />
                          <span className="flex-1 truncate">{c.nome}</span>
                          <span className="text-[10px] text-muted-foreground">{nomeCargo(c.cargo_id)}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {/* -------------------------------------------- prioridade */}
                {destinatarios.length > 1 && (
                  <div className="space-y-2 rounded-lg border border-border p-2.5">
                    <Label className="text-xs">Ordem de preferência (opcional)</Label>
                    <p className="text-[11px] text-muted-foreground">
                      Nível 1 recebe primeiro. Depois do intervalo abaixo, o nível seguinte
                      também passa a ver a convocação — os anteriores continuam valendo.
                    </p>
                    <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
                      {destinatarios.map((id) => (
                        <div key={id} className="flex items-center gap-2 text-xs">
                          <span className="flex-1 truncate">{nomePessoa(id)}</span>
                          <Select
                            value={String(niveis[id] ?? 1)}
                            onValueChange={(v) => setNiveis((p) => ({ ...p, [id]: Number(v) }))}
                          >
                            <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {[1, 2, 3, 4, 5].map((n) => (
                                <SelectItem key={n} value={String(n)}>Nível {n}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Label className="text-[11px]">Intervalo entre níveis (horas)</Label>
                      <Input
                        className="h-8 w-24"
                        inputMode="numeric"
                        placeholder="ex: 12"
                        value={intervaloNiveisHoras == null ? "" : String(intervaloNiveisHoras)}
                        onChange={(e) => {
                          const n = Number(e.target.value.replace(/\D/g, ""));
                          setIntervaloNiveisHoras(n > 0 ? Math.min(168, n) : null);
                        }}
                      />
                      <span className="text-[11px] text-muted-foreground">
                        Em branco, todos recebem ao mesmo tempo.
                      </span>
                    </div>
                  </div>
                )}
              </div>


              {/* ------------------------------------------------ horário padrão */}
              <div className="space-y-2 rounded-xl border border-border p-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Checkbox
                    checked={usaHorarioGeral}
                    onCheckedChange={(v) => setUsaHorarioGeral(v === true)}
                  />
                  <Clock className="h-3.5 w-3.5" /> Horário padrão da convocação (opcional)
                </label>
                <p className="text-[11px] text-muted-foreground">
                  Em branco, cada pessoa recebe a própria jornada cadastrada. Preenchido, este
                  horário vale para todos — e ainda pode ser ajustado pessoa a pessoa no dia.
                </p>
                {usaHorarioGeral && (
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                    <div className="space-y-1">
                      <Label className="text-[11px]">Entrada</Label>
                      <Input type="time" value={horarioGeral.entrada}
                        onChange={(e) => patchHorarioGeral({ entrada: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Saída</Label>
                      <Input type="time" value={horarioGeral.saida}
                        onChange={(e) => patchHorarioGeral({ saida: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Intervalo (min)</Label>
                      <Input inputMode="numeric" value={String(horarioGeral.intervalo_minutos)}
                        onChange={(e) =>
                          setHorarioGeral((h) => ({
                            ...h, intervalo_minutos: Number(e.target.value.replace(/\D/g, "") || 0),
                          }))
                        } />
                    </div>
                    <label className="flex items-end gap-2 pb-2 text-xs">
                      <Checkbox
                        checked={horarioGeral.vira}
                        disabled={viraNoDiaSeguinte(horarioGeral.entrada, horarioGeral.saida)}
                        onCheckedChange={(v) => patchHorarioGeral({ vira: v === true })}
                      />
                      Termina no dia seguinte
                      {viraNoDiaSeguinte(horarioGeral.entrada, horarioGeral.saida) && (
                        <span className="text-muted-foreground">(a saída é no dia seguinte)</span>
                      )}
                    </label>
                  </div>
                )}
              </div>

              {/* ------------------------------------------------ calendário */}
              {cargoIds.length === 0 ? (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Escolha ao menos um cargo para ver o calendário com a necessidade real.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {cargoIds.map((id) => {
                      const qtd = listaDias.filter((d) => d.cargo_id === id).length;
                      return (
                        <Button
                          key={id} type="button" size="sm"
                          variant={cargoAtivo === id ? "default" : "outline"}
                          onClick={() => setCargoAtivo(id)}
                        >
                          {nomeCargo(id)}
                          {qtd > 0 && <span className="ml-1 opacity-80">· {qtd}</span>}
                        </Button>
                      );
                    })}
                  </div>

                  <MonthGridCalendar
                    ano={ano}
                    mes={mes}
                    onMesChange={(a, m) => { setAno(a); setMes(m); }}
                    selecionados={datasDoCargo}
                    onToggleDia={(iso) => void toggleDia(iso)}
                    info={infoDias}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Cada selo mostra confirmados/mínimo do cargo e quem ainda está aguardando —
                    pendente nunca conta como confirmado. Marque os dias e ajuste o horário
                    direto na lista abaixo, já preenchida com o horário padrão do cargo.
                  </p>

                  <DiasSelecionadosLista
                    itens={[...diasDoCargo]
                      .sort((a, b) => a.data.localeCompare(b.data))
                      .map((d) => ({
                        chave: chave(d.cargo_id, d.data),
                        data: d.data,
                        entrada: d.entrada,
                        saida: d.saida,
                        vira: d.vira,
                        vagas: d.vagas,
                        origem: d.origem,
                        ambiguo: d.ambiguo,
                        faltam: cobertura(d.data, d.cargo_id).faltam ?? null,
                      }))}
                    onPatch={patchDia}
                    onRemover={removerDia}
                    onAbrirIndividuais={setDetalhe}
                    onAplicarATodos={aplicarATodos}
                    renderSimulacao={(item) => (
                      <DiaSimulacaoInline
                        competencia={competencia}
                        unidadeId={unidadeId}
                        data={item.data}
                        vagas={item.vagas}
                        convocados={convocadosDoDia(cargoAtivo ?? "", item.data)}
                      />
                    )}
                  />

                </div>
              )}

              <div className="space-y-2">
                <Label>Observação (opcional)</Label>
                <Textarea rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
              </div>

              {foraDaAntecedencia.length > 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="space-y-2 text-xs">
                    <p>
                      {foraDaAntecedencia.length} dia(s) abaixo da antecedência mínima de{" "}
                      {antecedenciaMinima} dias. A publicação segue permitida, com registro da
                      exceção{exigeJustificativa ? " e justificativa obrigatória" : ""}.
                    </p>
                    <Textarea
                      rows={2}
                      placeholder="Justificativa da exceção"
                      value={justificativa}
                      onChange={(e) => setJustificativa(e.target.value)}
                    />
                  </AlertDescription>
                </Alert>
              )}

              {diasIncompletos > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    {diasIncompletos} dia(s) ainda sem janela de horário — informe no detalhe do dia
                    para que possam ser gravados.
                  </AlertDescription>
                </Alert>
              )}
            </div>
            )}
          </div>

          <DialogFooter className="shrink-0 flex-row items-center justify-between gap-2 border-t border-border p-3">
            <span className="text-[11px] text-muted-foreground">
              {diasCompletos.length} dia(s) · {destinatarios.length} destinatário(s)
            </span>
            <div className="flex gap-2">
              {revisando ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => setRevisando(false)} disabled={publicando}>
                    Voltar e ajustar
                  </Button>
                  <Button
                    size="sm"
                    onClick={publicarGrupo}
                    disabled={!podeSalvar || publicando || salvando ||
                      preAvaliacao.isLoading || diasSemApto.length > 0 ||
                      (foraDaAntecedencia.length > 0 &&
                        (!cienteAntecedencia || (exigeJustificativa && !justificativa.trim())))}
                  >
                    {publicando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
                    Confirmar e publicar
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" size="sm" onClick={salvarRascunho} disabled={!podeSalvar || salvando || publicando}>
                    {salvando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
                    Salvar rascunho
                  </Button>
                  <Button
                    size="sm"
                    onClick={async () => {
                      if (!podeSalvar) {
                        toast.error("Informe unidade, cargos, destinatários e ao menos um dia completo.");
                        return;
                      }
                      setSalvando(true);
                      try {
                        await persistir();
                        setRevisando(true);
                      } catch (e: any) {
                        toast.error(e?.message ?? "Não foi possível preparar a revisão.");
                      } finally {
                        setSalvando(false);
                      }
                    }}
                    disabled={salvando || publicando}
                  >
                    <Eye className="mr-1 h-4 w-4" />
                    Revisar e publicar
                  </Button>
                </>
              )}
            </div>
          </DialogFooter>

        </DialogContent>
      </Dialog>

      {/* ---------------------------------------------------------- detalhe do dia */}
      <Sheet open={!!diaDetalhe} onOpenChange={(v) => !v && setDetalhe(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          {diaDetalhe && (
            <>
              <SheetHeader>
                <SheetTitle>{rotuloData(diaDetalhe.data)} · {nomeCargo(diaDetalhe.cargo_id)}</SheetTitle>
                <SheetDescription>
                  Horário individual das pessoas neste dia. A janela e as vagas são editadas
                  na lista de datas.
                </SheetDescription>
              </SheetHeader>

              <div className="mt-4 space-y-4">
                <div className="rounded-lg border border-border px-2 py-2 text-xs text-muted-foreground">
                  {diaDetalhe.entrada && diaDetalhe.saida
                    ? `Janela ${diaDetalhe.entrada}–${diaDetalhe.saida}${diaDetalhe.vira ? " (+1)" : ""} · ${diaDetalhe.vagas} vaga(s)`
                    : `Sem janela definida · ${diaDetalhe.vagas} vaga(s)`}
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Horário individual (opcional)</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Preenchido, vale acima do horário padrão e da jornada cadastrada da pessoa.
                  </p>
                  <div className="max-h-64 space-y-2 overflow-y-auto">
                    {destinatarios.length === 0 && (
                      <p className="text-[11px] text-muted-foreground">Nenhum destinatário selecionado.</p>
                    )}
                    {destinatarios.map((id) => {
                      const k = `${diaDetalhe.cargo_id}|${diaDetalhe.data}|${id}`;
                      const ov = overrides[k];
                      return (
                        <div key={id} className="rounded-lg border border-border p-2">
                          <div className="mb-1 truncate text-xs font-medium">{nomePessoa(id)}</div>
                          <div className="grid grid-cols-3 gap-1.5">
                            <Input type="time" value={ov?.entrada ?? ""}
                              onChange={(e) => patchOverride(k, { entrada: e.target.value })} />
                            <Input type="time" value={ov?.saida ?? ""}
                              onChange={(e) => patchOverride(k, { saida: e.target.value })} />
                            <Input inputMode="numeric" placeholder="int." value={ov ? String(ov.intervalo_minutos) : ""}
                              onChange={(e) =>
                                patchOverride(k, {
                                  intervalo_minutos: Number(e.target.value.replace(/\D/g, "") || 0),
                                })
                              } />
                          </div>
                          {ov && (ov.entrada || ov.saida) && (
                            <div className="mt-1 flex items-center justify-between">
                              <label className="flex items-center gap-1.5 text-[11px]">
                                <Checkbox checked={ov.vira}
                                  disabled={viraNoDiaSeguinte(ov.entrada, ov.saida)}
                                  onCheckedChange={(v) => patchOverride(k, { vira: v === true })} />
                                +1 dia
                              </label>
                              <Button size="sm" variant="ghost" className="h-6 text-[11px]"
                                onClick={() =>
                                  setOverrides((prev) => {
                                    const next = { ...prev };
                                    delete next[k];
                                    return next;
                                  })
                                }>
                                Limpar
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
