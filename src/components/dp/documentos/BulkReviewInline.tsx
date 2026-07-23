import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, ChevronRight, X, Check, Loader2, AlertTriangle,
  ExternalLink, RotateCcw, ZoomIn, ZoomOut, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import * as pdfjsLib from "pdfjs-dist";
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { NovoColaboradorInlineDialog } from "./NovoColaboradorInlineDialog";
import { BulkProgressBanner } from "./BulkProgressBanner";
import { ConfirmarSubstituicaoDialog, type DuplicateCollision } from "./ConfirmarSubstituicaoDialog";
import { detectDuplicates } from "@/lib/dp/bulk-duplicates";
import { cn } from "@/lib/utils";

// Setup pdfjs worker once (shared with BulkReviewDialog)
(pdfjsLib as unknown as { GlobalWorkerOptions: { workerPort: Worker } })
  .GlobalWorkerOptions.workerPort ||= new PdfWorker();

// Cache global de documentos pdfjs por page_file_path (evita re-download/re-parse)
const pdfCache = new Map<string, Promise<any>>();
function loadPdfCached(path: string, signedUrl: string) {
  if (!pdfCache.has(path)) {
    const p = (async () => {
      const resp = await fetch(signedUrl);
      const buf = await resp.arrayBuffer();
      return await pdfjsLib.getDocument({ data: buf }).promise;
    })();
    pdfCache.set(path, p);
    p.catch(() => pdfCache.delete(path));
  }
  return pdfCache.get(path)!;
}

export interface BulkReviewInlineProps {
  batchId: string;
  batchName?: string;
  onOpenFullscreen?: () => void;
}

export function BulkReviewInline({ batchId, batchName, onOpenFullscreen }: BulkReviewInlineProps) {
  const qc = useQueryClient();
  const { data: colaboradores = [] } = useDpColaboradores();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [zoom, setZoom] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [rendering, setRendering] = useState(false);
  const signedUrlsRef = useRef<Map<string, { url: string; exp: number }>>(new Map());

  const [savingTotal, setSavingTotal] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  const batchInfo = useQuery({
    queryKey: ["dp_bulk_batch_info", batchId],
    enabled: !!batchId,
    refetchInterval: (q) => {
      const b = q.state.data as any;
      // Enquanto processando OCR OU enquanto salvamento em curso, poll rápido.
      if (!b || b.status !== "ready" || isSaving) return 900;
      return false;
    },
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_bulk_import_batches" as any)
        .select("id,status,total_pages,processed_pages,approved_count,company_id,tipo")
        .eq("id", batchId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const items = useQuery({
    queryKey: ["dp_bulk_items_review", batchId],
    enabled: !!batchId,
    refetchInterval: (q) => {
      const rows = (q.state.data as any[] | undefined) ?? [];
      const b = batchInfo.data as any;
      const total = b?.total_pages ?? 0;
      const notReady = !b || b.status !== "ready";
      const missingRows = total > 0 && rows.length < total;
      const anyUnresolved = rows.some((r: any) => r.status === "pending" && !r.matched_colaborador_id && !r.error_message);
      return (notReady || missingRows || anyUnresolved || !rows.length) ? 2000 : false;
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

  // Quando o batch fica "ready", força um refetch dos itens para pegar tudo
  useEffect(() => {
    if (batchInfo.data?.status === "ready") {
      qc.invalidateQueries({ queryKey: ["dp_bulk_items_review", batchId] });
    }
  }, [batchInfo.data?.status, batchId, qc]);


  const rows = items.data ?? [];
  const current = rows[currentIdx];

  // Clamp currentIdx quando o número de linhas muda
  useEffect(() => {
    if (rows.length && currentIdx >= rows.length) setCurrentIdx(rows.length - 1);
  }, [rows.length, currentIdx]);

  // Helper: obtem signed URL (com pequeno cache local por sessão de 8min)
  async function getSignedUrl(path: string): Promise<string | null> {
    const now = Date.now();
    const cached = signedUrlsRef.current.get(path);
    if (cached && cached.exp > now) return cached.url;
    const { data } = await supabase.storage.from("dp-bulk-import").createSignedUrl(path, 600);
    if (!data?.signedUrl) return null;
    signedUrlsRef.current.set(path, { url: data.signedUrl, exp: now + 8 * 60 * 1000 });
    return data.signedUrl;
  }

  // Render página atual
  useEffect(() => {
    if (!current?.page_file_path || !canvasRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        setRendering(true);
        const signed = await getSignedUrl(current.page_file_path);
        if (!signed || cancelled) return;
        const doc = await loadPdfCached(current.page_file_path, signed);
        const page = await doc.getPage(1);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: 1.5 * zoom * dpr });
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
  }, [current?.page_file_path, current?.id, zoom]);

  // Pré-carrega páginas vizinhas (próxima e anterior)
  useEffect(() => {
    const neighbors = [rows[currentIdx + 1], rows[currentIdx - 1]].filter(Boolean);
    neighbors.forEach(async (n: any) => {
      if (!n?.page_file_path) return;
      const signed = await getSignedUrl(n.page_file_path);
      if (signed) loadPdfCached(n.page_file_path, signed).catch(() => {});
    });
  }, [currentIdx, rows]);

  // Atalhos ← / →
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName?.match(/INPUT|TEXTAREA|SELECT/)) return;
      if (e.key === "ArrowLeft") setCurrentIdx((i) => Math.max(0, i - 1));
      else if (e.key === "ArrowRight") setCurrentIdx((i) => Math.min(rows.length - 1, i + 1));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [rows.length]);

  const setColab = useMutation({
    mutationFn: async ({ id, colaborador_id }: { id: string; colaborador_id: string | null }) => {
      const { error } = await supabase.from("dp_bulk_import_items" as any).update({
        matched_colaborador_id: colaborador_id,
        manual_override: true,
        confidence: colaborador_id ? 1.0 : 0,
        status: "pending",
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
    const eligible = rows.filter((r: any) => r.status === "pending" && r.matched_colaborador_id);
    if (eligible.length === 0) {
      toast.error("Nenhuma página vinculada");
      return;
    }
    const bInfo = batchInfo.data as any;
    if (!bInfo?.company_id || !bInfo?.tipo) {
      toast.error("Lote incompleto — tente novamente em instantes");
      return;
    }
    setCheckingDup(true);
    try {
      const hits = await detectDuplicates({
        company_id: bInfo.company_id,
        tipo: bInfo.tipo,
        itens: eligible.map((r: any) => {
          const colab = colaboradores.find((c: any) => c.id === r.matched_colaborador_id);
          return {
            item_id: r.id,
            colaborador_id: r.matched_colaborador_id,
            colaborador_nome: colab?.nome ?? "(colaborador)",
            referencia_data: normalizeRefDate(r.detected_competencia) ?? bInfo?.referencia_data ?? null,
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

  const stats = useMemo(() => {
    const vinc = rows.filter((r: any) => r.status === "pending" && r.matched_colaborador_id).length
      + rows.filter((r: any) => r.status === "imported").length;
    const ign = rows.filter((r: any) => r.status === "rejected").length;
    const pend = rows.filter((r: any) => r.status === "pending" && !r.matched_colaborador_id).length
      + rows.filter((r: any) => r.status === "failed").length;
    return { vinc, ign, pend, total: rows.length };
  }, [rows]);

  const progressPct = stats.total > 0 ? Math.round(((stats.vinc + stats.ign) / stats.total) * 100) : 0;

  const openInNewTab = async () => {
    if (!current?.page_file_path) return;
    const signed = await getSignedUrl(current.page_file_path);
    if (signed) window.open(signed, "_blank", "noopener,noreferrer");
  };

  const matchedColab = colaboradores.find((c: any) => c.id === current?.matched_colaborador_id);

  const bannerVariant = !current ? "neutral"
    : current.status === "imported" ? "success"
    : current.status === "rejected" ? "muted"
    : current.status === "failed" ? "danger"
    : current.matched_colaborador_id ? "success"
    : "warning";

  // OCR gating: só liberamos preview/navegação quando o batch está pronto
  // E temos todas as linhas correspondentes.
  const bInfo = batchInfo.data as any;
  const totalPages = bInfo?.total_pages ?? 0;
  const processedPages = bInfo?.processed_pages ?? 0;
  const ocrInProgress = !bInfo || bInfo.status !== "ready" || (totalPages > 0 && rows.length < totalPages);
  const approvedCount = Math.min(savingTotal, bInfo?.approved_count ?? 0);

  return (
    <div className="border rounded-md bg-background overflow-hidden">
      {/* Header: nome do arquivo + contadores + progresso */}
      <div className="px-4 pt-3 pb-2 border-b">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{batchName ?? "Importação"}</div>
            <div className="text-xs text-muted-foreground">
              {ocrInProgress
                ? <>Processando OCR — {processedPages} de {totalPages || "?"} página(s)</>
                : stats.total > 0
                  ? <>{stats.vinc} vinculados · {stats.ign} ignorados · {stats.pend} pendentes</>
                  : "Aguardando OCR…"}
            </div>
          </div>
          {onOpenFullscreen && !ocrInProgress && !isSaving && (
            <Button size="sm" variant="outline" onClick={onOpenFullscreen}>
              <ExternalLink className="h-4 w-4 mr-1" /> Tela cheia
            </Button>
          )}
        </div>
        <div className="mt-2 h-1.5 w-full bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Enquanto o OCR ainda não completou, mostramos apenas o banner de
          progresso — nada de preview parcial nem navegação enganosa. */}
      {ocrInProgress && (
        <div className="p-4">
          <BulkProgressBanner phase="ocr" current={processedPages} total={totalPages} />
        </div>
      )}

      {/* Enquanto salvando, também bloqueamos a UI de revisão. */}
      {!ocrInProgress && isSaving && (
        <div className="p-4">
          <BulkProgressBanner phase="saving" current={approvedCount} total={savingTotal} />
        </div>
      )}

      {!ocrInProgress && !isSaving && (
      <>
      {/* Navigation bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/20">
        <Button
          size="sm" variant="outline"
          disabled={currentIdx <= 0}
          onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
        >
          <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
        </Button>
        <div className="text-sm text-muted-foreground">
          {rows.length > 0 ? <>Página <b className="text-foreground">{currentIdx + 1}</b> de {rows.length}</> : "—"}
        </div>
        <Button
          size="sm" variant="outline"
          disabled={currentIdx >= rows.length - 1}
          onClick={() => setCurrentIdx((i) => Math.min(rows.length - 1, i + 1))}
        >
          Próximo <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>

      {/* Card com preview */}
      <div className="p-3">


        {current && (
          <div className={cn(
            "border-2 rounded-md overflow-hidden",
            bannerVariant === "success" && "border-green-500/50 bg-green-50/50 dark:bg-green-950/10",
            bannerVariant === "warning" && "border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/10",
            bannerVariant === "danger" && "border-destructive/50 bg-destructive/5",
            bannerVariant === "muted" && "border-muted",
          )}>
            {/* Banner de status */}
            <div className="flex items-center justify-between px-3 py-2 border-b bg-background/60">
              <div className="flex items-center gap-2 text-sm">
                {current.status === "imported" ? (
                  <><CheckCircle2 className="h-4 w-4 text-green-600" /> <span>Importado</span></>
                ) : current.status === "rejected" ? (
                  <><X className="h-4 w-4 text-muted-foreground" /> <span>Ignorada</span></>
                ) : current.status === "failed" ? (
                  <><AlertTriangle className="h-4 w-4 text-destructive" /> <span>{current.error_message ?? "Falha no processamento"}</span></>
                ) : current.matched_colaborador_id ? (
                  <><CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span>Vinculado {current.manual_override ? "manualmente" : "automaticamente"}
                      {!current.manual_override && Number(current.confidence) >= 0.95 ? " (nome exato)" : ""}
                    </span>
                  </>
                ) : (
                  <><AlertTriangle className="h-4 w-4 text-amber-600" /> <span>Sem vínculo — selecione um colaborador</span></>
                )}
                {current.matched_colaborador_ativo === false && (
                  <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40 text-[10px]">
                    Colaborador inativo
                  </Badge>
                )}
                {current.duplicate_of && (
                  <Badge variant="destructive" className="text-[10px]">Duplicado</Badge>
                )}
                {current.detected_competencia && (
                  <Badge variant="outline" className="text-[10px]">
                    Competência {formatCompetencia(current.detected_competencia)}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))} title="Diminuir zoom">
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-xs w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
                <Button size="icon" variant="ghost" onClick={() => setZoom((z) => Math.min(2.5, z + 0.1))} title="Aumentar zoom">
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={openInNewTab} title="Abrir em nova aba">
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Preview grande do PDF */}
            <div className="bg-muted/20 max-h-[70vh] overflow-auto flex items-start justify-center p-4">
              {rendering && (
                <div className="absolute mt-4 text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Renderizando…
                </div>
              )}
              <canvas
                ref={canvasRef}
                className={cn("shadow-md rounded bg-white", rendering && "opacity-40")}
              />
            </div>

            {/* Editor: colaborador + competência + ações */}
            <div className="p-3 border-t bg-background grid gap-3 md:grid-cols-[2fr_1fr_auto] items-end">
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
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Selecionar colaborador" />
                    </SelectTrigger>
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
                    trigger={
                      <Button size="icon" variant="outline" title="Cadastrar novo colaborador">
                        <span className="text-lg leading-none">+</span>
                      </Button>
                    }
                  />
                </div>
                {matchedColab && (
                  <div className="text-[11px] text-muted-foreground truncate">
                    {matchedColab.cpf ? `CPF ${matchedColab.cpf}` : ""}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Competência</Label>
                <Input
                  className="h-9"
                    type="month"
                    value={normalizeCompetencia(current.detected_competencia) ?? ""}
                  onChange={(e) => setCompetencia.mutate({
                    id: current.id,
                    competencia: e.target.value || null,
                  })}
                  disabled={current.status === "imported"}
                />
              </div>

              <div className="flex gap-1 justify-end">
                {current.status === "rejected" ? (
                  <Button size="sm" variant="outline" onClick={() => undo.mutate(current.id)}>
                    <RotateCcw className="h-4 w-4 mr-1" /> Desfazer
                  </Button>
                ) : current.status === "pending" ? (
                  <Button size="sm" variant="outline" onClick={() => reject.mutate(current.id)}>
                    <X className="h-4 w-4 mr-1" /> Ignorar
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Rodapé de aprovação */}
      {stats.total > 0 && (
        <div className="px-4 py-3 border-t bg-muted/10 flex items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            Use ← / → para navegar entre páginas
          </div>
          <Button
            onClick={handleApproveClick}
            disabled={
              checkingDup
              || isSaving
              || rows.filter((r: any) => r.status === "pending" && r.matched_colaborador_id).length === 0
            }
          >
            {(checkingDup || isSaving)
              ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              : <Check className="h-4 w-4 mr-1" />}
            Aprovar e Salvar {rows.filter((r: any) => r.status === "pending" && r.matched_colaborador_id).length} Documento(s)
          </Button>
        </div>
      )}
      </>
      )}

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
    </div>
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

function normalizeRefDate(value: unknown): string | null {
  const ym = normalizeCompetencia(value);
  return ym ? `${ym}-01` : null;
}

function formatCompetencia(value: unknown): string {
  const normalized = normalizeCompetencia(value);
  if (!normalized) return "—";
  const [year, month] = normalized.split("-");
  return `${month}/${year}`;
}
