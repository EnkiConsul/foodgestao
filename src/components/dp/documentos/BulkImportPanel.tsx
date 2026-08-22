import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Upload, Loader2, Check, X, ChevronDown, ChevronRight, RefreshCw, ExternalLink, AlertTriangle, Eye, Trash2, Info,
} from "lucide-react";
import {
  statusLabel, MobileDetailsSheet,
} from "@/components/dp/MobileCardKit";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { DpFilterCard } from "@/components/dp/DpPage";
import { cn } from "@/lib/utils";
import { BulkReviewDialog } from "./BulkReviewDialog";
import { BulkReviewInline } from "./BulkReviewInline";
import { NovoColaboradorInlineDialog } from "./NovoColaboradorInlineDialog";
import { DP_DOC_TIPOS_IMPORTAVEIS, docTipoLabel } from "@/lib/dp/documentoTipos";

const AUTO_TIPO = "__auto";

const TIPO_OPTS = [
  { v: AUTO_TIPO, l: "Detectar Automaticamente (Lote Misto)" },
  ...DP_DOC_TIPOS_IMPORTAVEIS.map((t) => ({ v: t.value, l: t.label })),
];

const MAX_SIZE_MB = 20;

export interface BulkImportPanelProps {
  /** Fixa o tipo do lote e esconde o seletor. */
  tipoFixed?: string;
  /** Fixa a referência (YYYY-MM-DD ou YYYY-MM) e esconde o input. */
  referenciaFixed?: string;
  /** Filtra os lotes listados por tipo (default: usa tipoFixed se houver). */
  filterByTipo?: boolean;
  /** Título do card de upload. */
  title?: string;
}

export function BulkImportPanel({
  tipoFixed,
  referenciaFixed,
  filterByTipo = !!tipoFixed,
  title = "Importação em massa (PDF com várias páginas)",
}: BulkImportPanelProps) {
  const qc = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  const { data: colaboradores = [] } = useDpColaboradores();

  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [tipo, setTipo] = useState<string>(tipoFixed ?? AUTO_TIPO);
  const [referencia, setReferencia] = useState<string>(referenciaFixed ?? "");
  const [uploading, setUploading] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [batchLimit, setBatchLimit] = useState<number>(20);
  const [reviewBatch, setReviewBatch] = useState<{ id: string; name?: string } | null>(null);
  const [detailsBatch, setDetailsBatch] = useState<any | null>(null);

  useEffect(() => { if (tipoFixed) setTipo(tipoFixed); }, [tipoFixed]);
  useEffect(() => { if (referenciaFixed) setReferencia(referenciaFixed); }, [referenciaFixed]);
  useEffect(() => {
    if (!selectedCompanyId) return;
    supabase.functions.invoke("dp-doc-bulk-discard", {
      body: { cleanup_abandoned: true, company_id: selectedCompanyId },
    }).then(({ data }) => {
      if ((data as any)?.removed) qc.invalidateQueries({ queryKey: ["dp_bulk_batches"] });
    });
  }, [selectedCompanyId, qc]);

  const batches = useQuery({
    queryKey: ["dp_bulk_batches", selectedCompanyId, batchLimit, filterByTipo ? tipoFixed : "all"],
    enabled: !!selectedCompanyId,
    refetchInterval: (q) => {
      const rows = (q.state.data as any[] | undefined) ?? [];
      return rows.some((b) => b.status === "processing") ? 1500 : false;
    },
    queryFn: async () => {
      let query = supabase
        .from("dp_bulk_import_batches" as any)
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .order("created_at", { ascending: false })
        .limit(batchLimit);
      if (filterByTipo && tipoFixed) query = query.eq("tipo", tipoFixed);
      const { data, error } = await query;
      if (error) throw error;
      return data as any[];
    },
  });

  const filteredBatches = useMemo(() => {
    return (batches.data ?? []).filter((b) => statusFilter === "all" ? true : b.status === statusFilter);
  }, [batches.data, statusFilter]);

  const openedIds = Object.keys(expanded).filter((k) => expanded[k]);
  const anyBatchProcessing = (batches.data ?? []).some(
    (b) => b.status === "processing" && expanded[b.id],
  );
  const items = useQuery({
    queryKey: ["dp_bulk_items", openedIds],
    enabled: openedIds.length > 0,
    refetchInterval: anyBatchProcessing ? 1500 : false,
    queryFn: async () => {
      if (!openedIds.length) return [];
      const { data, error } = await supabase
        .from("dp_bulk_import_items" as any)
        .select("*")
        .in("batch_id", openedIds)
        .order("page_index", { ascending: true });
      if (error) throw error;
      return data as any[];
    },
  });

  const pickFile = (f: File | null) => {
    if (!f) return;
    if (f.type !== "application/pdf") return toast.error("Envie um arquivo PDF");
    if (f.size > MAX_SIZE_MB * 1024 * 1024)
      return toast.error(`Arquivo excede ${MAX_SIZE_MB}MB`);
    setFile(f);
  };

  const upload = useMutation({
    mutationFn: async () => {
      if (!file || !selectedCompanyId) throw new Error("Selecione um arquivo PDF");
      setUploading(true);

      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) throw new Error("Não autenticado");

      const provisional = `${selectedCompanyId}/pending_${Date.now()}.pdf`;
      const insertRes = await (supabase.from("dp_bulk_import_batches" as any) as any)
        .insert({
          company_id: selectedCompanyId,
          tipo: tipo === AUTO_TIPO ? "outros" : tipo,
          deteccao_automatica: tipo === AUTO_TIPO,
          source_file_path: provisional,
          source_file_name: file.name,
          referencia_data: competenciaToDate(referencia),
          status: "processing",
          uploaded_by: uid,
        })
        .select("id")
        .single();
      if (insertRes.error) throw insertRes.error;
      const batch = insertRes.data as { id: string };

      const finalPath = `${selectedCompanyId}/${batch.id}/source.pdf`;
      const up = await supabase.storage.from("dp-bulk-import").upload(finalPath, file, {
        contentType: "application/pdf", upsert: true,
      });
      if (up.error) throw up.error;

      await (supabase.from("dp_bulk_import_batches" as any) as any)
        .update({ source_file_path: finalPath }).eq("id", batch.id);

      // Auto-expande o lote novo para o usuário ver o progresso em tempo real
      setExpanded((s) => ({ ...s, [batch.id]: true }));

      // Dispara a Edge Function; ela retorna 202 imediatamente e processa em background.
      // Não bloqueamos aqui — o polling atualiza a UI.
      supabase.functions
        .invoke("dp-doc-bulk-ingest", { body: { batch_id: batch.id } })
        .then(({ error: iErr }) => {
          if (iErr) {
            (supabase.from("dp_bulk_import_batches" as any) as any)
              .update({ status: "failed", error_message: iErr.message ?? "Falha ao processar" })
              .eq("id", batch.id)
              .then(() => {
                qc.invalidateQueries({ queryKey: ["dp_bulk_batches"] });
              });
          }
        });

      return { batch_id: batch.id };
    },
    onSuccess: () => {
      toast.success("PDF enviado — processando páginas em segundo plano");
      setFile(null);
      qc.invalidateQueries({ queryKey: ["dp_bulk_batches"] });
      qc.invalidateQueries({ queryKey: ["dp_bulk_pending_counts"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao enviar"),
    onSettled: () => setUploading(false),
  });

  const setColab = useMutation({
    mutationFn: async ({ id, colaborador_id }: { id: string; colaborador_id: string | null }) => {
      const { error } = await supabase.from("dp_bulk_import_items" as any).update({
        matched_colaborador_id: colaborador_id,
        manual_override: true,
        confidence: colaborador_id ? 1.0 : 0,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dp_bulk_items"] }),
    onError: (e: any) => toast.error(e?.message ?? "Falha"),
  });

  const reject = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_bulk_import_items" as any)
        .update({ status: "rejected", decided_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dp_bulk_items"] });
      qc.invalidateQueries({ queryKey: ["dp_bulk_batches"] });
      qc.invalidateQueries({ queryKey: ["dp_bulk_pending_counts"] });
    },
  });

  const approve = useMutation({
    mutationFn: async (item_ids: string[]) => {
      const { data, error } = await supabase.functions.invoke("dp-doc-bulk-approve", {
        body: { item_ids },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (r: any) => {
      const results = (r?.results ?? []) as Array<{ ok: boolean; error?: string }>;
      const okc = results.filter((x) => x.ok).length;
      const dup = results.filter((x) => !x.ok && x.error === "duplicate").length;
      const other = results.filter((x) => !x.ok && x.error !== "duplicate").length;
      const parts = [`${okc} importado(s)`];
      if (dup) parts.push(`${dup} duplicado(s)`);
      if (other) parts.push(`${other} falha(s)`);
      toast.success(parts.join(", "));
      qc.invalidateQueries({ queryKey: ["dp_bulk_items"] });
      qc.invalidateQueries({ queryKey: ["dp_bulk_batches"] });
      qc.invalidateQueries({ queryKey: ["dp_bulk_pending_counts"] });
      qc.invalidateQueries({ queryKey: ["dp_documentos"] });
      qc.invalidateQueries({ queryKey: ["dp_doc_counts"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao importar"),
  });

  const discardBatch = useMutation({
    mutationFn: async (batch_id: string) => {
      const { data, error } = await supabase.functions.invoke("dp-doc-bulk-discard", {
        body: { batch_id },
      });
      if (error) throw error;
      const payload = data as { error?: string } | null;
      if (payload?.error) throw new Error(payload.error);
    },
    onSuccess: () => {
      toast.success("Lote descartado");
      qc.invalidateQueries({ queryKey: ["dp_bulk_items"] });
      qc.invalidateQueries({ queryKey: ["dp_bulk_batches"] });
      qc.invalidateQueries({ queryKey: ["dp_bulk_pending_counts"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao descartar lote"),
  });

  const openPage = async (path: string) => {
    const { data } = await supabase.storage.from("dp-bulk-import").createSignedUrl(path, 300);
    if (!data?.signedUrl) return;
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.rel = "noopener noreferrer";
    a.target = "_blank";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  return (
    <div className="space-y-4">
      <DpFilterCard>
        <div className="space-y-3">
          <h2 className="text-base font-semibold">{title}</h2>

          <label
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault(); setDragOver(false);
              pickFile(e.dataTransfer.files?.[0] ?? null);
            }}
            className={cn(
              "block cursor-pointer rounded-xl border-2 border-dashed transition-colors px-6 py-10 text-center",
              dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
            )}
          >
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
            <Upload className="size-8 mx-auto text-muted-foreground" />
            <div className="mt-3 text-sm">
              {file ? <span className="font-medium">{file.name}</span> : "Arraste um PDF ou clique para selecionar"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              PDF até {MAX_SIZE_MB}MB · máx. 60 páginas por lote · OCR via IA
            </div>
          </label>

          <div className={cn(
            "grid gap-3",
            (!tipoFixed && !referenciaFixed) ? "md:grid-cols-2" : "",
          )}>
            {!tipoFixed && (
              <div className="space-y-1">
                <Label>Natureza do documento</Label>
                <Select value={tipo} onValueChange={setTipo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TIPO_OPTS.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  {tipo === AUTO_TIPO
                    ? "O sistema identifica a natureza de cada página (contracheque, 13º, férias, ponto…). Você confere antes de salvar."
                    : "Todas as páginas do PDF serão salvas com esta natureza."}
                </p>
              </div>
            )}
            {!referenciaFixed && (
              <div className="space-y-1">
                <Label>Referência (mês/ano) — opcional</Label>
                <Input
                  type="month"
                  value={referencia}
                  placeholder="Detectada do PDF automaticamente"
                  onChange={(e) => setReferencia(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  Se em branco, o sistema tenta detectar do próprio PDF.
                </p>
              </div>
            )}
          </div>

          <Button onClick={() => upload.mutate()} disabled={!file || uploading} className="w-full">
            {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            Processar PDF
          </Button>
        </div>
      </DpFilterCard>

      <Card className="dp-content-card">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Lotes recentes</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40 h-8"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos status</SelectItem>
                <SelectItem value="processing">Processando</SelectItem>
                <SelectItem value="ready">Pronto</SelectItem>
                <SelectItem value="partially_imported">Parcial</SelectItem>
                <SelectItem value="imported">Importado</SelectItem>
                <SelectItem value="failed">Falhou</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="ghost" onClick={() => batches.refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {batches.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {filteredBatches.length === 0 && !batches.isLoading && (
            <p className="text-sm text-muted-foreground">Nenhum lote encontrado.</p>
          )}
          {filteredBatches.map((b) => {
            const bItems = (items.data ?? []).filter((i) => i.batch_id === b.id);
            const pending = bItems.filter((i) => i.status === "pending" && i.matched_colaborador_id);
            const isOpen = !!expanded[b.id];
            const totalPag = b.total_pages ?? 0;
            const processed = b.processed_pages ?? 0;
            const importadas = bItems.filter((i) => i.status === "imported").length;
            const isProcessing = b.status === "processing";
            const canDiscard = importadas === 0 && b.status !== "imported" && b.status !== "partially_imported";
            return (
              <div key={b.id} className="border rounded-md">
                <button
                  type="button"
                  className="w-full flex items-start justify-between gap-2 p-3 text-left hover:bg-muted/50"
                  onClick={() => setExpanded((s) => ({ ...s, [b.id]: !s[b.id] }))}
                >
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 mt-0.5" /> : <ChevronRight className="h-4 w-4 shrink-0 mt-0.5" />}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{b.source_file_name ?? b.id.slice(0, 8)}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {b.deteccao_automatica ? "Misto (detecção automática)" : docTipoLabel(b.tipo)} ·{" "}
                        {isProcessing && totalPag > 0
                          ? `OCR ${processed}/${totalPag}`
                          : `${totalPag} pág · ${b.matched_count ?? 0} vinc.`}
                        {isOpen && bItems.length > 0 ? ` · ${importadas}/${totalPag} imp.` : ""}
                      </div>
                      <div className="hidden md:block text-xs text-muted-foreground truncate">
                        {new Date(b.created_at).toLocaleString("pt-BR")}
                      </div>
                      {b.error_message && (
                        <div className="text-xs text-destructive mt-0.5 flex items-center gap-1 truncate">
                          <AlertTriangle className="h-3 w-3 shrink-0" /> <span className="truncate">{b.error_message}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!isProcessing && totalPag > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label="Revisar lote"
                        title="Revisar"
                        className="h-9 w-9 md:w-auto md:px-3 p-0 md:p-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          setReviewBatch({ id: b.id, name: b.source_file_name });
                        }}
                      >
                        <Eye className="h-4 w-4 md:mr-1" />
                        <span className="hidden md:inline">Revisar</span>
                      </Button>
                    )}
                    {canDiscard && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            aria-label="Descartar lote"
                            title="Descartar"
                            className="h-9 w-9 md:w-auto md:px-3 p-0 md:p-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Trash2 className="h-4 w-4 md:mr-1" />
                            <span className="hidden md:inline">Descartar</span>
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Descartar lote?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Este lote ainda não salvou documentos finais. Os arquivos temporários e páginas processadas serão removidos.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => discardBatch.mutate(b.id)}>
                              Descartar lote
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Detalhes do lote"
                      title="Detalhes"
                      className="h-9 w-9 md:hidden"
                      onClick={(e) => { e.stopPropagation(); setDetailsBatch(b); }}
                    >
                      <Info className="h-4 w-4" />
                    </Button>
                    <Badge
                      variant={
                        b.status === "imported" ? "default"
                        : b.status === "failed" ? "destructive"
                        : "secondary"
                      }
                      className="whitespace-nowrap"
                    >
                      {isProcessing && <Loader2 className="h-3 w-3 mr-1 animate-spin inline" />}
                      {statusLabel(b.status)}
                    </Badge>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t p-3">
                    <BulkReviewInline
                      batchId={b.id}
                      batchName={b.source_file_name}
                      onOpenFullscreen={() => setReviewBatch({ id: b.id, name: b.source_file_name })}
                    />
                  </div>
                )}
              </div>
            );
          })}
          {batches.data && batches.data.length >= batchLimit && (
            <div className="flex justify-center pt-2">
              <Button size="sm" variant="outline" onClick={() => setBatchLimit((n) => n + 20)}>
                Carregar mais
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {reviewBatch && (
        <BulkReviewDialog
          open={!!reviewBatch}
          onOpenChange={(o) => !o && setReviewBatch(null)}
          batchId={reviewBatch.id}
          batchName={reviewBatch.name}
        />
      )}

      <MobileDetailsSheet
        open={!!detailsBatch}
        onOpenChange={(o) => !o && setDetailsBatch(null)}
        title={detailsBatch?.source_file_name ?? detailsBatch?.id?.slice(0, 8) ?? "Lote"}
        description="Detalhes do lote de importação"
        meta={detailsBatch ? [
          { label: "Tipo", value: detailsBatch.tipo ?? "—" },
          { label: "Status", value: statusLabel(detailsBatch.status) },
          { label: "Páginas", value: `${detailsBatch.processed_pages ?? 0}/${detailsBatch.total_pages ?? 0}` },
          { label: "Vinculadas", value: detailsBatch.matched_count ?? 0 },
          { label: "Criado em", value: new Date(detailsBatch.created_at).toLocaleString("pt-BR") },
          ...(detailsBatch.error_message ? [{ label: "Erro", value: detailsBatch.error_message }] : []),
        ] : []}
        footer={detailsBatch ? (
          <div className="flex gap-2 w-full">
            {detailsBatch.total_pages > 0 && detailsBatch.status !== "processing" && (
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setReviewBatch({ id: detailsBatch.id, name: detailsBatch.source_file_name });
                  setDetailsBatch(null);
                }}
              >
                <Eye className="h-4 w-4 mr-1" /> Revisar
              </Button>
            )}
            {(detailsBatch.status !== "imported" && detailsBatch.status !== "partially_imported") && (
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  discardBatch.mutate(detailsBatch.id);
                  setDetailsBatch(null);
                }}
              >
                <Trash2 className="h-4 w-4 mr-1" /> Descartar
              </Button>
            )}
          </div>
        ) : null}
      />
    </div>
  );
}

function competenciaToDate(value: string): string | null {
  if (!value) return null;
  if (/^20\d{2}-(0[1-9]|1[0-2])$/.test(value)) return `${value}-01`;
  if (/^20\d{2}-(0[1-9]|1[0-2])-\d{2}$/.test(value)) return value;
  return null;
}
