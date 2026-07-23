import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Upload, Loader2, Check, X, ChevronDown, ChevronRight, RefreshCw, ExternalLink, AlertTriangle,
} from "lucide-react";
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

const TIPO_OPTS = [
  { v: "contracheque", l: "Contracheque" },
  { v: "ponto", l: "Ponto" },
  { v: "adiantamento", l: "Adiantamento" },
  { v: "ferias", l: "Férias" },
  { v: "atestado", l: "Atestado" },
  { v: "outros", l: "Outros" },
];

const MAX_SIZE_MB = 20;

export interface BulkImportPanelProps {
  /** Fixa o tipo do lote e esconde o seletor. */
  tipoFixed?: string;
  /** Fixa a referência (YYYY-MM-DD) e esconde o input. */
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
  const [tipo, setTipo] = useState<string>(tipoFixed ?? "contracheque");
  const [referencia, setReferencia] = useState<string>(referenciaFixed ?? "");
  const [uploading, setUploading] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [batchLimit, setBatchLimit] = useState<number>(20);

  useEffect(() => { if (tipoFixed) setTipo(tipoFixed); }, [tipoFixed]);
  useEffect(() => { if (referenciaFixed) setReferencia(referenciaFixed); }, [referenciaFixed]);

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
          tipo,
          source_file_path: provisional,
          source_file_name: file.name,
          referencia_data: referencia || null,
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

      // Auto-expande o lote novo para o usuário ver o progresso
      setExpanded((s) => ({ ...s, [batch.id]: true }));

      const { data: ing, error: iErr } = await supabase.functions.invoke("dp-doc-bulk-ingest", {
        body: { batch_id: batch.id },
      });
      if (iErr) {
        // Marca o batch como falho para não ficar preso em processing
        await (supabase.from("dp_bulk_import_batches" as any) as any)
          .update({ status: "failed", error_message: iErr.message ?? "Falha ao processar" })
          .eq("id", batch.id);
        throw iErr;
      }
      return ing;
    },
    onSuccess: (r: any) => {
      toast.success(`Lote processado: ${r?.processed ?? 0} páginas, ${r?.matched ?? 0} vinculadas`);
      setFile(null);
      qc.invalidateQueries({ queryKey: ["dp_bulk_batches"] });
      qc.invalidateQueries({ queryKey: ["dp_bulk_items"] });
      qc.invalidateQueries({ queryKey: ["dp_bulk_pending_counts"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao processar"),
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
                <Label>Tipo</Label>
                <Select value={tipo} onValueChange={setTipo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TIPO_OPTS.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {!referenciaFixed && (
              <div className="space-y-1">
                <Label>Referência (mês/ano)</Label>
                <Input type="date" value={referencia} onChange={(e) => setReferencia(e.target.value)} />
              </div>
            )}
          </div>

          <Button onClick={() => upload.mutate()} disabled={!file || uploading} className="w-full">
            {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            Processar em massa
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
            return (
              <div key={b.id} className="border rounded-md">
                <button
                  className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/50"
                  onClick={() => setExpanded((s) => ({ ...s, [b.id]: !s[b.id] }))}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{b.source_file_name ?? b.id.slice(0, 8)}</div>
                      <div className="text-xs text-muted-foreground">
                        {b.tipo} ·{" "}
                        {isProcessing && totalPag > 0
                          ? `OCR ${processed}/${totalPag}`
                          : `${totalPag} páginas · ${b.matched_count ?? 0} vinculadas`}
                        {isOpen && bItems.length > 0 ? ` · ${importadas}/${totalPag} importadas` : ""} ·{" "}
                        {new Date(b.created_at).toLocaleString("pt-BR")}
                      </div>
                      {b.error_message && (
                        <div className="text-xs text-destructive mt-0.5 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> {b.error_message}
                        </div>
                      )}
                    </div>
                  </div>
                  <Badge variant={
                    b.status === "imported" ? "default"
                    : b.status === "failed" ? "destructive"
                    : "secondary"
                  }>
                    {isProcessing && <Loader2 className="h-3 w-3 mr-1 animate-spin inline" />}
                    {b.status}
                  </Badge>
                </button>

                {isOpen && (
                  <div className="border-t p-3 space-y-2">
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        disabled={pending.length === 0 || approve.isPending}
                        onClick={() => approve.mutate(pending.map((i) => i.id))}
                      >
                        {approve.isPending
                          ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          : <Check className="h-4 w-4 mr-1" />}
                        Aprovar {pending.length} vinculado(s)
                      </Button>
                    </div>
                    {isProcessing && bItems.length === 0 && (
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Processando OCR das páginas…
                      </p>
                    )}
                    {!isProcessing && bItems.length === 0 && (
                      <p className="text-sm text-muted-foreground">Sem itens.</p>
                    )}
                    {bItems.map((it) => (
                      <div key={it.id} className="border rounded p-2 grid gap-2 md:grid-cols-[auto_1fr_2fr_auto] items-center text-sm">
                        <div className="font-mono text-xs">p.{it.page_index}</div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={
                            it.status === "imported" ? "default"
                            : it.status === "rejected" ? "outline"
                            : it.status === "failed" ? "destructive"
                            : "secondary"
                          }>
                            {it.status}
                          </Badge>
                          {!!it.matched_cpf && <span className="text-xs">CPF {it.matched_cpf}</span>}
                          {!!it.confidence && (
                            <span className="text-xs text-muted-foreground">
                              conf {(Number(it.confidence) * 100).toFixed(0)}%
                            </span>
                          )}
                          {it.error_message && (
                            <span className="text-xs text-destructive truncate" title={it.error_message}>
                              {it.error_message}
                            </span>
                          )}
                        </div>
                        <Select
                          value={it.matched_colaborador_id ?? "none"}
                          onValueChange={(v) => setColab.mutate({ id: it.id, colaborador_id: v === "none" ? null : v })}
                          disabled={it.status === "imported"}
                        >
                          <SelectTrigger><SelectValue placeholder="Selecionar colaborador" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">— Nenhum —</SelectItem>
                            {colaboradores.map((c: any) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.nome}{c.cpf ? ` (${c.cpf})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="flex gap-1 justify-end">
                          <Button size="icon" variant="ghost" onClick={() => openPage(it.page_file_path)} title="Ver página">
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost" disabled={it.status !== "pending"} title="Rejeitar">
                                <X className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Rejeitar página {it.page_index}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  A página será marcada como rejeitada e não poderá ser importada.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => reject.mutate(it.id)}>Rejeitar</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    ))}
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
    </div>
  );
}
