import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, ArrowRight, CalendarDays, Loader2, Save } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MonthGridCalendar } from "@/components/dp/convocacoes/MonthGridCalendar";
import { DiaDetalheSheet } from "@/components/dp/convocacoes/DiaDetalheSheet";
import { useDpUnidades, useDpCargos } from "@/hooks/useDpCadastros";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import {
  useSalvarRascunhoConvocacao,
  useDpConvocacaoConfig,
  type GrupoComOcorrencias,
} from "@/hooks/useDpConvocacaoGrupos";
import { useDpConvocacaoPreview } from "@/hooks/useDpConvocacaoPreview";
import {
  ANTECEDENCIA_REFERENCIA_DIAS,
  antecedenciaDias,
  avaliarGrupo,
  cargaPrevistaHoras,
  coberturaDoDia,
  competenciaDaData,
  dataDentroDoPeriodo,
  diagnosticarRemuneracao,
  grupoPersistivel,
  limitesDaCompetencia,
  minimoDoCargoNaData,
  ocorrenciaPersistivel,
  ocorrenciasIncompativeis,
  payloadHorario,
  periodoValido,
  regimeConvocavel,
  type HorarioModo,
  type ModalidadeConvocacao,
  type RascunhoOcorrencia,
} from "@/lib/dp/convocacoes-planejamento";
import { cn } from "@/lib/utils";

interface NovaConvocacaoWizardProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSalvo?: (grupoId: string) => void;
  /** Quando presente, o wizard edita o rascunho existente (nunca cria outro). */
  grupo?: GrupoComOcorrencias | null;
}

type Passo = 0 | 1 | 2 | 3 | 4;
const PASSOS = ["Grupo", "Cargos", "Datas", "Detalhes", "Revisar"];

const novoId = () => crypto.randomUUID();
const competenciaDe = (ano: number, mes: number) => `${ano}-${String(mes).padStart(2, "0")}`;
const hhmm = (v: string | null | undefined) => (v ? v.slice(0, 5) : null);

const ocorrenciaBase = (data: string, cargoId: string | null): RascunhoOcorrencia => ({
  id: novoId(),
  cargo_id: cargoId,
  data,
  necessidade_entrada: "18:00",
  necessidade_saida: "23:00",
  necessidade_termina_no_dia_seguinte: false,
  horario_modo: "horario_unico",
  entrada: "18:00",
  saida: "23:00",
  intervalo_minutos: 0,
  termina_no_dia_seguinte: false,
  vagas: 1,
  colaborador_alvo_id: null,
  expected_updated_at: null,
});

export function NovaConvocacaoWizard({
  open, onOpenChange, onSalvo, grupo = null,
}: NovaConvocacaoWizardProps) {
  const hoje = new Date();
  const [passo, setPasso] = useState<Passo>(0);
  const [grupoId, setGrupoId] = useState<string>(() => novoId());
  const [grupoExpected, setGrupoExpected] = useState<string | null>(null);
  const [unidadeId, setUnidadeId] = useState<string | null>(null);
  const [modalidade, setModalidade] = useState<ModalidadeConvocacao | null>(null);
  const [titulo, setTitulo] = useState("");
  const [observacao, setObservacao] = useState("");
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [periodo, setPeriodo] = useState(() => limitesDaCompetencia(competenciaDe(hoje.getFullYear(), hoje.getMonth() + 1)));
  const [cargoIds, setCargoIds] = useState<string[]>([]);
  const [cargoAtivo, setCargoAtivo] = useState<string | null>(null);
  const [ocorrencias, setOcorrencias] = useState<RascunhoOcorrencia[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [confirmarPublicacao, setConfirmarPublicacao] = useState(false);
  const [justificativas, setJustificativas] = useState<Record<string, string>>({});
  const [trocaCompetencia, setTrocaCompetencia] = useState<{ ano: number; mes: number } | null>(null);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  /** IDs já gravados no banco quando o rascunho foi aberto (id → updated_at). */
  const [persistidas, setPersistidas] = useState<Record<string, string | null>>({});
  /** Persistidas que o gestor retirou nesta edição — serão canceladas via RPC. */
  const [removidas, setRemovidas] = useState<Record<string, string | null>>({});

  const unidades = useDpUnidades();
  const cargos = useDpCargos();
  const colaboradores = useDpColaboradores();
  const config = useDpConvocacaoConfig(unidadeId);
  const { salvarGrupo, salvarOcorrencia, cancelarOcorrencia } = useSalvarRascunhoConvocacao();
  const publicar = usePublicarConvocacao();

  /**
   * Remoção consciente: o que só existia no cliente sai apenas do estado; o que
   * já estava gravado entra na fila de cancelamento (nunca DELETE físico).
   */
  const removerOcorrencias = (alvo: (o: RascunhoOcorrencia) => boolean) => {
    setOcorrencias((prev) => {
      const remover = prev.filter(alvo);
      if (remover.length) {
        setRemovidas((r) => {
          const next = { ...r };
          for (const o of remover) {
            if (o.id in persistidas) next[o.id] = persistidas[o.id] ?? null;
          }
          return next;
        });
      }
      return prev.filter((o) => !alvo(o));
    });
  };


  const competencia = competenciaDe(ano, mes);
  const antecedenciaMinima = config.data?.antecedencia_minima_dias ?? ANTECEDENCIA_REFERENCIA_DIAS;
  const exigeJustificativa = config.data?.exige_justificativa_excecao === true;

  // ------------------------------------------------------------- carregar / resetar
  useEffect(() => {
    if (!open) return;
    setPasso(0);
    setDetalheId(null);
    if (grupo) {
      const [a, m] = grupo.competencia.split("-").map(Number);
      setGrupoId(grupo.id);
      setGrupoExpected(grupo.updated_at ?? null);
      setUnidadeId(grupo.unidade_id);
      setModalidade((grupo.modalidade as ModalidadeConvocacao) ?? null);
      setTitulo(grupo.titulo ?? "");
      setObservacao(grupo.observacao ?? "");
      setAno(a);
      setMes(m);
      const datas = grupo.ocorrencias.map((o) => o.data).sort();
      const lim = limitesDaCompetencia(grupo.competencia);
      setPeriodo({
        inicio: datas[0] && datas[0] >= lim.inicio ? datas[0] : lim.inicio,
        fim: datas.at(-1) && datas.at(-1)! <= lim.fim ? datas.at(-1)! : lim.fim,
      });
      const cargosDoGrupo = Array.from(
        new Set(grupo.ocorrencias.map((o) => o.cargo_id).filter(Boolean) as string[]),
      );
      setCargoIds(cargosDoGrupo);
      setCargoAtivo(cargosDoGrupo[0] ?? null);
      setOcorrencias(
        grupo.ocorrencias.map((o) => ({
          id: o.id,
          cargo_id: o.cargo_id,
          data: o.data,
          necessidade_entrada: hhmm(o.necessidade_entrada),
          necessidade_saida: hhmm(o.necessidade_saida),
          necessidade_termina_no_dia_seguinte: !!o.necessidade_termina_no_dia_seguinte,
          horario_modo: (o.horario_modo as HorarioModo) ?? "horario_unico",
          entrada: hhmm(o.entrada),
          saida: hhmm(o.saida),
          intervalo_minutos: o.intervalo_minutos ?? 0,
          termina_no_dia_seguinte: !!o.termina_no_dia_seguinte,
          vagas: o.vagas ?? 1,
          colaborador_alvo_id: o.colaborador_alvo_id ?? null,
          expected_updated_at: o.updated_at ?? null,
        })),
      );
      return;
    }
    setGrupoId(novoId());
    setGrupoExpected(null);
    setUnidadeId(null);
    setModalidade(null);
    setTitulo("");
    setObservacao("");
    setAno(hoje.getFullYear());
    setMes(hoje.getMonth() + 1);
    setPeriodo(limitesDaCompetencia(competenciaDe(hoje.getFullYear(), hoje.getMonth() + 1)));
    setCargoIds([]);
    setCargoAtivo(null);
    setOcorrencias([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, grupo?.id]);

  // ------------------------------------------------------------- dados reais da prévia
  const preview = useDpConvocacaoPreview({
    unidadeId,
    inicio: periodo.inicio,
    fim: periodo.fim,
  });

  const convocaveis = useMemo(
    () =>
      (colaboradores.data ?? []).filter(
        (c: any) => regimeConvocavel(c.regime) && c.ativo !== false,
      ),
    [colaboradores.data],
  );

  const nomeCargo = (id: string | null) =>
    (cargos.data ?? []).find((c: any) => c.id === id)?.nome ?? "—";

  const ocorrenciasDoCargo = useMemo(
    () => ocorrencias.filter((o) => o.cargo_id === cargoAtivo),
    [ocorrencias, cargoAtivo],
  );

  const datasDoCargo = useMemo(
    () => new Set(ocorrenciasDoCargo.map((o) => o.data!).filter(Boolean)),
    [ocorrenciasDoCargo],
  );

  const contagem = (data: string, cargoId: string) =>
    preview.contagemPorDataCargo.get(`${data}|${cargoId}`) ?? { confirmados: 0, aguardando: 0 };

  /** Selos do calendário: mínimo do cargo, confirmados e pendentes separados. */
  const infoDias = useMemo(() => {
    const out: Record<string, { selo?: string | null; tom?: any; titulo?: string | null; desabilitado?: boolean }> = {};
    if (!cargoAtivo) return out;
    const lim = limitesDaCompetencia(competencia);
    for (let d = new Date(`${lim.inicio}T12:00:00`); d <= new Date(`${lim.fim}T12:00:00`); d.setDate(d.getDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      const fora = !dataDentroDoPeriodo(iso, competencia, periodo);
      const { confirmados, aguardando } = contagem(iso, cargoAtivo);
      const minimo = minimoDoCargoNaData({
        regras: preview.regrasCobertura,
        data: iso,
        unidadeId,
        cargoId: cargoAtivo,
      });
      const cob = coberturaDoDia({ minimo, confirmados, aguardando });
      const selecionada = datasDoCargo.has(iso);
      const oc = ocorrenciasDoCargo.find((o) => o.data === iso);

      const partes: string[] = [];
      if (cob.minimo != null) partes.push(`${cob.confirmados}/${cob.minimo}`);
      else if (cob.confirmados > 0) partes.push(`${cob.confirmados} conf.`);
      if (cob.aguardando > 0) partes.push(`+${cob.aguardando} aguard.`);
      if (selecionada && oc) partes.push(`${oc.vagas} vaga${oc.vagas > 1 ? "s" : ""}`);

      out[iso] = {
        desabilitado: fora,
        selo: partes.length ? partes.join(" · ") : null,
        tom:
          cob.faltam && cob.faltam > 0
            ? "atencao"
            : selecionada
              ? "primario"
              : "neutro",
        titulo: fora
          ? "Fora do período escolhido"
          : [
              cob.minimo != null
                ? `${nomeCargo(cargoAtivo)} ${cob.confirmados}/${cob.minimo}${cob.faltam ? ` — faltam ${cob.faltam}` : ""}`
                : `${nomeCargo(cargoAtivo)} — ${cob.confirmados} confirmados`,
              cob.aguardando > 0 ? `+${cob.aguardando} aguardando (não conta como confirmado)` : null,
              antecedenciaDias(iso) < antecedenciaMinima
                ? `Abaixo da antecedência de ${antecedenciaMinima} dias — a publicação exigirá confirmação consciente.`
                : null,
            ]
              .filter(Boolean)
              .join(" · "),
      };
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargoAtivo, competencia, periodo, datasDoCargo, ocorrenciasDoCargo, preview.regrasCobertura, preview.contagemPorDataCargo, unidadeId, antecedenciaMinima]);

  const toggleDia = (iso: string) => {
    if (!cargoAtivo) return;
    if (!dataDentroDoPeriodo(iso, competencia, periodo)) return;
    setOcorrencias((prev) => {
      const existe = prev.some((o) => o.data === iso && o.cargo_id === cargoAtivo);
      if (existe) return prev.filter((o) => !(o.data === iso && o.cargo_id === cargoAtivo));
      return [...prev, { ...ocorrenciaBase(iso, cargoAtivo), vagas: modalidade === "individual" ? 1 : 1 }];
    });
  };

  const patch = (id: string, p: Partial<RascunhoOcorrencia>) =>
    setOcorrencias((prev) => prev.map((o) => (o.id === id ? { ...o, ...p } : o)));

  const aplicarCompetencia = (novoAno: number, novoMes: number) => {
    const nova = competenciaDe(novoAno, novoMes);
    const incompativeis = ocorrenciasIncompativeis(ocorrencias, nova, limitesDaCompetencia(nova));
    if (incompativeis.length > 0) {
      setTrocaCompetencia({ ano: novoAno, mes: novoMes });
      return;
    }
    setAno(novoAno);
    setMes(novoMes);
    setPeriodo(limitesDaCompetencia(nova));
  };

  const confirmarTrocaCompetencia = () => {
    if (!trocaCompetencia) return;
    const nova = competenciaDe(trocaCompetencia.ano, trocaCompetencia.mes);
    const lim = limitesDaCompetencia(nova);
    setOcorrencias((prev) => prev.filter((o) => !!o.data && dataDentroDoPeriodo(o.data, nova, lim)));
    setAno(trocaCompetencia.ano);
    setMes(trocaCompetencia.mes);
    setPeriodo(lim);
    setTrocaCompetencia(null);
  };

  const limites = limitesDaCompetencia(competencia);
  const periodoOk = periodoValido(competencia, periodo);
  const grupoOk = grupoPersistivel({ unidade_id: unidadeId, competencia, modalidade }) && periodoOk;
  const ocorrenciasOk = ocorrencias.filter((o) => ocorrenciaPersistivel(o, modalidade));
  const ocorrenciasPendentes = ocorrencias.length - ocorrenciasOk.length;
  const foraDaCompetencia = ocorrenciasIncompativeis(ocorrencias, competencia, periodo);

  const foraDaAntecedencia = ocorrencias.filter(
    (o) => o.data && antecedenciaDias(o.data) < antecedenciaMinima,
  );

  const podeAvancar =
    passo === 0
      ? grupoOk
      : passo === 1
        ? cargoIds.length > 0
        : passo === 2
          ? ocorrencias.length > 0
          : passo === 3
            ? ocorrenciasOk.length > 0
            : false;

  // ------------------------------------------------------------- prévia real do grupo
  const previaGrupo = useMemo(() => {
    if (!unidadeId) return [];
    const entradas = ocorrenciasOk.map((o) => ({
      id: o.id,
      data: o.data!,
      cargo_id: o.cargo_id!,
      necessidade_entrada: o.necessidade_entrada!,
      necessidade_saida: o.necessidade_saida!,
      necessidade_termina_no_dia_seguinte: o.necessidade_termina_no_dia_seguinte,
      horario_modo: o.horario_modo,
      vagas: o.vagas,
    }));
    if (!entradas.length) return [];
    return avaliarGrupo({
      ocorrencias: entradas,
      colaboradores: convocaveis.map((c: any) => ({
        id: c.id,
        nome: c.nome,
        regime: c.regime,
        ativo: c.ativo,
        cargo_id: c.cargo_id,
        unidade_id: c.unidade_id,
        forma_pagamento: c.forma_pagamento,
        valor_hora: c.valor_hora,
        valor_diaria: c.valor_diaria ?? null,
      })),
      unidadeId,
      indisponiveisPorData: preview.indisponiveisPorData,
      alocadosPorData: preview.alocadosPorData,
      jornadaDe: preview.jornadaDe,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ocorrenciasOk, convocaveis, unidadeId, preview.indisponiveisPorData, preview.alocadosPorData, preview.jornadaDe]);

  // ------------------------------------------------------------- gravação
  const salvarRascunho = async () => {
    if (!grupoOk || !unidadeId || !modalidade) {
      toast.error("Informe unidade, competência, período e modalidade antes de salvar.");
      return;
    }
    if (!ocorrenciasOk.length) {
      toast.error("Nenhuma data está completa o suficiente para ser gravada.");
      return;
    }
    setSalvando(true);
    try {
      await salvarGrupo.mutateAsync({
        grupo_id: grupoId,
        unidade_id: unidadeId,
        competencia,
        modalidade,
        titulo: titulo.trim() || null,
        observacao: observacao.trim() || null,
        expected_updated_at: grupoExpected,
      });

      for (const o of ocorrenciasOk) {
        const horario = payloadHorario(o);
        await salvarOcorrencia.mutateAsync({
          ocorrencia_id: o.id,
          grupo_id: grupoId,
          cargo_id: o.cargo_id!,
          data: o.data!,
          necessidade_entrada: o.necessidade_entrada!,
          necessidade_saida: o.necessidade_saida!,
          necessidade_termina_no_dia_seguinte: o.necessidade_termina_no_dia_seguinte,
          vagas: o.vagas,
          colaborador_alvo_id: modalidade === "individual" ? o.colaborador_alvo_id : null,
          expected_updated_at: o.expected_updated_at ?? null,
          ...horario,
        });
      }

      toast.success(
        ocorrenciasPendentes > 0
          ? `Rascunho salvo com ${ocorrenciasOk.length} data(s). ${ocorrenciasPendentes} ainda incompleta(s).`
          : `Rascunho salvo com ${ocorrenciasOk.length} data(s).`,
      );
      onSalvo?.(grupoId);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível salvar o rascunho.");
    } finally {
      setSalvando(false);
    }
  };

  const ocorrenciaDetalhe = ocorrencias.find((o) => o.id === detalheId) ?? null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[92vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-border p-4">
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" />
              {grupo ? "Editar rascunho de convocação" : "Nova convocação"}
            </DialogTitle>
            <DialogDescription>
              Planejamento em rascunho. A publicação (envio às pessoas) entra na próxima etapa do módulo.
            </DialogDescription>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PASSOS.map((p, i) => (
                <Badge
                  key={p}
                  variant={i === passo ? "default" : "outline"}
                  className={cn("text-[10px]", i < passo && "opacity-70")}
                >
                  {i + 1}. {p}
                </Badge>
              ))}
            </div>
          </DialogHeader>

          <ScrollArea className="flex-1">
            <div className="space-y-4 p-4">
              {/* -------------------------------------------------- passo 0: grupo */}
              {passo === 0 && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Unidade *</Label>
                    <Select
                      value={unidadeId ?? ""}
                      onValueChange={(v) => setUnidadeId(v)}
                      disabled={!!grupo}
                    >
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {(unidades.data ?? []).map((u: any) => (
                          <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {grupo && (
                      <p className="text-[11px] text-muted-foreground">
                        A unidade do rascunho não muda depois de criado.
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Competência *</Label>
                    <div className="flex gap-2">
                      <Select value={String(mes)} onValueChange={(v) => aplicarCompetencia(ano, Number(v))}>
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
                          if (String(v).length === 4) aplicarCompetencia(v, mes);
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Período — início *</Label>
                    <Input
                      type="date"
                      min={limites.inicio}
                      max={limites.fim}
                      value={periodo.inicio}
                      onChange={(e) => setPeriodo((p) => ({ ...p, inicio: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Período — fim *</Label>
                    <Input
                      type="date"
                      min={limites.inicio}
                      max={limites.fim}
                      value={periodo.fim}
                      onChange={(e) => setPeriodo((p) => ({ ...p, fim: e.target.value }))}
                    />
                  </div>
                  {!periodoOk && (
                    <div className="md:col-span-2">
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription className="text-xs">
                          O período precisa ficar dentro da competência {competencia} (de{" "}
                          {limites.inicio} a {limites.fim}).
                        </AlertDescription>
                      </Alert>
                    </div>
                  )}

                  <div className="space-y-2 md:col-span-2">
                    <Label>Modalidade *</Label>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      {(
                        [
                          {
                            v: "individual" as ModalidadeConvocacao,
                            t: "Individual",
                            d: "Uma pessoa por data. Você escolhe quem recebe.",
                          },
                          {
                            v: "aberta" as ModalidadeConvocacao,
                            t: "Aberta",
                            d: "Vagas ofertadas ao grupo elegível; quem aceitar primeiro ocupa.",
                          },
                        ]
                      ).map((op) => (
                        <button
                          key={op.v}
                          type="button"
                          onClick={() => {
                            setModalidade(op.v);
                            setOcorrencias((prev) =>
                              prev.map((o) =>
                                op.v === "individual"
                                  ? { ...o, vagas: 1 }
                                  : { ...o, colaborador_alvo_id: null },
                              ),
                            );
                          }}
                          className={cn(
                            "rounded-xl border p-3 text-left transition-colors",
                            modalidade === op.v
                              ? "border-primary bg-primary/5"
                              : "border-border hover:bg-muted/50",
                          )}
                        >
                          <div className="text-sm font-semibold">{op.t}</div>
                          <div className="text-xs text-muted-foreground">{op.d}</div>
                        </button>
                      ))}
                    </div>
                    {modalidade === "aberta" && config.data?.permite_oferta_aberta === false && (
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          As regras atuais desta unidade não permitem oferta aberta. Ajuste na aba Regras.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Título (opcional)</Label>
                    <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Fim de semana do evento" />
                  </div>
                  <div className="space-y-2">
                    <Label>Observação (opcional)</Label>
                    <Textarea rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
                  </div>
                </div>
              )}

              {/* -------------------------------------------------- passo 1: cargos */}
              {passo === 1 && (
                <div className="space-y-3">
                  <div>
                    <Label>Cargos da convocação *</Label>
                    <p className="text-[11px] text-muted-foreground">
                      Cada cargo tem o próprio calendário, com datas e vagas independentes.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {(cargos.data ?? []).map((c: any) => {
                      const marcado = cargoIds.includes(c.id);
                      const usados = ocorrencias.filter((o) => o.cargo_id === c.id).length;
                      return (
                        <label
                          key={c.id}
                          className={cn(
                            "flex items-center justify-between gap-2 rounded-lg border p-3 text-sm",
                            marcado ? "border-primary bg-primary/5" : "border-border",
                          )}
                        >
                          <span className="flex items-center gap-2">
                            <Checkbox
                              checked={marcado}
                              onCheckedChange={(v) => {
                                const marcar = v === true;
                                setCargoIds((prev) => {
                                  const next = marcar
                                    ? [...prev, c.id]
                                    : prev.filter((x) => x !== c.id);
                                  setCargoAtivo(next[0] ?? null);
                                  return next;
                                });
                                if (!marcar) {
                                  setOcorrencias((prev) => prev.filter((o) => o.cargo_id !== c.id));
                                }
                              }}
                            />
                            {c.nome}
                          </span>
                          {usados > 0 && (
                            <Badge variant="outline" className="text-[10px]">{usados} data(s)</Badge>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* -------------------------------------------------- passo 2: calendário por cargo */}
              {passo === 2 && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {cargoIds.map((id) => {
                      const qtd = ocorrencias.filter((o) => o.cargo_id === id).length;
                      return (
                        <Button
                          key={id}
                          type="button"
                          size="sm"
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
                    selecionados={datasDoCargo}
                    onToggleDia={toggleDia}
                    info={infoDias}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Somente os dias do período ({periodo.inicio} a {periodo.fim}) podem ser
                    selecionados. Este calendário é exclusivo de Convocações — não aplica regras de
                    folga ou DSR. Pendentes aparecem separados e nunca contam como confirmados.
                  </p>

                  {ocorrenciasDoCargo.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-xs font-semibold">Dias escolhidos — {nomeCargo(cargoAtivo)}</div>
                      {[...ocorrenciasDoCargo]
                        .sort((a, b) => (a.data ?? "").localeCompare(b.data ?? ""))
                        .map((o) => (
                          <button
                            key={o.id}
                            type="button"
                            onClick={() => setDetalheId(o.id)}
                            className="flex w-full items-center justify-between rounded-lg border border-border px-2 py-1.5 text-xs hover:bg-muted/50"
                          >
                            <span className="font-medium">
                              {new Date(`${o.data}T12:00:00`).toLocaleDateString("pt-BR", {
                                weekday: "short", day: "2-digit", month: "2-digit",
                              })}
                            </span>
                            <span className="text-muted-foreground">
                              {o.vagas} vaga(s) · ver detalhe
                            </span>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              )}

              {/* -------------------------------------------------- passo 3: detalhes */}
              {passo === 3 && (
                <div className="space-y-3">
                  {ocorrencias.length === 0 && (
                    <p className="text-sm text-muted-foreground">Nenhuma data selecionada.</p>
                  )}
                  {[...ocorrencias]
                    .sort(
                      (a, b) =>
                        (a.cargo_id ?? "").localeCompare(b.cargo_id ?? "") ||
                        (a.data ?? "").localeCompare(b.data ?? ""),
                    )
                    .map((o) => {
                      const completo = ocorrenciaPersistivel(o, modalidade);
                      const carga =
                        o.horario_modo === "horario_unico" && o.entrada && o.saida
                          ? cargaPrevistaHoras({
                              entrada: o.entrada,
                              saida: o.saida,
                              intervalo_minutos: o.intervalo_minutos,
                              termina_no_dia_seguinte: o.termina_no_dia_seguinte,
                            })
                          : null;
                      return (
                        <div key={o.id} className="rounded-xl border border-border p-3">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <div className="text-sm font-semibold">
                              {nomeCargo(o.cargo_id)} ·{" "}
                              {o.data
                                ? new Date(`${o.data}T12:00:00`).toLocaleDateString("pt-BR", {
                                    weekday: "short",
                                    day: "2-digit",
                                    month: "2-digit",
                                  })
                                : "—"}
                            </div>
                            <Badge variant={completo ? "outline" : "destructive"} className="text-[10px]">
                              {completo ? "Pronta para gravar" : "Incompleta"}
                            </Badge>
                          </div>

                          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                            <div className="space-y-1">
                              <Label className="text-[11px]">Necessidade — início</Label>
                              <Input
                                type="time"
                                value={o.necessidade_entrada ?? ""}
                                onChange={(e) => patch(o.id, { necessidade_entrada: e.target.value })}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px]">Necessidade — fim</Label>
                              <Input
                                type="time"
                                value={o.necessidade_saida ?? ""}
                                onChange={(e) => patch(o.id, { necessidade_saida: e.target.value })}
                              />
                            </div>
                            <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
                              <Switch
                                checked={o.necessidade_termina_no_dia_seguinte}
                                onCheckedChange={(v) =>
                                  patch(o.id, { necessidade_termina_no_dia_seguinte: v })
                                }
                              />
                              <span className="text-[11px] leading-tight">
                                Necessidade termina no dia seguinte
                              </span>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px]">Vagas</Label>
                              <Input
                                inputMode="numeric"
                                value={String(o.vagas)}
                                disabled={modalidade === "individual"}
                                onChange={(e) =>
                                  patch(o.id, { vagas: Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1) })
                                }
                              />
                            </div>

                            <div className="space-y-1 md:col-span-2">
                              <Label className="text-[11px]">Horário ofertado</Label>
                              <Select
                                value={o.horario_modo}
                                onValueChange={(v: HorarioModo) => patch(o.id, { horario_modo: v })}
                              >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="horario_unico">Horário único</SelectItem>
                                  <SelectItem value="jornada_individual">Jornada de cada pessoa</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            {o.horario_modo === "horario_unico" && (
                              <>
                                <div className="space-y-1">
                                  <Label className="text-[11px]">Entrada</Label>
                                  <Input
                                    type="time"
                                    value={o.entrada ?? ""}
                                    onChange={(e) => patch(o.id, { entrada: e.target.value })}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-[11px]">Saída</Label>
                                  <Input
                                    type="time"
                                    value={o.saida ?? ""}
                                    onChange={(e) => patch(o.id, { saida: e.target.value })}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-[11px]">Intervalo (min)</Label>
                                  <Input
                                    inputMode="numeric"
                                    value={String(o.intervalo_minutos ?? 0)}
                                    onChange={(e) =>
                                      patch(o.id, {
                                        intervalo_minutos: Number(e.target.value.replace(/\D/g, "")) || 0,
                                      })
                                    }
                                  />
                                </div>
                                <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
                                  <Switch
                                    checked={o.termina_no_dia_seguinte}
                                    onCheckedChange={(v) => patch(o.id, { termina_no_dia_seguinte: v })}
                                  />
                                  <span className="text-[11px] leading-tight">
                                    Horário termina no dia seguinte
                                  </span>
                                </div>
                                <div className="space-y-1 rounded-md border bg-muted/30 p-2 text-[11px] text-muted-foreground">
                                  <div>Carga prevista</div>
                                  <div className="text-sm font-semibold text-foreground">
                                    {carga ? `${carga.toFixed(2)} h` : "—"}
                                  </div>
                                </div>
                              </>
                            )}

                            {modalidade === "individual" && (
                              <div className="space-y-1 md:col-span-4">
                                <Label className="text-[11px]">Quem será convocado *</Label>
                                <Select
                                  value={o.colaborador_alvo_id ?? ""}
                                  onValueChange={(v) => patch(o.id, { colaborador_alvo_id: v })}
                                >
                                  <SelectTrigger><SelectValue placeholder="Selecione a pessoa" /></SelectTrigger>
                                  <SelectContent>
                                    {convocaveis
                                      .filter((c: any) => !o.cargo_id || c.cargo_id === o.cargo_id)
                                      .map((c: any) => (
                                        <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                                      ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                          </div>

                          <div className="mt-2 flex justify-end gap-2">
                            <Button type="button" variant="ghost" size="sm" onClick={() => setDetalheId(o.id)}>
                              Detalhe do dia
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setOcorrencias((prev) => prev.filter((x) => x.id !== o.id))}
                            >
                              Remover data
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}

              {/* -------------------------------------------------- passo 4: revisar */}
              {passo === 4 && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-border p-3 text-sm">
                    <div className="font-semibold">Resumo</div>
                    <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                      <li>Unidade: {(unidades.data ?? []).find((u: any) => u.id === unidadeId)?.nome ?? "—"}</li>
                      <li>Competência: {competencia} · período {periodo.inicio} a {periodo.fim}</li>
                      <li>Modalidade: {modalidade === "individual" ? "Individual" : "Aberta"}</li>
                      <li>Cargos: {cargoIds.map((id) => nomeCargo(id)).join(", ") || "—"}</li>
                      <li>
                        Datas prontas: {ocorrenciasOk.length}
                        {ocorrenciasPendentes > 0 ? ` · incompletas: ${ocorrenciasPendentes}` : ""}
                      </li>
                    </ul>
                    <div className="mt-2 space-y-1">
                      {cargoIds.map((id) => {
                        const doCargo = ocorrenciasOk.filter((o) => o.cargo_id === id);
                        if (!doCargo.length) return null;
                        return (
                          <div key={id} className="text-xs">
                            <span className="font-medium">{nomeCargo(id)}:</span>{" "}
                            <span className="text-muted-foreground">
                              {doCargo
                                .sort((a, b) => (a.data ?? "").localeCompare(b.data ?? ""))
                                .map((o) => `${o.data?.slice(8)}/${o.data?.slice(5, 7)}: ${o.vagas} vaga(s)`)
                                .join(" · ")}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {foraDaCompetencia.length > 0 && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        {foraDaCompetencia.length} data(s) estão fora da competência/período —
                        remova-as antes de salvar.
                      </AlertDescription>
                    </Alert>
                  )}

                  {foraDaAntecedencia.length > 0 && (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        {foraDaAntecedencia.length} data(s) estão abaixo da antecedência de{" "}
                        {antecedenciaMinima} dias. Não bloqueia o rascunho: a publicação sempre pedirá
                        confirmação consciente
                        {exigeJustificativa
                          ? " e, pelas regras atuais, também justificativa registrada."
                          : ". Justificativa só será exigida se a regra “Exigir justificativa em exceção” estiver ligada."}
                      </AlertDescription>
                    </Alert>
                  )}

                  {modalidade === "aberta" && previaGrupo.length > 0 && (
                    <div className="rounded-xl border border-border p-3">
                      <div className="text-sm font-semibold">Prévia de elegibilidade</div>
                      <p className="mb-2 text-[11px] text-muted-foreground">
                        Considera cadastro, cargo, unidade, jornada da data, indisponibilidades,
                        escala, convocações em aberto e remuneração. Option A aplicada a todas as
                        ocorrências. A validação definitiva ocorre na publicação.
                      </p>
                      <div className="space-y-2">
                        {previaGrupo.map((p) => (
                          <div key={p.ocorrencia_id} className="rounded-lg border border-border/60 p-2">
                            <div className="text-xs font-medium">
                              {nomeCargo(p.cargo_id)} ·{" "}
                              {new Date(`${p.data}T12:00:00`).toLocaleDateString("pt-BR", {
                                day: "2-digit", month: "2-digit",
                              })}{" "}
                              · {p.reservados.length} elegível(is) para {p.vagas} vaga(s)
                            </div>
                            <div className="mt-1 space-y-1">
                              {p.candidatos.slice(0, 6).map((c) => (
                                <div
                                  key={c.colaborador_id}
                                  className="flex flex-wrap items-center justify-between gap-2 text-[11px]"
                                >
                                  <span className="font-medium">{c.nome}</span>
                                  {c.elegivel ? (
                                    <Badge variant="outline" className="text-[10px]">Elegível</Badge>
                                  ) : (
                                    <span className="text-muted-foreground">{c.motivos[0]}</span>
                                  )}
                                </div>
                              ))}
                              {p.reservados_em_outra.map((r) => (
                                <div key={r.colaborador_id} className="text-[11px] text-amber-600 dark:text-amber-400">
                                  {r.nome} — já reservado em outra necessidade do mesmo dia (Option A).
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                        {convocaveis.length === 0 && (
                          <p className="text-xs text-muted-foreground">
                            Nenhuma pessoa com vínculo intermitente ou freelancer cadastrada.
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {modalidade === "individual" && (
                    <div className="rounded-xl border border-border p-3">
                      <div className="text-sm font-semibold">Conferência da remuneração</div>
                      <div className="mt-1 space-y-1">
                        {ocorrenciasOk.map((o) => {
                          const pessoa: any = convocaveis.find((c: any) => c.id === o.colaborador_alvo_id);
                          const diag = diagnosticarRemuneracao({
                            nome: pessoa?.nome,
                            regime: pessoa?.regime,
                            forma_pagamento: pessoa?.forma_pagamento,
                            valor_hora: pessoa?.valor_hora,
                            valor_diaria: pessoa?.valor_diaria ?? null,
                          });
                          return (
                            <div key={o.id} className="text-xs">
                              <span className="font-medium">{nomeCargo(o.cargo_id)} · {o.data}</span>{" "}
                              {diag.elegivel ? (
                                <span className="text-muted-foreground">
                                  {pessoa?.nome} — {diag.unidade === "diaria" ? "diária" : "hora"} de{" "}
                                  {diag.valor_unitario?.toLocaleString("pt-BR", {
                                    style: "currency",
                                    currency: "BRL",
                                  })}
                                </span>
                              ) : (
                                <span className="text-destructive">{diag.mensagem}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>

          <DialogFooter className="flex-row items-center justify-between gap-2 border-t border-border p-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={passo === 0}
              onClick={() => setPasso((p) => (p - 1) as Passo)}
            >
              <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
            </Button>
            <div className="flex items-center gap-2">
              {passo < 4 ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={!podeAvancar}
                  onClick={() => setPasso((p) => (p + 1) as Passo)}
                >
                  Avançar <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              ) : (
                <>
                  <Button type="button" size="sm" variant="outline" disabled title="Disponível na próxima etapa do módulo">
                    Publicar
                  </Button>
                  <Button type="button" size="sm" onClick={salvarRascunho} disabled={salvando}>
                    {salvando ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-1 h-4 w-4" />
                    )}
                    Salvar rascunho
                  </Button>
                </>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!trocaCompetencia} onOpenChange={(v) => !v && setTrocaCompetencia(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Trocar a competência?</AlertDialogTitle>
            <AlertDialogDescription>
              Existem datas selecionadas que não pertencem à nova competência. Ao confirmar, essas
              datas serão removidas e o período volta ao mês inteiro.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter como está</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarTrocaCompetencia}>
              Trocar e limpar datas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DiaDetalheSheet
        open={!!ocorrenciaDetalhe}
        onOpenChange={(v) => !v && setDetalheId(null)}
        ocorrencia={ocorrenciaDetalhe}
        cargoNome={nomeCargo(ocorrenciaDetalhe?.cargo_id ?? null)}
        modalidade={modalidade}
        origem={grupo ? "Rascunho salvo" : "Rascunho em edição"}
        situacao={
          ocorrenciaDetalhe && ocorrenciaPersistivel(ocorrenciaDetalhe, modalidade)
            ? "Pronta para gravar"
            : "Incompleta"
        }
        confirmados={
          ocorrenciaDetalhe?.data && ocorrenciaDetalhe.cargo_id
            ? contagem(ocorrenciaDetalhe.data, ocorrenciaDetalhe.cargo_id).confirmados
            : 0
        }
        aguardando={
          ocorrenciaDetalhe?.data && ocorrenciaDetalhe.cargo_id
            ? contagem(ocorrenciaDetalhe.data, ocorrenciaDetalhe.cargo_id).aguardando
            : 0
        }
        minimo={
          ocorrenciaDetalhe?.data && ocorrenciaDetalhe.cargo_id
            ? minimoDoCargoNaData({
                regras: preview.regrasCobertura,
                data: ocorrenciaDetalhe.data,
                unidadeId,
                cargoId: ocorrenciaDetalhe.cargo_id,
              })
            : null
        }
        trabalhadores={
          ocorrenciaDetalhe
            ? (modalidade === "individual"
                ? convocaveis.filter((c: any) => c.id === ocorrenciaDetalhe.colaborador_alvo_id)
                : (previaGrupo
                    .find((p) => p.ocorrencia_id === ocorrenciaDetalhe.id)
                    ?.reservados.map((id) => convocaveis.find((c: any) => c.id === id))
                    .filter(Boolean) ?? [])
              ).map((c: any) => ({
                id: c.id,
                nome: c.nome,
                regime: c.regime,
                situacao: modalidade === "individual" ? "Alvo da convocação" : "Elegível (prévia)",
              }))
            : []
        }
      />
    </>
  );
}

export { competenciaDaData };
