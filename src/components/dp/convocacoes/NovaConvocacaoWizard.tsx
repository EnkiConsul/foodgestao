import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, ArrowRight, CalendarDays, Loader2, Save } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MonthGridCalendar } from "@/components/dp/convocacoes/MonthGridCalendar";
import { useDpUnidades, useDpCargos } from "@/hooks/useDpCadastros";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import {
  useSalvarRascunhoConvocacao,
  useDpConvocacaoConfig,
} from "@/hooks/useDpConvocacaoGrupos";
import {
  ANTECEDENCIA_REFERENCIA_DIAS,
  antecedenciaDias,
  avaliarCandidatos,
  cargaPrevistaHoras,
  diagnosticarRemuneracao,
  grupoPersistivel,
  ocorrenciaPersistivel,
  payloadHorario,
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
}

type Passo = 0 | 1 | 2 | 3;
const PASSOS = ["Grupo", "Datas", "Detalhes", "Revisar"];

const novoId = () => crypto.randomUUID();
const competenciaDe = (ano: number, mes: number) => `${ano}-${String(mes).padStart(2, "0")}`;

const ocorrenciaBase = (data: string): RascunhoOcorrencia => ({
  id: novoId(),
  cargo_id: null,
  data,
  necessidade_entrada: "18:00",
  necessidade_saida: "23:00",
  necessidade_termina_no_dia_seguinte: false,
  horario_modo: "horario_unico",
  entrada: "18:00",
  saida: "23:00",
  intervalo_minutos: 0,
  vagas: 1,
  colaborador_alvo_id: null,
});

export function NovaConvocacaoWizard({ open, onOpenChange, onSalvo }: NovaConvocacaoWizardProps) {
  const hoje = new Date();
  const [passo, setPasso] = useState<Passo>(0);
  const [grupoId] = useState(novoId);
  const [unidadeId, setUnidadeId] = useState<string | null>(null);
  const [modalidade, setModalidade] = useState<ModalidadeConvocacao | null>(null);
  const [titulo, setTitulo] = useState("");
  const [observacao, setObservacao] = useState("");
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [cargoId, setCargoId] = useState<string | null>(null);
  const [ocorrencias, setOcorrencias] = useState<RascunhoOcorrencia[]>([]);
  const [salvando, setSalvando] = useState(false);

  const unidades = useDpUnidades();
  const cargos = useDpCargos();
  const colaboradores = useDpColaboradores();
  const config = useDpConvocacaoConfig(unidadeId);
  const { salvarGrupo, salvarOcorrencia } = useSalvarRascunhoConvocacao();

  const competencia = competenciaDe(ano, mes);
  const antecedenciaMinima = config.data?.antecedencia_minima_dias ?? ANTECEDENCIA_REFERENCIA_DIAS;

  const convocaveis = useMemo(
    () =>
      (colaboradores.data ?? []).filter(
        (c: any) => regimeConvocavel(c.regime) && c.ativo !== false,
      ),
    [colaboradores.data],
  );

  const datasSelecionadas = useMemo(
    () => new Set(ocorrencias.map((o) => o.data!).filter(Boolean)),
    [ocorrencias],
  );

  const infoDias = useMemo(() => {
    const out: Record<string, { selo?: string | null; tom?: any; titulo?: string | null }> = {};
    for (const o of ocorrencias) {
      if (!o.data) continue;
      const dias = antecedenciaDias(o.data);
      out[o.data] = {
        selo: `${o.vagas} vaga${o.vagas > 1 ? "s" : ""}`,
        tom: dias < antecedenciaMinima ? "atencao" : "primario",
        titulo:
          dias < antecedenciaMinima
            ? `Fora da antecedência de ${antecedenciaMinima} dias — exigirá justificativa na publicação.`
            : null,
      };
    }
    return out;
  }, [ocorrencias, antecedenciaMinima]);

  const toggleDia = (iso: string) => {
    setOcorrencias((prev) => {
      const existe = prev.some((o) => o.data === iso);
      if (existe) return prev.filter((o) => o.data !== iso);
      return [...prev, { ...ocorrenciaBase(iso), cargo_id: cargoId }];
    });
  };

  const patch = (id: string, p: Partial<RascunhoOcorrencia>) =>
    setOcorrencias((prev) => prev.map((o) => (o.id === id ? { ...o, ...p } : o)));

  const grupoOk = grupoPersistivel({ unidade_id: unidadeId, competencia, modalidade });
  const ocorrenciasOk = ocorrencias.filter((o) => ocorrenciaPersistivel(o, modalidade));
  const ocorrenciasPendentes = ocorrencias.length - ocorrenciasOk.length;

  const foraDaAntecedencia = ocorrencias.filter(
    (o) => o.data && antecedenciaDias(o.data) < antecedenciaMinima,
  );

  const podeAvancar =
    passo === 0
      ? grupoOk
      : passo === 1
        ? !!cargoId && ocorrencias.length > 0
        : passo === 2
          ? ocorrenciasOk.length > 0
          : false;

  const salvarRascunho = async () => {
    if (!grupoOk || !unidadeId || !modalidade) {
      toast.error("Informe unidade, competência e modalidade antes de salvar.");
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border p-4">
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" />
            Nova convocação
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
            {passo === 0 && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Unidade *</Label>
                  <Select value={unidadeId ?? ""} onValueChange={(v) => setUnidadeId(v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {(unidades.data ?? []).map((u: any) => (
                        <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Competência *</Label>
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
                      onChange={(e) => setAno(Number(e.target.value.replace(/\D/g, "")) || ano)}
                    />
                  </div>
                </div>

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

            {passo === 1 && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Cargo *</Label>
                  <Select
                    value={cargoId ?? ""}
                    onValueChange={(v) => {
                      setCargoId(v);
                      setOcorrencias((prev) => prev.map((o) => ({ ...o, cargo_id: v })));
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione o cargo" /></SelectTrigger>
                    <SelectContent>
                      {(cargos.data ?? []).map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <MonthGridCalendar
                  ano={ano}
                  mes={mes}
                  onMesChange={(a, m) => {
                    setAno(a);
                    setMes(m);
                  }}
                  selecionados={datasSelecionadas}
                  onToggleDia={toggleDia}
                  info={infoDias}
                />
                <p className="text-[11px] text-muted-foreground">
                  Clique nos dias para incluir ou remover. Este calendário é exclusivo de
                  Convocações — não aplica regras de folga ou DSR.
                </p>
              </div>
            )}

            {passo === 2 && (
              <div className="space-y-3">
                {ocorrencias.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhuma data selecionada.</p>
                )}
                {[...ocorrencias]
                  .sort((a, b) => (a.data ?? "").localeCompare(b.data ?? ""))
                  .map((o) => {
                    const completo = ocorrenciaPersistivel(o, modalidade);
                    const carga =
                      o.horario_modo === "horario_unico" && o.entrada && o.saida
                        ? cargaPrevistaHoras({
                            entrada: o.entrada,
                            saida: o.saida,
                            intervalo_minutos: o.intervalo_minutos,
                            termina_no_dia_seguinte: o.necessidade_termina_no_dia_seguinte,
                          })
                        : null;
                    return (
                      <div key={o.id} className="rounded-xl border border-border p-3">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm font-semibold">
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
                          <div className="space-y-1">
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
                                    .filter((c: any) => !cargoId || c.cargo_id === cargoId)
                                    .map((c: any) => (
                                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </div>

                        <div className="mt-2 flex justify-end">
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

            {passo === 3 && (
              <div className="space-y-3">
                <div className="rounded-xl border border-border p-3 text-sm">
                  <div className="font-semibold">Resumo</div>
                  <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                    <li>Unidade: {(unidades.data ?? []).find((u: any) => u.id === unidadeId)?.nome ?? "—"}</li>
                    <li>Competência: {competencia}</li>
                    <li>Modalidade: {modalidade === "individual" ? "Individual" : "Aberta"}</li>
                    <li>Cargo: {(cargos.data ?? []).find((c: any) => c.id === cargoId)?.nome ?? "—"}</li>
                    <li>
                      Datas prontas: {ocorrenciasOk.length}
                      {ocorrenciasPendentes > 0 ? ` · incompletas: ${ocorrenciasPendentes}` : ""}
                    </li>
                  </ul>
                </div>

                {foraDaAntecedencia.length > 0 && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      {foraDaAntecedencia.length} data(s) estão abaixo da antecedência de{" "}
                      {antecedenciaMinima} dias. Não bloqueia o rascunho, mas a publicação exigirá
                      justificativa registrada.
                    </AlertDescription>
                  </Alert>
                )}

                {modalidade === "aberta" && cargoId && unidadeId && ocorrenciasOk[0] && (
                  <div className="rounded-xl border border-border p-3">
                    <div className="text-sm font-semibold">Prévia de elegibilidade</div>
                    <p className="mb-2 text-[11px] text-muted-foreground">
                      Estimativa para a primeira data pronta. A validação definitiva ocorre na publicação.
                    </p>
                    <div className="space-y-1">
                      {avaliarCandidatos({
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
                          jornada: null,
                        })),
                        cargoId,
                        unidadeId,
                        necessidade: {
                          entrada: ocorrenciasOk[0].necessidade_entrada!,
                          saida: ocorrenciasOk[0].necessidade_saida!,
                          termina_no_dia_seguinte: ocorrenciasOk[0].necessidade_termina_no_dia_seguinte,
                        },
                        horarioModo: ocorrenciasOk[0].horario_modo,
                      })
                        .slice(0, 8)
                        .map((c) => (
                          <div
                            key={c.colaborador_id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-2 py-1.5 text-xs"
                          >
                            <span className="font-medium">{c.nome}</span>
                            {c.elegivel ? (
                              <Badge variant="outline" className="text-[10px]">Elegível</Badge>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">{c.motivos[0]}</span>
                            )}
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
                            <span className="font-medium">{o.data}</span>{" "}
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
            {passo < 3 ? (
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
  );
}
