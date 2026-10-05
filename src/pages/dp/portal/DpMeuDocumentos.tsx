import { useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Download, FileText, Eye, Ban, ChevronDown, SlidersHorizontal,
  CheckCircle2, Clock, XCircle, HeartPulse, ShieldAlert, Scale, Coins, FileClock, Files, PenLine, Printer,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useMeusDocumentos, type UnifiedDoc, type UnifiedTipo } from "@/hooks/portal/useMeusDocumentos";
import { Button } from "@/components/ui/button";
import { usePortalAcesso } from "@/hooks/usePortalAcesso";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { DOCUMENTO_CONFIRMACAO_TEXTO } from "@/lib/dp/documento-titulo";
import { certificadoValidacaoPdf } from "@/lib/dp/documento-certificado";
import { abrirArquivoDp } from "@/lib/dp/abrirDocumento";
import { linkDocumentoAssinado } from "@/lib/documentoArquivo";
import { Receipt } from "lucide-react";
import { ColaboradorDocumentosPanel } from "@/components/dp/documentos/ColaboradorDocumentosPanel";
import { DocumentPreview } from "@/components/dp/DocumentPreview";
import { cn } from "@/lib/utils";
import { DpContentCard, DpEmptyState, DpFilterCard, DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { DpErrorState } from "@/components/dp/DpErrorState";
import { CardListSkeleton } from "@/components/dp/DpSkeletons";
import { ConfirmarAcaoDialog } from "@/components/dp/ConfirmarAcaoDialog";

import type { Database } from "@/integrations/supabase/types";
import { notifyError } from "@/lib/notifyError";
import { assinarDocumento } from "@/lib/dp/documentoAceite";
import { AssinaturaConfirmarDialog } from "@/components/dp/portal/AssinaturaConfirmarDialog";
import { excluirDocumento } from "@/lib/dp/documentos-oficial";

type Tipo = Database["public"]["Enums"]["dp_documento_tipo"];

const TIPO_ICON: Record<UnifiedTipo, any> = {
  contracheque: FileText,
  contracheque_13: FileText,
  contracheque_ferias: FileText,
  aviso_ferias: FileText,
  recibo_ferias: FileText,
  informe_rendimentos: FileText,
  adiantamento: Coins,
  ponto: FileClock,
  atestado: HeartPulse,
  disciplinar: ShieldAlert,
  act_cct: Scale,
  contrato: FileText,
  admissao: FileText,
  desligamento: FileText,
  ferias: FileText,
  recibo_pagamento: Receipt,
  outros: Files,
};

const MESES = ["Todos", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// Tabs types (ordem padrão do portal)
const ALL_TABS: { key: "all" | UnifiedTipo; label: string; requiresPonto?: boolean; hasEnvio?: boolean }[] = [
  { key: "all", label: "Todos" },
  { key: "contracheque", label: "Contracheques" },
  { key: "contracheque_13", label: "13º Salário" },
  { key: "contracheque_ferias", label: "Contracheque Férias" },
  { key: "aviso_ferias", label: "Aviso de Férias" },
  { key: "recibo_ferias", label: "Recibo de Férias" },
  { key: "informe_rendimentos", label: "Informe de Rendimentos" },
  { key: "adiantamento", label: "Adiantamentos" },
  { key: "ponto", label: "Folha de Ponto", requiresPonto: true },
  { key: "atestado", label: "Atestados", hasEnvio: true },
  { key: "disciplinar", label: "Disciplinar" },
  { key: "act_cct", label: "ACT/CCT" },
  { key: "admissao", label: "Admissão" },
  { key: "desligamento", label: "Desligamento" },
  { key: "recibo_pagamento", label: "Recibos de Pagamento" },
  { key: "outros", label: "Outros", hasEnvio: true },
];

const BUCKET = "dp-documentos";

export default function DpMeuDocumentos() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { colaborador, possuiPonto, documentos, isLoading, isError, refetch } = useMeusDocumentos();

  const [params, setParams] = useSearchParams();
  /** Quando a pendência aponta para cá, o foco vai direto para o checklist pessoal. */
  const focoPendencias = params.get("foco") === "pendencias";
  const checklistRef = useRef<HTMLDivElement>(null);
  const initialTab = params.get("tipo") ?? "all";
  const [tab, setTab] = useState<string>(initialTab);
  const [origem, setOrigem] = useState<"dp" | "meu_envio">("dp");
  const [filtroMes, setFiltroMes] = useState("todos");
  const [filtroAno, setFiltroAno] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [search, setSearch] = useState("");

  const [preview, setPreview] = useState<UnifiedDoc | null>(null);
  /** Filtros recolhidos por padrão no celular — a lista aparece primeiro. */
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const { somenteDocumentos } = usePortalAcesso();

  const visibleTabs = useMemo(
    () => ALL_TABS.filter((t) => !t.requiresPonto || possuiPonto),
    [possuiPonto]
  );

  const currentTab = useMemo(
    () => visibleTabs.find((t) => t.key === tab) ?? visibleTabs[0],
    [visibleTabs, tab]
  );

  useEffect(() => {
    if (!focoPendencias || isLoading) return;
    const t = setTimeout(() => {
      checklistRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 250);
    return () => clearTimeout(t);
  }, [focoPendencias, isLoading]);

  /**
   * Pendência de assinatura aponta para ?doc=<id>: abre o próprio documento,
   * já visível, em vez de largar o colaborador na lista.
   */
  const docFoco = params.get("doc");
  const abriuFoco = useRef(false);
  useEffect(() => {
    if (!docFoco || isLoading || abriuFoco.current) return;
    const alvo = documentos.find((d) => d.meta?.originalId === docFoco || d.id === docFoco);
    if (!alvo) return;
    abriuFoco.current = true;
    setTab("all");
    setPreview(alvo);
  }, [docFoco, isLoading, documentos]);

  const changeTab = (v: string) => {
    setTab(v);
    setOrigem("dp");
    const next = new URLSearchParams(params);
    if (v === "all") next.delete("tipo");
    else next.set("tipo", v);
    setParams(next, { replace: true });
  };

  const anos = useMemo(() => {
    const s = new Set<string>();
    for (const d of documentos) if (d.competencia_sort) s.add(d.competencia_sort.slice(0, 4));
    return Array.from(s).sort((a, b) => (a < b ? 1 : -1));
  }, [documentos]);

  const filtered = useMemo(() => {
    return documentos.filter((d) => {
      // filtro por tipo
      if (currentTab.key !== "all" && d.tipo_key !== currentTab.key) return false;
      // sub-tab origem (só quando tipo tem envio)
      if (currentTab.hasEnvio) {
        if (origem === "dp" && d.origem !== "dp") return false;
        if (origem === "meu_envio" && d.origem !== "meu_envio") return false;
      }
      if (filtroMes !== "todos" && d.competencia_sort.slice(5, 7) !== filtroMes) return false;
      if (filtroAno !== "todos" && d.competencia_sort.slice(0, 4) !== filtroAno) return false;
      if (filtroStatus !== "todos" && d.status_key !== filtroStatus) return false;
      if (search) {
        const t = search.toLowerCase();
        if (!d.titulo.toLowerCase().includes(t) && !d.tipo_label.toLowerCase().includes(t))
          return false;
      }
      return true;
    });
  }, [documentos, currentTab, origem, filtroMes, filtroAno, filtroStatus, search]);

  const statusOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of filtered) m.set(d.status_key, d.status_label);
    return Array.from(m.entries());
  }, [filtered]);

  /** Quantos filtros estão em uso — mostrado no botão "Filtrar" do celular. */
  const filtrosAtivos = useMemo(
    () =>
      [search.trim() !== "", filtroMes !== "todos", filtroAno !== "todos", filtroStatus !== "todos"].filter(
        Boolean,
      ).length,
    [search, filtroMes, filtroAno, filtroStatus],
  );




  const download = async (d: UnifiedDoc) => {
    if (!d.file_path) return toast.warning("Sem arquivo anexado.");
    const r = await abrirArquivoDp({
      bucket: d.bucket,
      path: d.file_path,
      mimeType: d.mime_type,
      fileName: d.arquivo_nome,
    });
    if (r.ok) return;
    if (r.motivo === "bloqueado") return toast.error("Libere as janelas pop-up para abrir o documento.");
    if (r.motivo === "sem_permissao")
      return toast.error("Não conseguimos abrir este arquivo. Avise o DP para reenviá-lo.");
    toast.error("Não foi possível abrir o documento agora. Tente novamente.");
  };


  /** Aceite digital do documento — registra data, hora e dispositivo. */
  const [assinando, setAssinando] = useState<UnifiedDoc | null>(null);
  const aceitar = useMutation({
    mutationFn: async ({ d, assinatura }: { d: UnifiedDoc; assinatura: string }) => {
      if (!colaborador) throw new Error("Colaborador não encontrado");
      const documentoId = d.meta?.originalId as string | undefined;
      if (!documentoId) throw new Error("Documento inválido");
      await assinarDocumento(documentoId, assinatura);
    },
    onSuccess: () => {
      setAssinando(null);
      toast.success("Documento aprovado", {
        description: "Registramos data, hora e dispositivo da sua aprovação.",
      });
      qc.invalidateQueries({ queryKey: ["dp_meus_documentos_unified"] });
    },
    onError: (e: any) => notifyError(e, { surface: "Meus documentos", action: "concluir a ação", fallback: "Erro ao registrar o aceite" }),
  });

  /**
   * Certificado de validação: PDF montado no servidor com o documento
   * assinado e o comprovante anexado, aberto aqui mesmo (no celular, abrir
   * outra aba é bloqueado).
   */
  const [arquivoAberto, setArquivoAberto] = useState<
    { url: string; titulo: string; mime?: string; revogar?: () => void } | null
  >(null);
  const [gerando, setGerando] = useState<string | null>(null);

  const certificado = async (d: UnifiedDoc) => {
    const documentoId = String(d.meta?.originalId ?? d.id);
    setGerando(d.id);
    try {
      const { url, revogar } = await certificadoValidacaoPdf(documentoId);
      setArquivoAberto({ url, titulo: `Certificado de validação — ${d.titulo}`, mime: "application/pdf", revogar });
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível gerar o certificado agora.");
    } finally {
      setGerando(null);
    }
  };

  /** Comprovante de pagamento na própria tela, com baixar e imprimir. */
  const verComprovante = async (d: UnifiedDoc) => {
    const documentoId = String(d.meta?.originalId ?? d.id);
    const link = await linkDocumentoAssinado(documentoId, 300, "comprovante");
    if (!link) {
      toast.error("Não foi possível abrir o comprovante agora.");
      return;
    }
    setArquivoAberto({
      url: link.url,
      titulo: `Comprovante de pagamento — ${link.fileName ?? d.titulo}`,
      mime: link.mimeType ?? undefined,
    });
  };

  const cancelar = useMutation({
    mutationFn: async (d: UnifiedDoc) => {
      if (d.meta?.source === "solicitacao") {
        const { error } = await supabase.rpc("dp_solicitacao_cancelar", { p_id: d.meta.originalId });
        if (error) throw error;
      } else {
        // O servidor só permite cancelar o próprio envio ainda pendente.
        await excluirDocumento(String(d.meta?.originalId), "Envio cancelado pelo colaborador");
        if (d.file_path) await supabase.storage.from(d.bucket).remove([d.file_path]);
      }
    },
    onSuccess: () => {
      toast.success("Envio cancelado");
      qc.invalidateQueries({ queryKey: ["dp_meus_documentos_unified"] });
    },
    onError: (e: any) => notifyError(e, { surface: "Meus documentos", action: "concluir a ação", fallback: "Erro ao cancelar" }),
  });

  return (
    <DpPage>
      <Helmet><title>Meus documentos — Portal</title></Helmet>
      {/*
        O colaborador não envia documento avulso por aqui: atestado vai pela tela
        de Atestados e os demais pelo checklist de pendências. Downloads em lote
        também saíram — cada documento tem o próprio botão de baixar.
      */}
      <DpPageHeader
        icon={FileText}
        title="Meus documentos"
        description="Todos os seus documentos em um único lugar."
      />

      {/* Tabs por tipo */}
      <Tabs value={tab} onValueChange={changeTab}>
        <DpFilterCard>
          <div className="-mx-1 overflow-x-auto">
            <TabsList className="flex-wrap md:flex-nowrap h-auto w-max md:w-auto">
              {visibleTabs.map((t) => (
                <TabsTrigger key={t.key} value={t.key} className="whitespace-nowrap">{t.label}</TabsTrigger>
              ))}
            </TabsList>
          </div>
        </DpFilterCard>
      </Tabs>

      {/* Sub-tabs origem (quando tipo tem envio) */}
      {currentTab.hasEnvio && (
        <Tabs value={origem} onValueChange={(v) => setOrigem(v as any)} className="mt-2">
          <div className="-mx-1 overflow-x-auto px-1">
            <TabsList className="w-max">
              <TabsTrigger value="dp" className="whitespace-nowrap">Recebidos do DP</TabsTrigger>
              <TabsTrigger value="meu_envio" className="whitespace-nowrap">Meus envios</TabsTrigger>
            </TabsList>
          </div>
        </Tabs>
      )}

      {/* Filtros — recolhidos no celular, sempre visíveis no desktop */}
      <DpFilterCard>
        <Button
          variant="outline"
          size="sm"
          className="flex w-full items-center justify-between md:hidden"
          onClick={() => setFiltrosAbertos((v) => !v)}
          aria-expanded={filtrosAbertos}
        >
          <span className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4" /> Filtrar
            {filtrosAtivos > 0 && (
              <Badge variant="secondary" className="ml-1">{filtrosAtivos}</Badge>
            )}
          </span>
          <ChevronDown className={cn("h-4 w-4 transition-transform", filtrosAbertos && "rotate-180")} />
        </Button>
        <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-4", filtrosAbertos ? "mt-3" : "hidden md:grid")}>
          <div>
            <Label className="text-xs">Buscar</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Título ou tipo…" />
          </div>
          <div>
            <Label className="text-xs">Mês</Label>
            <Select value={filtroMes} onValueChange={setFiltroMes}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {MESES.slice(1).map((m, i) => (
                  <SelectItem key={m} value={String(i + 1).padStart(2, "0")}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Ano</Label>
            <Select value={filtroAno} onValueChange={setFiltroAno}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {anos.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {statusOptions.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </DpFilterCard>


      {/* Lista */}
      {isError ? (
        <DpContentCard>
          <DpErrorState onRetry={() => refetch()} />
        </DpContentCard>
      ) : isLoading ? (
        <CardListSkeleton rows={4} />

      ) : filtered.length === 0 ? (
        <DpContentCard>
          <DpEmptyState icon={FileText}>Nenhum documento nesta categoria.</DpEmptyState>
        </DpContentCard>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 mt-2">
          {filtered.map((d) => {
            const Icon = TIPO_ICON[d.tipo_key] ?? FileText;
            return (
              <Card key={d.id} className="dp-content-card">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Icon className="size-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium truncate">{d.titulo}</p>
                        <StatusBadge d={d} />
                        {d.aceite === true && (
                          <Badge variant="outline" className="border-emerald-300 text-emerald-700 text-[11px]">
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Aprovado por você
                          </Badge>
                        )}
                        {d.origem === "dp" && d.meta?.comprovante && (
                          <Badge variant="outline" className="border-emerald-300 text-emerald-700 text-[11px]">
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Pagamento
                          </Badge>
                        )}
                        {d.aceite === false && (
                          <Badge variant="outline" className="border-amber-300 text-amber-700 text-[11px]">
                            <Clock className="h-3 w-3 mr-1" /> Aguardando sua aprovação
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        <span className="capitalize">{d.tipo_label}</span> · Competência {d.competencia_label}
                      </p>
                      {d.arquivo_nome && (
                        <p className="text-[11px] text-muted-foreground/80 mt-0.5 truncate">
                          Arquivo: {d.arquivo_nome}
                        </p>
                      )}
                      {d.motivo_recusao && (
                        <p className="text-xs text-destructive mt-1">Recusado: {d.motivo_recusao}</p>
                      )}
                      {d.aceite === false && (
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {DOCUMENTO_CONFIRMACAO_TEXTO}
                        </p>
                      )}
                      {d.observacao && !d.motivo_recusao && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{d.observacao}</p>
                      )}
                      <div className="flex gap-2 mt-3 flex-wrap">
                        <Button size="sm" variant="outline" onClick={() => (d.aceite === true && d.meta?.source !== "solicitacao" ? void certificado(d) : setPreview(d))} disabled={!d.file_path || gerando === d.id} className="min-h-9 flex-1 sm:flex-none">
                          <Eye className="h-4 w-4 mr-1" /> {gerando === d.id ? "Carregando validação..." : "Visualizar"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => download(d)} disabled={!d.file_path} className="min-h-9 flex-1 sm:flex-none">
                          <Download className="h-4 w-4 mr-1" /> Baixar
                        </Button>
                        {d.aceite === false && (
                          <Button
                            size="sm"
                            onClick={() => (d.file_path ? setPreview(d) : setAssinando(d))}
                            disabled={aceitar.isPending}
                            className="min-h-9 flex-1 sm:flex-none"
                          >
                            <PenLine className="h-4 w-4 mr-1" /> Ler e assinar
                          </Button>
                        )}
                        {d.origem === "meu_envio" && d.status_key === "pendente" && (
                          <ConfirmarAcaoDialog
                            titulo="Cancelar este envio?"
                            descricao="O documento sai da análise do setor de pessoas. Para reenviar, será preciso anexar o arquivo de novo."
                            confirmar="Cancelar envio"
                            cancelar="Manter"
                            onConfirm={() => cancelar.mutate(d)}
                            disabled={cancelar.isPending}
                          >
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={cancelar.isPending}
                              className="text-destructive min-h-9 flex-1 sm:flex-none"
                            >
                              <Ban className="h-4 w-4 mr-1" /> Cancelar
                            </Button>
                          </ConfirmarAcaoDialog>
                        )}

                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Meus documentos pessoais (envio e pendências) vêm depois dos documentos da empresa. */}
      <div
        ref={checklistRef}
        className={cn(
          "mt-6 scroll-mt-24",
          focoPendencias && "rounded-lg ring-2 ring-primary/60 ring-offset-2 ring-offset-background",
        )}
      >
        <ColaboradorDocumentosPanel colaboradorId={colaborador?.id ?? null} somenteEnvio ocultarConfig />
      </div>

      <DocumentPreview
        open={!!preview}
        onOpenChange={(v) => { if (!v) setPreview(null); }}
        title={preview?.titulo}
        bucket={preview?.bucket}
        path={preview?.file_path ?? undefined}
        mime={preview?.mime_type ?? undefined}
        comprovanteDocumentoId={preview?.origem === "dp" && preview?.meta?.comprovante ? String(preview.meta?.originalId ?? preview.id) : null}
        acaoRodape={preview?.aceite === false ? (
          <Button size="sm" onClick={() => { const d = preview; setPreview(null); setAssinando(d); }}>
            <PenLine className="h-4 w-4 mr-1" /> Assinar documento
          </Button>
        ) : undefined}
      />

      {/* Comprovante e certificado abrem aqui mesmo: no celular, outra aba é bloqueada. */}
      <DocumentPreview
        open={!!arquivoAberto}
        onOpenChange={(v) => {
          if (!v) {
            arquivoAberto?.revogar?.();
            setArquivoAberto(null);
          }
        }}
        title={arquivoAberto?.titulo}
        url={arquivoAberto?.url}
        mime={arquivoAberto?.mime}
      />

      <AssinaturaConfirmarDialog
        open={!!assinando}
        onOpenChange={(v) => { if (!v) setAssinando(null); }}
        titulo={assinando?.titulo ?? ""}
        nome={String(colaborador?.nome_social || colaborador?.nome || "")}
        enviando={aceitar.isPending}
        onConfirmar={(assinatura) => assinando && aceitar.mutate({ d: assinando, assinatura })}
      />
    </DpPage>
  );
}

export function StatusBadge(props: { d?: UnifiedDoc; status?: string }) {
  const k = (props.d?.status_key ?? props.status ?? "").toLowerCase();
  const label = props.d?.status_label
    ?? (k === "aprovado" || k === "aprovada" ? "Aprovado"
      : k === "recusado" || k === "recusada" ? "Recusado"
      : k === "pendente" ? "Pendente"
      : k === "disponivel" ? "Disponível"
      : k || "—");
  if (k === "aprovado" || k === "aprovada" || k === "disponivel")
    return <Badge className="bg-green-500/15 text-green-700 border border-green-300"><CheckCircle2 className="h-3 w-3 mr-1" />{label}</Badge>;
  if (k === "recusado" || k === "recusada")
    return <Badge className="bg-red-500/15 text-red-700 border border-red-300"><XCircle className="h-3 w-3 mr-1" />{label}</Badge>;
  if (k === "pendente")
    return <Badge className="bg-amber-500/15 text-amber-700 border border-amber-300"><Clock className="h-3 w-3 mr-1" />{label}</Badge>;
  return <Badge variant="outline">{label}</Badge>;
}
