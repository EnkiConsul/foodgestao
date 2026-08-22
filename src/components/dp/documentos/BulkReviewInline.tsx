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
import { ConfirmarFaltantesDialog } from "./ConfirmarFaltantesDialog";
import { ConfirmarSemUnidadeDialog } from "./ConfirmarSemUnidadeDialog";
import { detectDuplicates } from "@/lib/dp/bulk-duplicates";
import { ColaboradoresFaltantesPanel } from "./ColaboradoresFaltantesPanel";
import { competenciaPredominante, computeCoverage, resolveUnidadesLote } from "@/lib/dp/bulk-coverage";
import { VincularUnidadeLote } from "./VincularUnidadeLote";
import { useDpUnidades } from "@/hooks/useDpCadastros";
import { cn } from "@/lib/utils";
import { DP_DOC_TIPOS_IMPORTAVEIS, docTipoLabel } from "@/lib/dp/documentoTipos";

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
  const { data: unidades = [] } = useDpUnidades();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [zoom, setZoom] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewBoxRef = useRef<HTMLDivElement | null>(null);
  const [boxWidth, setBoxWidth] = useState(0);
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
      if (!b || b.status === "processing" || isSaving) return 900;
      return false;
    },
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_bulk_import_batches" as any)
        .select("id,status,total_pages,processed_pages,approved_count,company_id,tipo,unidade_id,referencia_data,deteccao_automatica")
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
      const notReady = !b || b.status === "processing";
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

  // Observa a largura disponível do contêiner da prévia (fit-to-width)
  useEffect(() => {
    const el = previewBoxRef.current;
    if (!el) return;
    const update = () => setBoxWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [current?.id, batchInfo.data?.status, isSaving]);

  // Render página atual
  useEffect(() => {
    if (!current?.page_file_path || !canvasRef.current || boxWidth <= 0) return;
    let cancelled = false;
    (async () => {
      try {
        setRendering(true);
        const signed = await getSignedUrl(current.page_file_path);
        if (!signed || cancelled) return;
        const doc = await loadPdfCached(current.page_file_path, signed);
        const page = await doc.getPage(1);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        // largura base da página (scale 1) para calcular o "fit to width"
        const base = page.getViewport({ scale: 1 });
        const available = Math.max(160, boxWidth - 16);
        const fitScale = available / base.width;
        const viewport = page.getViewport({ scale: fitScale * zoom * dpr });
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
  }, [current?.page_file_path, current?.id, zoom, boxWidth]);


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

  const setTipoItem = useMutation({
    mutationFn: async ({ id, tipo }: { id: string; tipo: string }) => {
      const { error } = await supabase.from("dp_bulk_import_items" as any).update({
        tipo_detectado: tipo,
        tipo_confidence: 1,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dp_bulk_items_review", batchId] }),
    onError: (e: any) => toast.error(e?.message ?? "Falha ao alterar natureza"),
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

  const semUnidadeOkRef = useRef(false);
  const [confirmSemUnidade, setConfirmSemUnidade] = useState(false);

  async function runApprove(item_ids: string[], on_duplicate: "skip" | "replace") {
    if (item_ids.length === 0) {
      toast.error("Nenhuma página elegível");
      return;
    }
    setSavingTotal(item_ids.length);
    setIsSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("dp-doc-bulk-approve", {
        body: { item_ids, on_duplicate, sem_unidade_confirmado: semUnidadeOkRef.current },
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

  const [confirmFaltantes, setConfirmFaltantes] = useState(false);

  function handleApproveClick() {
    if (coverage.unidadeIndefinida && !semUnidadeOkRef.current) {
      setConfirmSemUnidade(true);
      return;
    }
    if (coverage.faltantes.length > 0) {
      setConfirmFaltantes(true);
      return;
    }
    void proceedApprove();
  }

  async function proceedApprove() {
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
            tipo: r.tipo_detectado ?? bInfo.tipo,
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
  const ocrInProgress = !bInfo || bInfo.status === "processing" || (bInfo.status !== "ready" ? false : totalPages > 0 && rows.length < totalPages);
  const approvedCount = Math.min(savingTotal, bInfo?.approved_count ?? 0);

  // Conferência de cobertura: quem deveria ter documento e não tem página no lote
  const competenciaLote = competenciaPredominante(
    rows.map((r: any) => r.detected_competencia),
    bInfo?.referencia_data,
  );
  const unidadesLote = resolveUnidadesLote({
    rows: rows as any,
    colaboradores: colaboradores as any,
    unidades: unidades as any,
    manualUnidadeId: bInfo?.unidade_id ?? null,
  });
  const coverage = computeCoverage({
    colaboradores: colaboradores as any,
    vinculados: new Set(rows.map((r: any) => r.matched_colaborador_id).filter(Boolean)),
    competencia: competenciaLote,
    unidadeIds: unidadesLote,
    tipo: bInfo?.tipo ?? null,
  });



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
        {!ocrInProgress && !isSaving && (
          <ColaboradoresFaltantesPanel
            className="mt-2"
            faltantes={coverage.faltantes}
            totalEsperados={coverage.esperados.length}
            competencia={competenciaLote}
            unidadeIndefinida={coverage.unidadeIndefinida}
            unidadeSlot={
              <VincularUnidadeLote batchId={batchId} companyId={bInfo?.company_id ?? null} />
            }
          />
        )}
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
      <div className="flex items-center justify-between gap-2 px-2 sm:px-3 py-2 border-b bg-muted/20">
        <Button
          size="sm" variant="outline"
          className="h-10 px-2 sm:px-3 shrink-0"
          disabled={currentIdx <= 0}
          onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
          aria-label="Página anterior"
        >
          <ChevronLeft className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">Anterior</span>
        </Button>
        <div className="text-sm text-muted-foreground text-center truncate">
          {rows.length > 0
            ? <><span className="hidden sm:inline">Página </span><b className="text-foreground">{currentIdx + 1}</b><span className="sm:hidden"> / </span><span className="hidden sm:inline"> de </span>{rows.length}</>
            : "—"}
        </div>
        <Button
          size="sm" variant="outline"
          className="h-10 px-2 sm:px-3 shrink-0"
          disabled={currentIdx >= rows.length - 1}
          onClick={() => setCurrentIdx((i) => Math.min(rows.length - 1, i + 1))}
          aria-label="Próxima página"
        >
          <span className="hidden sm:inline">Próximo</span> <ChevronRight className="h-4 w-4 sm:ml-1" />
        </Button>
      </div>

      {/* Card com preview */}
      <div className="p-2 sm:p-3">


        {current && (
          <div className={cn(
            "border-2 rounded-md overflow-hidden",
            bannerVariant === "success" && "border-green-500/50 bg-green-50/50 dark:bg-green-950/10",
            bannerVariant === "warning" && "border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/10",
            bannerVariant === "danger" && "border-destructive/50 bg-destructive/5",
            bannerVariant === "muted" && "border-muted",
          )}>
            {/* Banner de status */}
            <div className="flex flex-col gap-1 px-3 py-2 border-b bg-background/60 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm min-w-0">
                {current.status === "imported" ? (
                  <><CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" /> <span>Importado</span></>
                ) : current.status === "rejected" ? (
                  <><X className="h-4 w-4 shrink-0 text-muted-foreground" /> <span>Ignorada</span></>
                ) : current.status === "failed" ? (
                  <><AlertTriangle className="h-4 w-4 shrink-0 text-destructive" /> <span className="min-w-0 truncate">{current.error_message ?? "Falha no processamento"}</span></>
                ) : current.matched_colaborador_id ? (
                  <><CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                    <span className="min-w-0 truncate">Vinculado {current.manual_override ? "manualmente" : "automaticamente"}
                      {!current.manual_override && Number(current.confidence) >= 0.95 ? " (nome exato)" : ""}
                    </span>
                  </>
                ) : (
                  <><AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" /> <span className="min-w-0 truncate">Sem vínculo — selecione um colaborador</span></>
                )}
                {current.matched_colaborador_ativo === false && (
                  <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40 text-[10px]">
                    Colaborador inativo
                  </Badge>
                )}
                {current.duplicate_of && (
                  <Badge variant="destructive" className="text-[10px]">Duplicado</Badge>
                )}
                <Badge variant="outline" className="text-[10px] whitespace-nowrap">
                  {docTipoLabel(current.tipo_detectado ?? (batchInfo.data as any)?.tipo)}
                </Badge>
                {current.detected_competencia && (
                  <Badge variant="outline" className="text-[10px] whitespace-nowrap">
                    Competência {formatCompetencia(current.detected_competencia)}
                  </Badge>
                )}
              </div>
              <div className="flex items-center justify-end gap-0.5 shrink-0">
                <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} title="Diminuir zoom">
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <button
                  type="button"
                  onClick={() => setZoom(1)}
                  title="Ajustar à largura"
                  className="text-xs w-11 text-center tabular-nums text-muted-foreground hover:text-foreground"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setZoom((z) => Math.min(3, z + 0.25))} title="Aumentar zoom">
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-9 w-9" onClick={openInNewTab} title="Abrir em nova aba">
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Preview grande do PDF */}
            <div
              ref={previewBoxRef}
              className="relative bg-muted/20 max-h-[60vh] md:max-h-[70vh] overflow-auto flex items-start justify-center p-2 sm:p-4"
            >
              {rendering && (
                <div className="absolute inset-x-0 top-4 z-10 text-sm text-muted-foreground flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Renderizando…
                </div>
              )}
              <canvas
                ref={canvasRef}
                className={cn("shadow-md rounded bg-white max-w-full", rendering && "opacity-40")}
              />
            </div>


            {/* Editor: colaborador + competência + ações */}
            <div className="p-3 border-t bg-background grid gap-3 grid-cols-1 md:grid-cols-[2fr_1.2fr_1fr_auto] md:items-end">

              <div className="space-y-1">
                <Label className="text-xs">Colaborador</Label>
                <div className="flex gap-1 min-w-0">
                  <Select
                    value={current.matched_colaborador_id ?? "none"}
                    onValueChange={(v) => setColab.mutate({
                      id: current.id, colaborador_id: v === "none" ? null : v,
                    })}
                    disabled={current.status === "imported"}
                  >
                    <SelectTrigger className="h-10 min-w-0 flex-1">
                      <SelectValue placeholder="Selecionar colaborador" className="truncate" />
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
                      <Button size="icon" variant="outline" className="h-10 w-10 shrink-0" title="Cadastrar novo colaborador">
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
                <Label className="text-xs">Natureza</Label>
                <Select
                  value={current.tipo_detectado ?? (batchInfo.data as any)?.tipo ?? "outros"}
                  onValueChange={(v) => setTipoItem.mutate({ id: current.id, tipo: v })}
                  disabled={current.status === "imported"}
                >
                  <SelectTrigger className="h-10 min-w-0">
                    <SelectValue className="truncate" />
                  </SelectTrigger>
                  <SelectContent>
                    {DP_DOC_TIPOS_IMPORTAVEIS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Competência</Label>
                <Input
                  className="h-10 w-full"
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
                  <Button size="sm" variant="outline" className="h-10 w-full md:w-auto" onClick={() => undo.mutate(current.id)}>
                    <RotateCcw className="h-4 w-4 mr-1" /> Desfazer
                  </Button>
                ) : current.status === "pending" ? (
                  <Button size="sm" variant="outline" className="h-10 w-full md:w-auto" onClick={() => reject.mutate(current.id)}>
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
        <div className="px-3 sm:px-4 py-3 border-t bg-muted/10 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="hidden sm:block text-xs text-muted-foreground">
            Use ← / → para navegar entre páginas
          </div>
          <Button
            className="w-full sm:w-auto h-11"
            onClick={handleApproveClick}
            disabled={
              checkingDup
              || isSaving
              || rows.filter((r: any) => r.status === "pending" && r.matched_colaborador_id).length === 0
            }
          >
            {(checkingDup || isSaving)
              ? <Loader2 className="h-4 w-4 mr-1 animate-spin shrink-0" />
              : <Check className="h-4 w-4 mr-1 shrink-0" />}
            <span className="truncate">
              <span className="sm:hidden">Aprovar {rows.filter((r: any) => r.status === "pending" && r.matched_colaborador_id).length} documento(s)</span>
              <span className="hidden sm:inline">Aprovar e Salvar {rows.filter((r: any) => r.status === "pending" && r.matched_colaborador_id).length} Documento(s)</span>
            </span>
          </Button>
        </div>
      )}

      </>
      )}

      <ConfirmarSemUnidadeDialog
        open={confirmSemUnidade}
        onOpenChange={setConfirmSemUnidade}
        totalItens={rows.filter((r: any) => r.status === "pending" && r.matched_colaborador_id).length}
        onConfirm={() => {
          semUnidadeOkRef.current = true;
          setConfirmSemUnidade(false);
          void proceedApprove();
        }}
      />

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

      <ConfirmarFaltantesDialog
        open={confirmFaltantes}
        onOpenChange={setConfirmFaltantes}
        faltantes={coverage.faltantes}
        competencia={competenciaLote}
        onConfirm={() => { setConfirmFaltantes(false); void proceedApprove(); }}
      />
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
