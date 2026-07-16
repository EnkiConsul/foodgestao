import { Helmet } from "react-helmet-async";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileStack, Upload, Loader2, Check, X, ChevronDown, ChevronRight, RefreshCw, ExternalLink } from "lucide-react";
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

const TIPO_OPTS = [
  { v: "contracheque", l: "Contracheque" },
  { v: "ponto", l: "Ponto" },
  { v: "adiantamento", l: "Adiantamento" },
  { v: "ferias", l: "Férias" },
  { v: "atestado", l: "Atestado" },
  { v: "outros", l: "Outros" },
];

export default function DpDocImportBulk() {
  const qc = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  const { data: colaboradores = [] } = useDpColaboradores();

  const [file, setFile] = useState<File | null>(null);
  const [tipo, setTipo] = useState<string>("contracheque");
  const [referencia, setReferencia] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const batches = useQuery({
    queryKey: ["dp_bulk_batches", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_bulk_import_batches" as any)
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as any[];
    },
  });

  const items = useQuery({
    queryKey: ["dp_bulk_items", Object.keys(expanded).filter((k) => expanded[k])],
    enabled: Object.values(expanded).some(Boolean),
    queryFn: async () => {
      const ids = Object.keys(expanded).filter((k) => expanded[k]);
      if (!ids.length) return [];
      const { data, error } = await supabase
        .from("dp_bulk_import_items" as any)
        .select("*")
        .in("batch_id", ids)
        .order("page_index", { ascending: true });
      if (error) throw error;
      return data as any[];
    },
  });

  const upload = useMutation({
    mutationFn: async () => {
      if (!file || !selectedCompanyId) throw new Error("Selecione um arquivo PDF");
      if (file.type !== "application/pdf") throw new Error("Envie um arquivo PDF");
      setUploading(true);

      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) throw new Error("Não autenticado");

      // Cria batch primeiro (com path provisório) para ter id
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

      const { data: ing, error: iErr } = await supabase.functions.invoke("dp-doc-bulk-ingest", {
        body: { batch_id: batch.id },
      });
      if (iErr) throw iErr;
      return ing;
    },
    onSuccess: (r: any) => {
      toast.success(`Lote processado: ${r?.processed ?? 0} páginas, ${r?.matched ?? 0} vinculadas`);
      setFile(null);
      qc.invalidateQueries({ queryKey: ["dp_bulk_batches"] });
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
      const okc = r?.results?.filter((x: any) => x.ok).length ?? 0;
      const fc = r?.results?.filter((x: any) => !x.ok).length ?? 0;
      toast.success(`${okc} importado(s)${fc ? `, ${fc} falha(s)` : ""}`);
      qc.invalidateQueries({ queryKey: ["dp_bulk_items"] });
      qc.invalidateQueries({ queryKey: ["dp_bulk_batches"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao importar"),
  });

  const openPage = async (path: string) => {
    const { data } = await supabase.storage.from("dp-bulk-import").createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  return (
    <div className="space-y-4">
      <Helmet><title>Importação em massa — DP 360°</title></Helmet>
      <div>
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <FileStack className="h-5 w-5" /> Importação em massa de documentos
        </h2>
        <p className="text-sm text-muted-foreground">
          Envie um PDF multi-página. Cada página é dividida, passa por OCR e é vinculada ao colaborador (por CPF ou nome) para aprovação.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Novo lote</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="md:col-span-2 space-y-1">
              <Label>PDF</Label>
              <Input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TIPO_OPTS.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Referência</Label>
              <Input type="date" value={referencia} onChange={(e) => setReferencia(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => upload.mutate()} disabled={!file || uploading}>
              {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Processar
            </Button>
            <p className="text-xs text-muted-foreground self-center">
              Limite: 60 páginas por lote. OCR feito com IA (Lovable AI).
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Lotes recentes</CardTitle>
          <Button size="sm" variant="ghost" onClick={() => batches.refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {batches.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {batches.data?.length === 0 && <p className="text-sm text-muted-foreground">Nenhum lote ainda.</p>}
          {batches.data?.map((b) => {
            const bItems = (items.data ?? []).filter((i) => i.batch_id === b.id);
            const pending = bItems.filter((i) => i.status === "pending" && i.matched_colaborador_id);
            const isOpen = !!expanded[b.id];
            return (
              <div key={b.id} className="border rounded-md">
                <button
                  className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/50"
                  onClick={() => setExpanded((s) => ({ ...s, [b.id]: !s[b.id] }))}
                >
                  <div className="flex items-center gap-2">
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <div>
                      <div className="text-sm font-medium">{b.source_file_name ?? b.id.slice(0, 8)}</div>
                      <div className="text-xs text-muted-foreground">
                        {b.tipo} · {b.total_pages} páginas · {b.matched_count} vinculadas · {new Date(b.created_at).toLocaleString("pt-BR")}
                      </div>
                    </div>
                  </div>
                  <Badge variant={b.status === "imported" ? "default" : b.status === "failed" ? "destructive" : "secondary"}>
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
                        <Check className="h-4 w-4 mr-1" /> Aprovar {pending.length} vinculado(s)
                      </Button>
                    </div>
                    {bItems.length === 0 && <p className="text-sm text-muted-foreground">Sem itens.</p>}
                    {bItems.map((it) => (
                      <div key={it.id} className="border rounded p-2 grid gap-2 md:grid-cols-[auto_1fr_2fr_auto] items-center text-sm">
                        <div className="font-mono text-xs">p.{it.page_index}</div>
                        <div className="flex items-center gap-2">
                          <Badge variant={it.status === "imported" ? "default" : it.status === "rejected" ? "outline" : it.status === "failed" ? "destructive" : "secondary"}>
                            {it.status}
                          </Badge>
                          {!!it.matched_cpf && <span className="text-xs">CPF {it.matched_cpf}</span>}
                          {!!it.confidence && <span className="text-xs text-muted-foreground">conf {(Number(it.confidence) * 100).toFixed(0)}%</span>}
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
                              <SelectItem key={c.id} value={c.id}>{c.nome}{c.cpf ? ` (${c.cpf})` : ""}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="flex gap-1 justify-end">
                          <Button size="icon" variant="ghost" onClick={() => openPage(it.page_file_path)} title="Ver página">
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => reject.mutate(it.id)} disabled={it.status !== "pending"} title="Rejeitar">
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
