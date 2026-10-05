import { CienciaFaltaTrocaBox, TEXTO_CIENCIA_FALTA_TROCA } from "@/components/dp/CienciaFaltaTrocaBox";
import { Link } from "react-router-dom";
import { sugerirPushContextual } from "@/components/dp/PushSoftPrompt";
import { DpFormFooter } from "@/components/dp/DpFormFooter";
import { Helmet } from "react-helmet-async";
import { useMemo, useState } from "react";
import type { DpTrocaRow } from "@/hooks/useDpTrocas";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Repeat, Check, X, Ban, Plus, ArrowRight, User, Users, FileText } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DpStatusBadge, type DpStatusTone } from "@/components/dp/DpStatusBadge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DpErrorState } from "@/components/dp/DpErrorState";
import { CardListSkeleton } from "@/components/dp/DpSkeletons";
import { ConfirmarAcaoDialog } from "@/components/dp/ConfirmarAcaoDialog";
import { AssinaturaConfirmarDialog } from "@/components/dp/portal/AssinaturaConfirmarDialog";
import { assinarTroca } from "@/lib/dp/troca-assinatura";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DpContentCard, DpEmptyState, DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { TextoExpansivel } from "@/components/dp/TextoExpansivel";
import { textoDecisaoGestor } from "@/lib/dp/troca-acoes";
import { cn } from "@/lib/utils";
import { resolverPendencias } from "@/lib/dp/pendencias-resolver";
import { notifyError } from "@/lib/notifyError";
import { mensagemErroTroca } from "@/lib/dp/trocas-erros";
import { pessoaConvocavel } from "@/lib/dp/convocacoes-planejamento";
import { hojeIsoLocal } from "@/lib/dp/dataLocal";
import { avaliarRiscoDsrTroca, avisoDsr, descansosDoColaborador } from "@/lib/dp/dsr-consecutivo";
import { diasFixosDoColaborador, registrarCienciaDsr } from "@/lib/dp/dsr-ciencia";
import { TermoTrocaPreviewDialog } from "@/components/dp/trocas/TermoTrocaPreviewDialog";

const statusLabel: Record<string, string> = {
  pendente_colega: "Aguardando colega",
  pendente_gestor: "Aguardando gestor",
  aprovada: "Aprovada",
  recusada: "Recusada",
  cancelada: "Cancelada",
  expirada: "Expirada",
};

const statusTone: Record<string, DpStatusTone> = {
  pendente_colega: "warning",
  pendente_gestor: "info",
  aprovada: "success",
  recusada: "danger",
  cancelada: "muted",
  expirada: "muted",
};



function dataBR(iso: string) {
  return format(new Date(`${iso}T00:00:00`), "EEEE, dd/MM/yyyy", { locale: ptBR });
}

export default function DpMeuTrocas() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"todas" | "recebidas" | "enviadas">("todas");
  const [open, setOpen] = useState(false);
  const [cienteFalta, setCienteFalta] = useState(false);
  const [assinarPedido, setAssinarPedido] = useState(false);
  const [assinarAceite, setAssinarAceite] = useState<null | { id: string; risco: boolean; sequencia: number; data: string }>(null);
  const [form, setForm] = useState<{
    destino_id: string;
    data_original: string;
    data_proposta: string;
    motivo: string;
  }>({ destino_id: "", data_original: "", data_proposta: "", motivo: "" });

  const meRef = useQuery({
    queryKey: ["colab_of_trocas", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.rpc("dp_meu_colaborador");
      if (!data) return null;
      const { data: c } = await supabase
        .from("dp_colaboradores").select("id, nome, company_id, unidade_id, regime, forma_pagamento").eq("id", data).single();
      return c;
    },
  });

  /** Intermitente/freelancer não tem folga semanal para trocar. */
  const convocavel = pessoaConvocavel(meRef.data ?? {});

  const list = useQuery({
    queryKey: ["dp_meu_trocas", meRef.data?.id],
    enabled: !!meRef.data?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("dp_trocas")
        .select("*, solicitante:solicitante_id(nome), destino:destino_id(nome)")
        .or(`solicitante_id.eq.${meRef.data!.id},destino_id.eq.${meRef.data!.id}`)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  /**
   * Folgas futuras da loja: as minhas viram opção de "minha data" e as dos
   * colegas viram as datas que eu posso pedir — com quem folga em cada uma.
   */
  const folgasFuturas = useQuery({
    queryKey: ["dp_folgas_trocas", meRef.data?.company_id, meRef.data?.id],
    enabled: !!meRef.data?.company_id,
    queryFn: async () => {
      const hoje = hojeIsoLocal();
      const { data, error } = await supabase
        .from("dp_folgas")
        .select("id, data, colaborador_id, status, dp_colaboradores(nome, unidade_id, ativo)")
        .eq("company_id", meRef.data!.company_id!)
        .gte("data", hoje)
        .order("data");
      if (error) throw error;
      return (data ?? []).filter((f: any) => f.status !== "cancelada");
    },
  });

  const [termo, setTermo] = useState<DpTrocaRow | null>(null);

  const empresaRef = useQuery({
    queryKey: ["dp_minha_empresa_termo", meRef.data?.company_id],
    enabled: !!meRef.data?.company_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("companies")
        .select("razao_social, nome_fantasia")
        .eq("id", meRef.data!.company_id!)
        .maybeSingle();
      return { nome: (data as any)?.razao_social ?? (data as any)?.nome_fantasia ?? "Empresa" };
    },
  });

  const minhaUnidade = (meRef.data as { unidade_id?: string | null } | undefined)?.unidade_id ?? null;

  /** Minhas folgas futuras — o que eu tenho para oferecer. */
  const minhasFolgas = useMemo(
    () =>
      (folgasFuturas.data ?? []).filter((f: any) => f.colaborador_id === meRef.data?.id),
    [folgasFuturas.data, meRef.data?.id],
  );

  /** Meus dias fixos de folga na semana (para avaliar dias seguidos sem descanso). */
  const meusFixos = useQuery({
    queryKey: ["dp_meus_dias_fixos", meRef.data?.id],
    enabled: !!meRef.data?.id,
    queryFn: () => diasFixosDoColaborador(meRef.data!.id),
  });

  const meusDescansos = useMemo(
    () =>
      descansosDoColaborador({
        folgasIso: minhasFolgas.map((f: any) => f.data as string),
        diasFixos: meusFixos.data ?? [],
        inicioIso: hojeIsoLocal(),
        dias: 120,
      }),
    [minhasFolgas, meusFixos.data],
  );

  /** Folgas de colegas da minha loja, agrupadas por data. */
  const folgasDeColegasPorData = useMemo(() => {
    const m = new Map<string, { id: string; nome: string }[]>();
    for (const f of (folgasFuturas.data ?? []) as any[]) {
      if (f.colaborador_id === meRef.data?.id) continue;
      const colega = f.dp_colaboradores ?? {};
      if (colega.ativo === false) continue;
      if (minhaUnidade && colega.unidade_id && colega.unidade_id !== minhaUnidade) continue;
      const lista = m.get(f.data) ?? [];
      if (!lista.some((c) => c.id === f.colaborador_id)) {
        lista.push({ id: f.colaborador_id, nome: colega.nome ?? "Colega" });
      }
      m.set(f.data, lista);
    }
    return m;
  }, [folgasFuturas.data, meRef.data?.id, minhaUnidade]);

  const datasPropostas = useMemo(
    () => Array.from(folgasDeColegasPorData.keys()).sort(),
    [folgasDeColegasPorData],
  );

  const colegasDaData = useMemo(
    () => (form.data_proposta ? folgasDeColegasPorData.get(form.data_proposta) ?? [] : []),
    [folgasDeColegasPorData, form.data_proposta],
  );

  /**
   * Resposta do colega: o servidor confere quem está respondendo, o status e,
   * quando a unidade usa troca direta, efetiva as folgas na mesma operação.
   */
  const responderColega = useMutation({
    mutationFn: async ({ id, aceito, assinatura }: { id: string; aceito: boolean; assinatura?: string }) => {
      if (aceito) {
        if (!assinatura) throw new Error("Assine digitalmente para aceitar a troca.");
        await assinarTroca(id, assinatura);
      }
      const { data, error } = await supabase.rpc("dp_troca_responder_colega", {
        p_id: id,
        p_aceito: aceito,
      });
      if (error) throw new Error(mensagemErroTroca(error.message));
      const res = (data ?? null) as { efetivada?: boolean } | null;
      return !!res?.efetivada;
    },
    onSuccess: (efetivada) => {
      toast.success(efetivada ? "Troca efetivada no calendário" : "Resposta registrada");
      qc.invalidateQueries({ queryKey: ["dp_meu_trocas"] });
      void resolverPendencias(qc, { companyId: meRef.data?.company_id ?? null });
      qc.invalidateQueries({ queryKey: ["dp_folgas_meu_cal"] });
    },
    onError: (e: any) => notifyError(e, { surface: "Trocas de folga", action: "concluir a ação", fallback: "Erro" }),
  });


  const cancelar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("dp_troca_cancelar_self", { p_id: id });
      if (error) throw new Error(mensagemErroTroca(error.message));
    },
    onSuccess: () => {
      toast.success("Troca cancelada");
      qc.invalidateQueries({ queryKey: ["dp_meu_trocas"] });
      void resolverPendencias(qc, { companyId: meRef.data?.company_id ?? null });
    },
    onError: (e: any) => notifyError(e, { surface: "Trocas de folga", action: "concluir a ação", fallback: "Erro" }),
  });

  const validation = useMemo(() => {
    if (!form.data_original) return "Escolha uma folga sua para oferecer.";
    if (!form.data_proposta) return "Escolha o dia que você quer folgar.";
    if (!form.destino_id) return "Selecione o colega que folga nesse dia.";
    if (form.data_original === form.data_proposta) return "As datas devem ser diferentes.";
    if (!form.motivo.trim()) return "Motivo obrigatório.";
    return null;
  }, [form]);

  const criar = useMutation({
    mutationFn: async (assinatura: string) => {
      if (!meRef.data) throw new Error("Colaborador não encontrado");
      if (validation) throw new Error(validation);
      const { data, error } = await supabase.rpc("dp_troca_propor", {
        p_destino: form.destino_id,
        p_data_original: form.data_original!,
        p_data_proposta: form.data_proposta!,
        p_motivo: form.motivo,
      });
      if (error) throw new Error(mensagemErroTroca(error.message));
      const trocaId = (data as { troca_id?: string } | null)?.troca_id;
      if (trocaId) await assinarTroca(trocaId, assinatura);
    },
    onSuccess: () => {
      toast.success("Troca proposta enviada");
      sugerirPushContextual("Ative os avisos para saber na hora quando seu colega e o gestor responderem a troca.");
      qc.invalidateQueries({ queryKey: ["dp_meu_trocas"] });
      void resolverPendencias(qc, { companyId: meRef.data?.company_id ?? null });
      setOpen(false);
      setAssinarPedido(false);
      setCienteFalta(false);
      setForm({ destino_id: "", data_original: undefined, data_proposta: undefined, motivo: "" });
    },
    onError: (e: any) => notifyError(e, { surface: "Trocas de folga", action: "concluir a ação", fallback: "Erro" }),
  });

  const filtered = useMemo(() => {
    const meId = meRef.data?.id;
    const src = list.data ?? [];
    if (tab === "recebidas") return src.filter((t: any) => t.destino_id === meId);
    if (tab === "enviadas") return src.filter((t: any) => t.solicitante_id === meId);
    return src;
  }, [list.data, tab, meRef.data?.id]);

  const counts = useMemo(() => {
    const meId = meRef.data?.id;
    const src = list.data ?? [];
    return {
      todas: src.length,
      recebidas: src.filter((t: any) => t.destino_id === meId).length,
      enviadas: src.filter((t: any) => t.solicitante_id === meId).length,
    };
  }, [list.data, meRef.data?.id]);

  return (
    <DpPage>
      <Helmet><title>Minhas trocas — Portal</title></Helmet>
      <DpPageHeader
        icon={Repeat}
        title="Minhas trocas"
        actions={
          convocavel ? null : (
            <Button asChild variant="outline"><Link to="/dp/meu/calendario"><Plus className="h-4 w-4 mr-1" /> Trocar pelo calendário</Link></Button>
          )
        }
      />

      {convocavel && (
        <div className="rounded-xl border bg-muted/40 p-3 text-sm">
          Seu contrato é <strong>intermitente/por convocação</strong>: você não tem folga semanal para trocar.
          Seus dias de trabalho chegam por convocação (Art. 452-A da CLT).
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <div className="-mx-1 overflow-x-auto">
          <TabsList className="w-max">
            <TabsTrigger value="todas" className="whitespace-nowrap">Todas ({counts.todas})</TabsTrigger>
            <TabsTrigger value="recebidas" className="whitespace-nowrap"><Users className="h-3.5 w-3.5 mr-1" /> Recebidas ({counts.recebidas})</TabsTrigger>
            <TabsTrigger value="enviadas" className="whitespace-nowrap"><User className="h-3.5 w-3.5 mr-1" /> Enviadas ({counts.enviadas})</TabsTrigger>
          </TabsList>
        </div>
      </Tabs>

      {list.isError || meRef.isError ? (
        <DpContentCard contentClassName="p-4">
          <DpErrorState onRetry={() => { meRef.refetch(); list.refetch(); }} />
        </DpContentCard>
      ) : meRef.isLoading || list.isLoading ? (
        <CardListSkeleton rows={3} />
      ) : filtered.length === 0 ? (
        <DpContentCard><DpEmptyState icon={Repeat}>Sem trocas.</DpEmptyState></DpContentCard>

      ) : (
        <>
        <div className="grid gap-3">
          {filtered.map((t: any) => {
            const meId = meRef.data?.id;
            const souDestino = t.destino_id === meId;
            const souSolicitante = t.solicitante_id === meId;
            const podeResponderColega = souDestino && t.status === "pendente_colega";
            const podeCancelar = souSolicitante && ["pendente_colega", "pendente_gestor"].includes(t.status);
            const trocaDireta = String(t.gestor_resposta ?? "").includes("dispensada");
            return (
              <Card key={t.id} className="dp-content-card">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-base">
                      {format(new Date(t.data_original + "T00:00:00"), "dd/MM/yyyy (EEE)", { locale: ptBR })}
                      {" ↔ "}
                      {format(new Date(t.data_proposta + "T00:00:00"), "dd/MM/yyyy (EEE)", { locale: ptBR })}
                    </CardTitle>
                    <DpStatusBadge tone={statusTone[t.status] ?? "neutral"}>
                      {statusLabel[t.status] ?? t.status}
                    </DpStatusBadge>
                  </div>
                  <p className="text-sm mt-1">
                    {souSolicitante
                      ? <>Proposta enviada para <strong>{t.destino?.nome}</strong></>
                      : <>Solicitado por <strong>{t.solicitante?.nome}</strong></>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {souSolicitante ? "Você" : t.solicitante?.nome} folga em{" "}
                    {format(new Date(t.data_proposta + "T00:00:00"), "dd/MM (EEE)", { locale: ptBR })}
                    {" · "}
                    {souDestino ? "você" : t.destino?.nome} folga em{" "}
                    {format(new Date(t.data_original + "T00:00:00"), "dd/MM (EEE)", { locale: ptBR })}
                  </p>
                  {trocaDireta ? (
                    t.status === "aprovada" && (
                      <p className="mt-1 text-[11px] font-medium text-muted-foreground">Aprovada entre colegas</p>
                    )
                  ) : (
                    <div className="flex items-center gap-1 mt-1 text-[11px]">
                      <StepBadge label="Colega" state={
                        t.colega_resposta === "aprovada" ? "ok"
                        : t.colega_resposta === "recusada" ? "no"
                        : t.status === "pendente_colega" ? "cur" : "wait"
                      } />
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <StepBadge label="Gestor" state={
                        t.gestor_resposta === "aprovada" ? "ok"
                        : t.gestor_resposta === "recusada" ? "no"
                        : t.status === "pendente_gestor" ? "cur" : "wait"
                      } />
                    </div>
                  )}
                </CardHeader>
                <CardContent className="space-y-2">
                  {t.motivo && <TextoExpansivel texto={t.motivo} className="text-sm" />}
                  {!trocaDireta && textoDecisaoGestor(t.gestor_resposta) && (
                    <div className="rounded-lg border border-border/60 bg-muted/40 p-2.5 text-xs">
                      <span className="mb-0.5 block font-semibold uppercase tracking-wide text-[10px] text-muted-foreground">
                        {t.status === "expirada"
                          ? "Solicitação expirada"
                          : t.status === "cancelada"
                            ? "Cancelada pelo gestor"
                            : t.status === "recusada"
                              ? "Recusada pelo gestor"
                              : "Observação do gestor"}
                      </span>
                      "{textoDecisaoGestor(t.gestor_resposta)}"
                    </div>
                  )}

                  {(podeResponderColega || podeCancelar) && (
                    <div className="flex gap-2 pt-1 flex-wrap">
                      {podeResponderColega && (
                        <>
                          {(() => {
                            // Quem aceita cede a data proposta e passa a folgar na data original.
                            const r = avaliarRiscoDsrTroca({
                              descansoIso: meusDescansos,
                              diaCedidoIso: t.data_proposta,
                              diaNovoIso: t.data_original,
                            });
                            const botao = (
                              <Button size="sm" disabled={responderColega.isPending}
                                >
                                <Check className="h-4 w-4 mr-1" /> Aceitar
                              </Button>
                            );
                            return (
                              <ConfirmarAcaoDialog
                                titulo={r.risco ? "Atenção à regra de descanso semanal" : "Confirmar troca de folga"}
                                descricao={`${r.risco ? `${avisoDsr(r.sequencia)} Ao aceitar, você declara: "Estou ciente da regra trabalhista de descanso e aceito a troca por livre iniciativa." O gestor será avisado. ` : ""}${TEXTO_CIENCIA_FALTA_TROCA}`}
                                confirmar="Estou ciente — assinar"
                                cancelar="Voltar"
                                destrutivo={false}
                                onConfirm={() => setAssinarAceite({ id: t.id, risco: !!r.risco, sequencia: r.sequencia, data: t.data_proposta })}
                                disabled={responderColega.isPending}
                              >
                                {botao}
                              </ConfirmarAcaoDialog>
                            );
                          })()}
                          <ConfirmarAcaoDialog
                            titulo="Recusar esta troca?"
                            descricao="O colega será avisado de que você não aceitou trocar essa folga. Não é possível desfazer."
                            confirmar="Recusar troca"
                            onConfirm={() => responderColega.mutate({ id: t.id, aceito: false })}
                            disabled={responderColega.isPending}
                          >
                            <Button size="sm" variant="outline" disabled={responderColega.isPending}>
                              <X className="h-4 w-4 mr-1" /> Recusar
                            </Button>
                          </ConfirmarAcaoDialog>
                        </>
                      )}
                      {podeCancelar && (
                        <ConfirmarAcaoDialog
                          titulo="Cancelar esta troca?"
                          descricao="A proposta deixa de valer e você precisará fazer outra se mudar de ideia."
                          confirmar="Cancelar troca"
                          onConfirm={() => cancelar.mutate(t.id)}
                          disabled={cancelar.isPending}
                        >
                          <Button size="sm" variant="ghost" disabled={cancelar.isPending}>
                            <Ban className="h-4 w-4 mr-1" /> Cancelar
                          </Button>
                        </ConfirmarAcaoDialog>
                      )}

                    </div>
                  )}

                  {t.status === "aprovada" && (
                    <div className="pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={empresaRef.isLoading}
                        onClick={() => setTermo(t)}
                      >
                        <FileText className="h-4 w-4 mr-1" /> Ver termo da troca
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
        <TermoTrocaPreviewDialog
          troca={termo}
          empresa={{ nome: empresaRef.data?.nome ?? "Empresa" }}
          onOpenChange={(v) => !v && setTermo(null)}
        />
      )}
    <AssinaturaConfirmarDialog
        open={assinarPedido}
        onOpenChange={setAssinarPedido}
        titulo="Pedido de troca de folga — sua assinatura digital fica registrada no termo da troca."
        nome={(meRef.data as any)?.nome ?? ""}
        enviando={criar.isPending}
        onConfirmar={(png) => criar.mutate(png)}
      />
      <AssinaturaConfirmarDialog
        open={!!assinarAceite}
        onOpenChange={(v) => !v && setAssinarAceite(null)}
        titulo="Aceite da troca de folga — sua assinatura digital fica registrada no termo da troca."
        nome={(meRef.data as any)?.nome ?? ""}
        enviando={responderColega.isPending}
        onConfirmar={(png) => {
          const a = assinarAceite!;
          responderColega.mutate(
            { id: a.id, aceito: true, assinatura: png },
            {
              onSuccess: () => {
                setAssinarAceite(null);
                if (a.risco) void registrarCienciaDsr({ papel: "destino", tabela: "dp_trocas", referenciaId: a.id, data: a.data, dias: a.sequencia });
              },
            },
          );
        }}
      />
    </DpPage>
  );
}

function StepBadge({ label, state }: { label: string; state: "ok" | "no" | "cur" | "wait" }) {
  const cls =
    state === "ok" ? "bg-green-500/15 text-green-700 border-green-300"
    : state === "no" ? "bg-red-500/15 text-red-700 border-red-300"
    : state === "cur" ? "bg-primary/15 text-primary border-primary/40 ring-1 ring-primary/30"
    : "bg-muted text-muted-foreground border-transparent";
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5", cls)}>{label}</span>
  );
}


