import { DpFormFooter } from "@/components/dp/DpFormFooter";
import { Helmet } from "react-helmet-async";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { addDays, differenceInCalendarDays, parseISO } from "date-fns";
import { Palmtree, Plus, CheckCircle2, FileText, Pencil, CalendarClock } from "lucide-react";
import { DpPage, DpPageHeader, DpContentCard } from "@/components/dp/DpPage";
import { DpErrorState } from "@/components/dp/DpErrorState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useDpMinhasFerias, type MinhaFeriasPeriodo } from "@/hooks/useDpMinhasFerias";
import { hojeIsoLocal } from "@/lib/dp/dataLocal";
import {
  decimoTerceiroJaAdiantado,
  diasSugeridos,
  fimDoGozo,
  fracoesExistentes,
  inicioMinimoPedido,
  inicioSugeridoPedido,
  resumoPedido,
} from "@/lib/dp/ferias-pedido";
import {
  avaliarFracionamento,
  descreverFracionamento,
  FRACIONAMENTO_PADRAO,
} from "@/lib/dp/ferias-fracionamento";
import { dataBr as fmt } from "@/lib/dp/formato";
import { FeriasAssinarDialog, FeriasTermoDialog, textoSolicitacao } from "@/components/dp/ferias/FeriasTermo";
import { useMeuVinculoPortal } from "@/hooks/useMeuVinculoPortal";

const FRACIONAMENTO_TEXTO: Record<string, string> = {
  FERIAS_FRACIONAMENTO_LIMITE: `As férias podem ser divididas em até ${FRACIONAMENTO_PADRAO.maxFracoes} períodos.`,
  FERIAS_FRACAO_CURTA: `Cada período de férias precisa ter ao menos ${FRACIONAMENTO_PADRAO.minDias} dias.`,
  FERIAS_FRACAO_MAIOR_AUSENTE: `Um dos períodos precisa ter ${FRACIONAMENTO_PADRAO.maiorDias} dias ou mais.`,
};


const STATUS_LABEL: Record<string, string> = {
  planejado: "Aguardando aprovação",
  aprovado: "Programada",
  em_gozo: "Em férias",
  concluido: "Concluída",
  cancelado: "Cancelada",
};

const STATUS_TONE: Record<string, string> = {
  planejado: "bg-amber-500/15 text-amber-600",
  aprovado: "bg-sky-500/15 text-sky-600",
  em_gozo: "bg-primary/15 text-primary",
  concluido: "bg-muted text-muted-foreground",
  cancelado: "bg-destructive/15 text-destructive",
};

const PEDIDO_STATUS_LABEL: Record<string, string> = {
  pendente: "Em análise",
  aprovada: "Aprovado",
  recusada: "Recusado",
  cancelada: "Cancelado",
};

const PEDIDO_STATUS_TONE: Record<string, string> = {
  pendente: "bg-amber-500/15 text-amber-600",
  aprovada: "bg-emerald-500/15 text-emerald-600",
  recusada: "bg-destructive/15 text-destructive",
  cancelada: "bg-muted text-muted-foreground",
};

type ModoPedido = "novo" | "editar" | "remarcar";

/** Minhas Férias: saldo, pedidos e ciência das férias programadas. */
export default function DpMeuFerias() {
  const {
    periodos, pedidos, isLoading, isError, refetch, solicitar, editarPedido,
    cancelarPedido, pedirRemarcacao, registrarCiencia, abrirDocumento,
  } = useDpMinhasFerias();
  const [aberto, setAberto] = useState(false);
  const [modo, setModo] = useState<ModoPedido>("novo");
  const [alvoId, setAlvoId] = useState("");
  const [diasDoAlvo, setDiasDoAlvo] = useState(0);
  const [periodoId, setPeriodoId] = useState("");
  const [inicio, setInicio] = useState("");
  const [diasTexto, setDiasTexto] = useState("");
  const [abonoTexto, setAbonoTexto] = useState("");
  const [adiantar13, setAdiantar13] = useState(false);
  const [observacao, setObservacao] = useState("");
  const vinculo = useMeuVinculoPortal();
  const meuNome = vinculo.data?.nome ?? "";
  const [assinandoPedido, setAssinandoPedido] = useState(false);
  const [cienciaGozo, setCienciaGozo] = useState<{ id: string; inicio: string; fim: string; ajustado?: boolean } | null>(null);
  const [termo, setTermo] = useState<{ solicitacaoId?: string | null; gozoId?: string | null } | null>(null);

  // FIFO: o mais antigo com saldo vem primeiro (férias saem sempre dele).
  const comSaldo = useMemo(
    () =>
      periodos
        .filter((p) => p.dias_saldo > 0)
        .sort((a, b) => a.inicio_aquisitivo.localeCompare(b.inicio_aquisitivo)),
    [periodos],
  );
  const pedidosPendentes = useMemo(
    () => pedidos.filter((p) => p.status === "pendente"),
    [pedidos],
  );
  const pedidosRespondidos = useMemo(
    () => pedidos.filter((p) => p.status !== "pendente").slice(0, 3),
    [pedidos],
  );

  // Na remarcação os dias das férias atuais voltam para o saldo disponível:
  // eles só saem de verdade se o gestor aprovar a troca.
  const periodoBase: MinhaFeriasPeriodo | null =
    periodos.find((p) => p.periodo_id === periodoId) ?? null;
  const periodoSel: MinhaFeriasPeriodo | null =
    periodoBase && modo === "remarcar"
      ? { ...periodoBase, dias_saldo: periodoBase.dias_saldo + diasDoAlvo }
      : periodoBase;

  const abono = Number(abonoTexto) || 0;
  const dias = Number(diasTexto) || 0;
  const resumo = periodoSel ? resumoPedido(periodoSel, abono, dias) : null;
  const total = resumo?.total ?? 0;
  const excede = !!resumo?.excede;
  const abonoAcimaDoLegal = !!resumo?.abonoAcimaDoLegal;
  const inicioMin = periodoSel ? inicioMinimoPedido(periodoSel, hojeIsoLocal()) : "";
  const inicioAntesDoPermitido = !!inicio && !!inicioMin && inicio < inicioMin;
  const fim = fimDoGozo(inicio, dias);
  const jaAdiantou13 = !!periodoSel && decimoTerceiroJaAdiantado(periodoSel);
  const antecedencia = inicio ? differenceInCalendarDays(parseISO(inicio), new Date()) : null;
  const foraDoPrazo =
    !!periodoSel && antecedencia !== null && antecedencia < periodoSel.aviso_antecedencia_dias;

  /** Divisão das férias: só bloqueia quando a lei realmente não permite. */
  const fracionamento = useMemo(() => {
    if (!periodoSel || dias <= 0) return null;
    const restante = Math.max(0, periodoSel.dias_saldo - dias - Math.max(0, abono));
    return avaliarFracionamento(dias, fracoesExistentes(periodoSel), restante);
  }, [periodoSel, dias, abono]);
  const fracionamentoInvalido = !!fracionamento && !fracionamento.ok;

  // Ao abrir um pedido novo (ou trocar de período), já sugere data e dias.
  useEffect(() => {
    if (!aberto || !periodoSel || modo !== "novo") return;
    setInicio(
      inicioSugeridoPedido(periodoSel, hojeIsoLocal(), periodoSel.aviso_antecedencia_dias),
    );
    setAbonoTexto("");
    setDiasTexto(String(diasSugeridos(periodoSel.dias_saldo, 0)));
  }, [aberto, modo, periodoSel?.periodo_id]);

  const alterarAbono = (valor: string) => {
    setAbonoTexto(valor);
    if (!periodoSel) return;
    // O descanso padrão é o saldo menos o que foi vendido.
    setDiasTexto(String(diasSugeridos(periodoSel.dias_saldo, Number(valor) || 0)));
  };

  const abrir = () => {
    setModo("novo");
    setAlvoId("");
    setDiasDoAlvo(0);
    setPeriodoId(comSaldo[0]?.periodo_id ?? "");
    setInicio("");
    setDiasTexto("");
    setAbonoTexto("");
    setAdiantar13(false);
    setObservacao("");
    setAberto(true);
  };

  /** Ajustar o próprio pedido enquanto o gestor ainda não respondeu. */
  const abrirEdicao = (pedido: (typeof pedidos)[number]) => {
    setModo("editar");
    setAlvoId(pedido.solicitacao_id);
    setDiasDoAlvo(0);
    setPeriodoId(pedido.periodo_id);
    setInicio(pedido.data_inicio);
    setDiasTexto(String(pedido.dias));
    setAbonoTexto(pedido.dias_abono ? String(pedido.dias_abono) : "");
    setAdiantar13(pedido.adiantar_13);
    setObservacao(pedido.observacao ?? "");
    setAberto(true);
  };

  // Chegou de "Minhas solicitações" com ?editar=<id>: abre a edição do pedido.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const alvo = searchParams.get("editar");
    if (!alvo || pedidos.length === 0) return;
    const pd = pedidos.find((p) => p.solicitacao_id === alvo && p.status === "pendente");
    if (pd) abrirEdicao(pd);
    searchParams.delete("editar");
    setSearchParams(searchParams, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, pedidos]);

  /** Pedir novas datas para férias já aprovadas: as atuais seguem valendo. */
  const abrirRemarcacao = (
    gozo: { id: string; data_inicio: string; data_fim: string; dias: number; dias_abono: number },
    periodo: MinhaFeriasPeriodo,
  ) => {
    setModo("remarcar");
    setAlvoId(gozo.id);
    setDiasDoAlvo(gozo.dias + gozo.dias_abono);
    setPeriodoId(periodo.periodo_id);
    setInicio("");
    setDiasTexto(String(gozo.dias));
    setAbonoTexto(gozo.dias_abono ? String(gozo.dias_abono) : "");
    setAdiantar13(false);
    setObservacao("");
    setAberto(true);
  };

  const enviando = solicitar.isPending || editarPedido.isPending || pedirRemarcacao.isPending;

  const enviar = () => {
    const fechar = { onSuccess: () => setAberto(false) };
    if (modo === "editar") {
      return editarPedido.mutate(
        {
          solicitacaoId: alvoId,
          dataInicio: inicio,
          dataFim: fim,
          diasAbono: abono,
          adiantar13,
          observacao,
        },
        fechar,
      );
    }
    if (modo === "remarcar") {
      return pedirRemarcacao.mutate(
        { gozoId: alvoId, dataInicio: inicio, dataFim: fim, motivo: observacao },
        fechar,
      );
    }
    setAssinandoPedido(true);
  };

  const enviarAssinado = (assinatura: string) =>
    solicitar.mutate(
      {
        assinatura,
        periodoId,
        dataInicio: inicio,
        dataFim: fim,
        diasAbono: abono,
        adiantar13: adiantar13 && !jaAdiantou13,
        observacao,
      },
      { onSuccess: () => { setAssinandoPedido(false); setAberto(false); } },
    );


  return (
    <DpPage>
      <Helmet><title>Minhas Férias — Pessoas 360°</title></Helmet>

      <DpPageHeader
        icon={Palmtree}
        title="Minhas Férias"
        description="Seu saldo de férias, os pedidos enviados e as férias já programadas."
        actions={
          <Button className="rounded-full px-6" disabled={comSaldo.length === 0} onClick={abrir}>
            <Plus className="mr-2 size-4" /> Pedir férias
          </Button>
        }
      />

      {(pedidosPendentes.length > 0 || pedidosRespondidos.length > 0) && (
        <DpContentCard contentClassName="space-y-3 p-4">
          <p className="font-semibold">Meus pedidos de férias</p>
          {pedidosPendentes.map((pd) => (
            <div
              key={pd.solicitacao_id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/40 p-3 text-sm"
            >
              <div>
                <p>
                  {fmt(pd.data_inicio)} a {fmt(pd.data_fim)} · {pd.dias} dias
                  {pd.dias_abono > 0 && ` + ${pd.dias_abono} de abono`}
                </p>
                {pd.observacao && (
                  <p className="text-xs text-muted-foreground">{pd.observacao}</p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={PEDIDO_STATUS_TONE.pendente}>
                  {PEDIDO_STATUS_LABEL.pendente}
                </Badge>
                <Button size="sm" variant="ghost" onClick={() => setTermo({ solicitacaoId: pd.solicitacao_id })}>
                  <FileText className="mr-1 size-3.5" /> Ver Termo
                </Button>
                <Button size="sm" variant="outline" onClick={() => abrirEdicao(pd)}>
                  <Pencil className="mr-1 size-3.5" /> Editar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={cancelarPedido.isPending}
                  onClick={() => cancelarPedido.mutate(pd.solicitacao_id)}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ))}
          {pedidosRespondidos.map((pd) => (
            <div
              key={pd.solicitacao_id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm"
            >
              <div>
                <p>
                  {fmt(pd.data_inicio)} a {fmt(pd.data_fim)} · {pd.dias} dias
                </p>
                {pd.resposta_admin && (
                  <p className="text-xs text-muted-foreground">{pd.resposta_admin}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge className={PEDIDO_STATUS_TONE[pd.status] ?? "bg-muted text-muted-foreground"}>
                  {PEDIDO_STATUS_LABEL[pd.status] ?? pd.status}
                </Badge>
                <Button size="sm" variant="ghost" onClick={() => setTermo({ solicitacaoId: pd.solicitacao_id })}>
                  <FileText className="mr-1 size-3.5" /> Ver Termo
                </Button>
              </div>
            </div>
          ))}
        </DpContentCard>
      )}



      {isError ? (
        <DpContentCard contentClassName="p-4"><DpErrorState onRetry={refetch} /></DpContentCard>
      ) : isLoading ? (
        <DpContentCard contentClassName="p-8 text-center text-muted-foreground">
          Carregando…
        </DpContentCard>
      ) : periodos.length === 0 ? (
        <DpContentCard contentClassName="p-8 text-center text-muted-foreground">
          Ainda não há períodos de férias registrados para você.
        </DpContentCard>
      ) : (
        <div className="space-y-4">
          {periodos.map((p) => (
            <DpContentCard key={p.periodo_id} contentClassName="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    Período {fmt(p.inicio_aquisitivo)} a {fmt(p.fim_aquisitivo)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Prazo para tirar: até {fmt(p.limite_concessivo)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">Direito {p.dias_direito} dias</Badge>
                  <Badge variant="outline">Saldo {p.dias_saldo} dias</Badge>
                </div>
              </div>

              {p.gozos.length > 0 && (
                <div className="space-y-2 rounded-xl bg-muted/40 p-3">
                  {p.gozos.map((g) => (
                    <div key={g.id} className="space-y-2 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          {fmt(g.data_inicio)} a {fmt(g.data_fim)} · {g.dias} dias
                          {g.dias_abono > 0 && ` + ${g.dias_abono} de abono`}
                          {g.adiantar_13 && " · 13º adiantado"}
                        </span>
                        <span className="flex items-center gap-2">
                          <Badge className={STATUS_TONE[g.status]}>
                            {STATUS_LABEL[g.status] ?? g.status}
                          </Badge>
                          {g.ciente_em ? (
                            <Badge variant="outline" className="text-emerald-600">
                              <CheckCircle2 className="mr-1 size-3.5" /> Ciente
                            </Badge>
                          ) : (
                            (g.status === "aprovado" || g.status === "em_gozo") && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={registrarCiencia.isPending}
                                onClick={() => setCienciaGozo({ id: g.id, inicio: g.data_inicio, fim: g.data_fim })}
                              >
                                Assinar Ciência
                              </Button>
                            )
                          )}
                          {(g.status === "planejado" || g.status === "aprovado") && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => abrirRemarcacao(g, p)}
                            >
                              <CalendarClock className="mr-1 size-3.5" /> Pedir remarcação
                            </Button>
                          )}
                        </span>

                      </div>

                      {g.aviso_em && (
                        <p className="text-xs text-muted-foreground">
                          Aviso de férias em {fmt(g.aviso_em)}
                          {g.aviso_fora_prazo && " · comunicado com menos de 30 dias"}
                          {g.aviso_justificativa ? ` · ${g.aviso_justificativa}` : ""}
                        </p>
                      )}

                      <Button size="sm" variant="ghost" onClick={() => setTermo({ gozoId: g.id })}>
                        <FileText className="mr-1 size-3.5" /> Ver Termos
                      </Button>

                      {g.documentos.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {g.documentos.map((d) => (
                            <Button
                              key={d.id}
                              size="sm"
                              variant="outline"
                              onClick={() => abrirDocumento(d)}
                            >
                              <FileText className="mr-1 size-3.5" />
                              {d.tipo === "recibo_ferias" ? "Recibo de férias" : "Aviso de férias"}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </DpContentCard>
          ))}
        </div>
      )}

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-lg max-h-[90svh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>
              {modo === "editar"
                ? "Editar pedido de férias"
                : modo === "remarcar"
                  ? "Pedir remarcação das férias"
                  : "Pedir férias"}
            </DialogTitle>
            <DialogDescription>
              {modo === "remarcar"
                ? "As férias atuais continuam valendo até o gestor aprovar as novas datas."
                : "Seu pedido vai para a aprovação do gestor antes de virar férias programadas."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Período</Label>
              {modo === "novo" ? (
                <div className="space-y-2">
                  <p className="rounded-xl bg-muted/40 p-3 text-sm">
                    {periodoSel
                      ? `Período aquisitivo: ${fmt(periodoSel.inicio_aquisitivo)} a ${fmt(periodoSel.fim_aquisitivo)} · Saldo disponível: ${periodoSel.dias_saldo} dias${periodoSel.limite_concessivo ? ` (limite até ${fmt(periodoSel.limite_concessivo)})` : ""}`
                      : "Nenhum período com saldo."}
                  </p>
                  {comSaldo.length > 1 && (
                    <p className="text-xs text-muted-foreground">
                      Próximo período ({fmt(comSaldo[1].inicio_aquisitivo)} a {fmt(comSaldo[1].fim_aquisitivo)}) será liberado assim que o saldo deste período for zerado.
                    </p>
                  )}
                </div>
              ) : (
                <p className="rounded-xl bg-muted/40 p-3 text-sm">
                  {periodoSel
                    ? `${fmt(periodoSel.inicio_aquisitivo)} a ${fmt(periodoSel.fim_aquisitivo)}`
                    : "—"}
                </p>
              )}
            </div>


            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Primeiro dia de férias</Label>
                <Input
                  type="date"
                  min={inicioMin || undefined}
                  max={periodoSel?.limite_concessivo || undefined}
                  value={inicio}
                  onChange={(e) => setInicio(e.target.value)}
                />
                {inicioMin && (
                  <p className="text-xs text-muted-foreground">
                    A partir de {fmt(inicioMin)}.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Dias de descanso</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={resumo?.maxDias || undefined}
                  placeholder="Ex.: 20"
                  value={diasTexto}
                  onChange={(e) => setDiasTexto(e.target.value.replace(/\D/g, ""))}
                />
                <p className="text-xs text-muted-foreground">
                  Até {resumo?.maxDias ?? 0} dias com o saldo atual. Você pode reduzir respeitando a
                  regra: {descreverFracionamento(FRACIONAMENTO_PADRAO).toLowerCase()}
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-muted/40 p-3 text-sm">
              Último dia de férias:{" "}
              <span className="font-semibold">{fim ? fmt(fim) : "—"}</span>
              <p className="text-xs text-muted-foreground">
                Calculado a partir do primeiro dia e dos dias de descanso.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Vender dias (abono)</Label>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={resumo?.maxAbono ?? 0}
                placeholder="0"
                value={abonoTexto}
                onChange={(e) => alterarAbono(e.target.value.replace(/\D/g, ""))}
              />
              <p className="text-xs text-muted-foreground">
                A lei permite vender no máximo {resumo?.maxAbono ?? 0} dias deste período.
              </p>
            </div>

            {periodoSel?.adiantamento_13 !== "nao" && !jaAdiantou13 && (
              <div className="flex items-center justify-between rounded-xl border border-border p-3">
                <div>
                  <p className="text-sm font-medium">Adiantar a 1ª parcela do 13º</p>
                  <p className="text-xs text-muted-foreground">
                    Sujeito à conferência do setor de pessoal.
                  </p>
                </div>
                <Switch checked={adiantar13} onCheckedChange={setAdiantar13} />
              </div>
            )}

            {jaAdiantou13 && (
              <p className="rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
                A 1ª parcela do 13º já foi adiantada neste período, por isso não é possível pedir de
                novo.
              </p>
            )}

            <div className="space-y-2">
              <Label>Observação (opcional)</Label>
              <Textarea rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
            </div>

            <div className="rounded-xl bg-muted/50 p-3 text-sm">
              <span className="font-semibold">{dias}</span> dias de férias
              {abono > 0 && <> + <span className="font-semibold">{abono}</span> vendidos</>} ={" "}
              <span className="font-semibold">{total}</span> dias do período.
              {excede && (
                <p className="mt-1 text-destructive">
                  Passa do seu saldo ({periodoSel?.dias_saldo} dias).
                </p>
              )}
              {abonoAcimaDoLegal && (
                <p className="mt-1 text-destructive">
                  A lei permite vender no máximo {resumo?.maxAbono} dias.
                </p>
              )}
              {inicioAntesDoPermitido && (
                <p className="mt-1 text-destructive">
                  As férias só podem começar a partir de {fmt(inicioMin)}.
                </p>
              )}
              {fracionamentoInvalido && fracionamento?.codigo && (
                <p className="mt-1 text-destructive">
                  {FRACIONAMENTO_TEXTO[fracionamento.codigo] ??
                    "A divisão das férias não é permitida pela lei."}
                </p>
              )}
              {foraDoPrazo && !excede && (
                <p className="mt-1 text-amber-700">
                  A empresa pede {periodoSel?.aviso_antecedencia_dias} dias de antecedência. Seu
                  pedido pode ser recusado por estar em cima da hora.
                </p>
              )}
            </div>
          </div>

          <DpFormFooter className="-mx-6 -mb-6 mt-2">
            <Button variant="outline" onClick={() => setAberto(false)}>Fechar</Button>
            <Button
              disabled={
                enviando ||
                excede ||
                abonoAcimaDoLegal ||
                inicioAntesDoPermitido ||
                fracionamentoInvalido ||
                !periodoId ||
                !inicio ||
                !fim
              }
              onClick={enviar}
            >
              {enviando
                ? "Enviando…"
                : modo === "editar"
                  ? "Salvar pedido"
                  : modo === "remarcar"
                    ? "Pedir remarcação"
                    : "Enviar pedido"}
            </Button>
          </DpFormFooter>

        </DialogContent>
      </Dialog>

      <FeriasAssinarDialog
        open={assinandoPedido}
        onOpenChange={setAssinandoPedido}
        titulo="Termo de Solicitação de Férias"
        nome={meuNome}
        paragrafos={inicio && fim ? textoSolicitacao({ nome: meuNome, inicio, fim, abono, adiantar13: adiantar13 && !jaAdiantou13 }) : []}
        confirmarTexto="Assinar e Enviar Pedido"
        enviando={solicitar.isPending}
        onConfirmar={enviarAssinado}
      />
      <FeriasAssinarDialog
        open={!!cienciaGozo}
        onOpenChange={(v) => { if (!v) setCienciaGozo(null); }}
        titulo="Aviso de Férias"
        nome={meuNome}
        paragrafos={cienciaGozo ? [
          `A empresa comunica que suas férias serão de ${fmt(cienciaGozo.inicio)} a ${fmt(cienciaGozo.fim)} (Art. 135 da CLT).`,
          "A época das férias é definida pela empresa (Art. 136 da CLT). Sua assinatura registra apenas a ciência do período.",
        ] : []}
        confirmarTexto="Assinar Ciência"
        enviando={registrarCiencia.isPending}
        onConfirmar={(assinatura) => cienciaGozo && registrarCiencia.mutate(
          { gozoId: cienciaGozo.id, assinatura }, { onSuccess: () => setCienciaGozo(null) })}
      />
      <FeriasTermoDialog
        open={!!termo}
        onOpenChange={(v) => { if (!v) setTermo(null); }}
        solicitacaoId={termo?.solicitacaoId}
        gozoId={termo?.gozoId}
      />
    </DpPage>
  );
}
