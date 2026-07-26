import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, ChevronRight, X, Check, Loader2, AlertTriangle, ExternalLink, RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import * as pdfjsLib from "pdfjs-dist";
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { NovoColaboradorInlineDialog } from "./NovoColaboradorInlineDialog";
import { BulkProgressBanner } from "./BulkProgressBanner";
import { ConfirmarSubstituicaoDialog, type DuplicateCollision } from "./ConfirmarSubstituicaoDialog";
import { detectDuplicates } from "@/lib/dp/bulk-duplicates";
import { cn } from "@/lib/utils";

// Setup pdfjs worker once
(pdfjsLib as unknown as { GlobalWorkerOptions: { workerPort: Worker } })
  .GlobalWorkerOptions.workerPort ||= new PdfWorker();

export interface BulkReviewDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  batchId: string;
  batchName?: string;
}

export function BulkReviewDialog({ open, onOpenChange, batchId, batchName }: BulkReviewDialogProps) {
  const qc = useQueryClient();
  const { data: colaboradores = [] } = useDpColaboradores();
  const [currentIdx, setCurrentIdx] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewBoxRef = useRef<HTMLDivElement | null>(null);
  const [boxWidth, setBoxWidth] = useState(0);

  const [rendering, setRendering] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savingTotal, setSavingTotal] = useState(0);

  const batchInfo = useQuery({
    queryKey: ["dp_bulk_batch_info", batchId],
    enabled: open && !!batchId,
    refetchInterval: (q) => {
      const b = q.state.data as any;
      if (!b || b.status === "processing" || isSaving) return 900;
      return false;
    },
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_bulk_import_batches" as any)
        .select("id,status,total_pages,processed_pages,approved_count,company_id,tipo,referencia_data")
        .eq("id", batchId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const items = useQuery({
    queryKey: ["dp_bulk_items_review", batchId],
    enabled: open && !!batchId,
    refetchInterval: (q) => {
      const rows = (q.state.data as any[] | undefined) ?? [];
      const b = batchInfo.data as any;
      const total = b?.total_pages ?? 0;
      const notReady = !b || b.status === "processing";
      const missingRows = total > 0 && rows.length < total;
      return (notReady || missingRows || rows.length === 0) ? 1500 : false;
    },
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_bulk_import_items" as any)
        .select("*")
        .eq("batch_id", batchId)
        .order("page_index", { ascending: true });
      if (error) throw error;
      return data as any[];
    },
  });

  useEffect(() => {
    if (batchInfo.data?.status === "ready") {
      qc.invalidateQueries({ queryKey: ["dp_bulk_items_review", batchId] });
    }
  }, [batchInfo.data?.status, batchId, qc]);


  useEffect(() => {
    if (!open) setCurrentIdx(0);
  }, [open, batchId]);

  const rows = items.data ?? [];
  const current = rows[currentIdx];

  // Render PDF page preview via signed URL
  useEffect(() => {
  // Observa largura disponível para renderizar a página ajustada à largura
  useEffect(() => {
    const el = previewBoxRef.current;
    if (!el || !open) return;
    const update = () => setBoxWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, current?.id]);

  // Render PDF page preview via signed URL
  useEffect(() => {
    if (!open || !current?.page_file_path || !canvasRef.current || boxWidth <= 0) return;
    let cancelled = false;
    (async () => {
      try {
        setRendering(true);
        const { data } = await supabase.storage
          .from("dp-bulk-import")
          .createSignedUrl(current.page_file_path, 600);
        if (!data?.signedUrl || cancelled) return;
        const resp = await fetch(data.signedUrl);
        const buf = await resp.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: buf }).promise;
        const page = await doc.getPage(1);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const base = page.getViewport({ scale: 1 });
        const available = Math.max(160, boxWidth - 16);
        const viewport = page.getViewport({ scale: (available / base.width) * dpr });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width / dpr}px`;
        canvas.style.height = `${viewport.height / dpr}px`;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
      } catch (e) {
        console.error("preview render", e);
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, current?.page_file_path, current?.id, boxWidth]);


  const setColab = useMutation({
    mutationFn: async ({ id, colaborador_id }: { id: string; colaborador_id: string | null }) => {
      const { error } = await supabase.from("dp_bulk_import_items" as any).update({
        matched_colaborador_id: colaborador_id,
        manual_override: true,
        confidence: colaborador_id ? 1.0 : 0,
        status: colaborador_id ? "pending" : "pending",
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dp_bulk_items_review", batchId] }),
  });

  const setCompetencia = useMutation({
    mutationFn: async ({ id, competencia }: { id: string; competencia: string | null }) => {
      const { error } = await supabase.from("dp_bulk_import_items" as any).update({
        detected_competencia: normalizeCompetencia(competencia),
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dp_bulk_items_review", batchId] }),
  });

  const reject = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_bulk_import_items" as any)
        .update({ status: "rejected", decided_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dp_bulk_items_review", batchId] }),
  });

  const undo = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_bulk_import_items" as any)
        .update({ status: "pending", decided_at: null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dp_bulk_items_review", batchId] }),
  });

  const [confirmDup, setConfirmDup] = useState<{
    collisions: DuplicateCollision[];
    allIds: string[];
    nonDupIds: string[];
  } | null>(null);
  const [checkingDup, setCheckingDup] = useState(false);

  async function runApprove(item_ids: string[], on_duplicate: "skip" | "replace") {
    if (item_ids.length === 0) {
      toast.error("Nenhuma página elegível");
      return;
    }
    setSavingTotal(item_ids.length);
    setIsSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("dp-doc-bulk-approve", {
        body: { item_ids, on_duplicate },
      });
      if (error) throw error;
      const results = ((data as any)?.results ?? []) as Array<{ ok: boolean; error?: string; replaced?: boolean }>;
      const okc = results.filter((x) => x.ok && !x.replaced).length;
      const rep = results.filter((x) => x.ok && x.replaced).length;
      const dup = results.filter((x) => !x.ok && x.error === "duplicate").length;
      const other = results.filter((x) => !x.ok && x.error !== "duplicate").length;
      const parts = [`${okc} importado(s)`];
      if (rep) parts.push(`${rep} substituído(s)`);
      if (dup) parts.push(`${dup} duplicado(s) ignorado(s)`);
      if (other) parts.push(`${other} falha(s)`);
      toast.success(parts.join(", "));
      qc.invalidateQueries({ queryKey: ["dp_bulk_items_review", batchId] });
      qc.invalidateQueries({ queryKey: ["dp_bulk_items"] });
      qc.invalidateQueries({ queryKey: ["dp_bulk_batches"] });
      qc.invalidateQueries({ queryKey: ["dp_bulk_pending_counts"] });
      qc.invalidateQueries({ queryKey: ["dp_documentos"] });
      qc.invalidateQueries({ queryKey: ["dp_doc_counts"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao aprovar");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleApproveClick() {
    const eligible = rows.filter((r) => r.status === "pending" && r.matched_colaborador_id);
    if (eligible.length === 0) {
      toast.error("Nenhuma página vinculada");
      return;
    }
    const b = batchInfo.data as any;
    if (!b?.company_id || !b?.tipo) {
      toast.error("Lote incompleto — tente novamente em instantes");
      return;
    }
    setCheckingDup(true);
    try {
      const hits = await detectDuplicates({
        company_id: b.company_id,
        tipo: b.tipo,
        itens: eligible.map((r: any) => {
          const colab = colaboradores.find((c: any) => c.id === r.matched_colaborador_id);
          const compYm = normalizeCompetencia(r.detected_competencia);
          const ref = compYm ? `${compYm}-01` : (b.referencia_data ?? null);
          return {
            item_id: r.id,
            colaborador_id: r.matched_colaborador_id,
            colaborador_nome: colab?.nome ?? "(colaborador)",
            referencia_data: ref,
          };
        }),
      });
      const allIds = eligible.map((r: any) => r.id);
      if (hits.length === 0) {
        await runApprove(allIds, "skip");
        return;
      }
      const dupIds = new Set(hits.map((h) => h.item_id));
      setConfirmDup({
        collisions: hits,
        allIds,
        nonDupIds: allIds.filter((id) => !dupIds.has(id)),
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao verificar duplicidade");
    } finally {
      setCheckingDup(false);
    }
  }

  const pendingCount = useMemo(
    () => rows.filter((r) => r.status === "pending" && r.matched_colaborador_id).length,
    [rows],
  );

  const openInNewTab = async () => {
    if (!current?.page_file_path) return;
    const { data } = await supabase.storage.from("dp-bulk-import").createSignedUrl(current.page_file_path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[1400px] h-[92vh] p-0 flex flex-col">
        <DialogHeader className="p-4 pb-2 border-b">
          <DialogTitle className="text-base">
            Revisar importação {batchName ? `— ${batchName}` : ""}
            <span className="ml-2 text-xs text-muted-foreground font-normal">
              {rows.length} página(s) · {pendingCount} pronta(s) p/ aprovar
            </span>
          </DialogTitle>
        </DialogHeader>

        {(() => {
          const b = batchInfo.data as any;
          const totalPages = b?.total_pages ?? 0;
          const processedPages = b?.processed_pages ?? 0;
          const ocrInProgress = !b || b.status === "processing" || (b.status !== "ready" ? false : totalPages > 0 && rows.length < totalPages);
          const approvedCount = Math.min(savingTotal, b?.approved_count ?? 0);
          if (ocrInProgress) {
            return (
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="w-full max-w-md">
                  <BulkProgressBanner phase="ocr" current={processedPages} total={totalPages} />
                </div>
              </div>
            );
          }
          if (isSaving) {
            return (
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="w-full max-w-md">
                  <BulkProgressBanner phase="saving" current={approvedCount} total={savingTotal} />
                </div>
              </div>
            );
          }
          return (
          <>
        <div className="flex-1 min-h-0 grid grid-cols-[1fr_420px] gap-0 overflow-hidden">
          {/* LEFT: PDF preview */}
          <div className="bg-muted/20 border-r flex flex-col min-h-0">
            <div className="flex items-center justify-between px-3 py-2 border-b bg-background/60">
              <Button
                size="sm" variant="ghost"
                disabled={currentIdx <= 0}
                onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
              </Button>
              <div className="text-xs text-muted-foreground">
                Página <b>{current?.page_index ?? "-"}</b> ({currentIdx + 1}/{rows.length})
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={openInNewTab} title="Abrir em nova aba">
                  <ExternalLink className="h-4 w-4" />
                </Button>
                <Button
                  size="sm" variant="ghost"
                  disabled={currentIdx >= rows.length - 1}
                  onClick={() => setCurrentIdx((i) => Math.min(rows.length - 1, i + 1))}
                >
                  Próxima <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div ref={previewBoxRef} className="flex items-center justify-center p-2 sm:p-4 min-h-full">
                {rendering && (
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Renderizando…
                  </div>
                )}
                <canvas
                  ref={canvasRef}
                  className={cn("shadow-md rounded bg-white max-w-full", rendering && "opacity-40")}
                />
              </div>
            </ScrollArea>

          </div>

          {/* RIGHT: Item list + edit panel */}
          <div className="flex flex-col min-h-0">
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-2">
                {rows.length === 0 && (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Processando OCR…
                  </p>
                )}
                {rows.map((it, idx) => {
                  const active = idx === currentIdx;
                  const colab = colaboradores.find((c: any) => c.id === it.matched_colaborador_id);
                  return (
                    <div
                      key={it.id}
                      className={cn(
                        "border rounded-md p-2 text-sm cursor-pointer transition-colors",
                        active ? "border-primary bg-primary/5" : "hover:bg-muted/30",
                      )}
                      onClick={() => setCurrentIdx(idx)}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-mono text-xs">p.{it.page_index}</span>
                        <Badge
                          variant={
                            it.status === "imported" ? "default"
                            : it.status === "rejected" ? "outline"
                            : it.status === "failed" ? "destructive"
                            : "secondary"
                          }
                        >
                          {it.status}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {colab ? <span className="text-foreground font-medium">{colab.nome}</span> : "Sem vínculo"}
                        {it.matched_cpf ? ` · ${it.matched_cpf}` : ""}
                        {it.detected_competencia ? ` · ${formatCompetencia(it.detected_competencia)}` : ""}
                      </div>
                      {it.matched_colaborador_ativo === false && (
                        <div className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-0.5">
                          <AlertTriangle className="h-3 w-3" /> Colaborador inativo
                        </div>
                      )}
                      {it.duplicate_of && (
                        <div className="text-[10px] text-destructive mt-0.5">Duplicado</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            {/* Edit current item */}
            {current && (
              <div className="border-t p-3 space-y-3 bg-muted/10">
                <div className="text-xs font-semibold uppercase text-muted-foreground">
                  Editar página {current.page_index}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Colaborador</Label>
                  <div className="flex gap-1">
                    <Select
                      value={current.matched_colaborador_id ?? "none"}
                      onValueChange={(v) => setColab.mutate({
                        id: current.id, colaborador_id: v === "none" ? null : v,
                      })}
                      disabled={current.status === "imported"}
                    >
                      <SelectTrigger className="h-8"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Nenhum —</SelectItem>
                        {colaboradores.map((c: any) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.nome}{c.cpf ? ` (${c.cpf})` : ""}
                            {c.ativo === false ? " [inativo]" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <NovoColaboradorInlineDialog
                      defaultCpf={current.matched_cpf ?? ""}
                      onCreated={(id) => setColab.mutate({ id: current.id, colaborador_id: id })}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Competência</Label>
                  <Input
                    className="h-8"
                    type="month"
                    value={normalizeCompetencia(current.detected_competencia) ?? ""}
                    onChange={(e) => setCompetencia.mutate({
                      id: current.id,
                      competencia: e.target.value || null,
                    })}
                    disabled={current.status === "imported"}
                  />
                </div>
                <div className="flex gap-1 pt-1">
                  {current.status === "rejected" ? (
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => undo.mutate(current.id)}>
                      <RotateCcw className="h-3.5 w-3.5 mr-1" /> Desfazer
                    </Button>
                  ) : current.status === "pending" ? (
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => reject.mutate(current.id)}>
                      <X className="h-3.5 w-3.5 mr-1" /> Ignorar página
                    </Button>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="p-3 border-t bg-background">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button
            onClick={handleApproveClick}
            disabled={pendingCount === 0 || checkingDup || isSaving}
          >
            {(checkingDup || isSaving)
              ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              : <Check className="h-4 w-4 mr-1" />}
            Aprovar e Salvar {pendingCount} Documento(s)
          </Button>
        </DialogFooter>
          </>
          );
        })()}
      </DialogContent>
      {confirmDup && (
        <ConfirmarSubstituicaoDialog
          open
          onOpenChange={(o) => { if (!o) setConfirmDup(null); }}
          collisions={confirmDup.collisions}
          totalItems={confirmDup.allIds.length}
          onSkip={() => {
            const ids = confirmDup.nonDupIds;
            setConfirmDup(null);
            runApprove(ids, "skip");
          }}
          onReplace={() => {
            const ids = confirmDup.allIds;
            setConfirmDup(null);
            runApprove(ids, "replace");
          }}
        />
      )}
    </Dialog>
  );
}

function normalizeCompetencia(value: unknown): string | null {
  if (!value) return null;
  const raw = String(value).trim();
  const ym = raw.match(/^(20\d{2})-(0[1-9]|1[0-2])$/);
  if (ym) return `${ym[1]}-${ym[2]}`;
  const ymd = raw.match(/^(20\d{2})-(0[1-9]|1[0-2])-\d{2}$/);
  if (ymd) return `${ymd[1]}-${ymd[2]}`;
  return null;
}

function formatCompetencia(value: unknown): string {
  const normalized = normalizeCompetencia(value);
  if (!normalized) return "—";
  const [year, month] = normalized.split("-");
  return `${month}/${year}`;
}
