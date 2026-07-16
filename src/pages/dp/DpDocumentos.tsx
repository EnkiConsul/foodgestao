import { useState, useRef, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Upload, Download, Trash2, FileText, ArrowLeft, FolderOpen,
  Check, X, Clock, CheckCircle2, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { useAuth } from "@/hooks/useAuth";
import { TableSkeleton } from "@/components/dp/DpSkeletons";
import { DpContentCard, DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { StatusBadge } from "@/pages/dp/portal/DpMeuDocumentos";
import type { Database } from "@/integrations/supabase/types";

type Tipo = Database["public"]["Enums"]["dp_documento_tipo"];
type Aprov = "pendente" | "aprovado" | "recusado";
type Row = Database["public"]["Tables"]["dp_documentos"]["Row"];

export const TIPOS: { value: Tipo; label: string }[] = [
  { value: "contracheque", label: "Contracheque" },
  { value: "adiantamento", label: "Adiantamento" },
  { value: "contrato", label: "Contrato" },
  { value: "ponto", label: "Ponto" },
  { value: "atestado", label: "Atestado" },
  { value: "ferias", label: "Férias" },
  { value: "disciplinar", label: "Disciplinar" },
  { value: "sindicato", label: "Sindicato" },
  { value: "outros", label: "Outros" },
];

const BUCKET = "dp-documentos";

export default function DpDocumentos() {
  const { categoria } = useParams<{ categoria?: string }>();
  const filterTipo = TIPOS.find((t) => t.value === categoria)?.value;
  const currentLabel = TIPOS.find((t) => t.value === filterTipo)?.label;

  const { selectedCompanyId } = useCompanyContext();
  const { user } = useAuth();
  const qc = useQueryClient();
  const colabs = useDpColaboradores();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    colaborador_id: "", tipo: (filterTipo ?? "outros") as Tipo, titulo: "", descricao: "", referencia_data: "",
  });
  const [uploading, setUploading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<Aprov | "todos">("todos");
  const [rejectRow, setRejectRow] = useState<Row | null>(null);
  const [rejectMotivo, setRejectMotivo] = useState("");
  const [toDelete, setToDelete] = useState<Row | null>(null);
  const [search, setSearch] = useState("");
  const [periodoInicio, setPeriodoInicio] = useState("");
  const [periodoFim, setPeriodoFim] = useState("");

  const list = useQuery({
    queryKey: ["dp_documentos", selectedCompanyId, filterTipo ?? "all"],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      let q = supabase
        .from("dp_documentos")
        .select("*, dp_colaboradores(nome)")
        .eq("company_id", selectedCompanyId!)
        .order("created_at", { ascending: false });
      if (filterTipo) q = q.eq("tipo", filterTipo);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as (Row & { dp_colaboradores: { nome: string } | null })[];
    },
  });

  const filteredRows = useMemo(() => {
    const all = list.data ?? [];
    const s = search.toLowerCase();
    return all.filter((r) => {
      if (statusFilter !== "todos" && (r as any).aprovacao_status !== statusFilter) return false;
      if (s) {
        const hay = `${r.titulo ?? ""} ${r.descricao ?? ""} ${r.dp_colaboradores?.nome ?? ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (periodoInicio && r.referencia_data && r.referencia_data < periodoInicio) return false;
      if (periodoFim && r.referencia_data && r.referencia_data > periodoFim) return false;
      return true;
    });
  }, [list.data, statusFilter, search, periodoInicio, periodoFim]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { todos: list.data?.length ?? 0, pendente: 0, aprovado: 0, recusado: 0 };
    for (const r of list.data ?? []) c[(r as any).aprovacao_status] = (c[(r as any).aprovacao_status] ?? 0) + 1;
    return c;
  }, [list.data]);

  const openDialog = () => {
    setForm({ colaborador_id: "", tipo: (filterTipo ?? "outros") as Tipo, titulo: "", descricao: "", referencia_data: "" });
    setDialogOpen(true);
  };

  const submit = async () => {
    const files = fileRef.current?.files;
    if (!selectedCompanyId) return toast.error("Sem empresa selecionada");
    if (!files || files.length === 0) return toast.error("Selecione ao menos um arquivo");
    if (files.length === 1 && !form.titulo.trim()) return toast.error("Título é obrigatório");
    setUploading(true);
    try {
      let ok = 0;
      for (const file of Array.from(files)) {
        const path = `${selectedCompanyId}/${form.colaborador_id || "geral"}/${Date.now()}-${file.name}`;
        const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
        if (up.error) throw up.error;
        const titulo = files.length > 1 ? file.name.replace(/\.[^.]+$/, "") : form.titulo.trim();
        const { error } = await supabase.from("dp_documentos").insert({
          company_id: selectedCompanyId,
          colaborador_id: form.colaborador_id || null,
          tipo: form.tipo,
          titulo,
          descricao: form.descricao.trim() || null,
          file_path: path,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type,
          referencia_data: form.referencia_data || null,
          uploaded_by: user?.id,
        });
        if (error) throw error;
        ok++;
      }
      toast.success(`${ok} documento(s) enviado(s)`);
      qc.invalidateQueries({ queryKey: ["dp_documentos"] });
      qc.invalidateQueries({ queryKey: ["dp_home_stats"] });
      qc.invalidateQueries({ queryKey: ["dp_doc_counts"] });
      setDialogOpen(false);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      toast.error("Erro ao enviar", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setUploading(false);
    }
  };

  const download = async (row: Row) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(row.file_path, 60);
    if (error || !data) return toast.error("Erro ao gerar link");
    // Usa <a> clicado programaticamente para evitar bloqueio de pop-up no iOS Safari.
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.target = "_blank";
    a.rel = "noopener";
    a.download = row.file_name ?? "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const del = useMutation({
    mutationFn: async (row: Row) => {
      await supabase.storage.from(BUCKET).remove([row.file_path]);
      const { error } = await supabase.from("dp_documentos").delete().eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removido");
      qc.invalidateQueries({ queryKey: ["dp_documentos"] });
      qc.invalidateQueries({ queryKey: ["dp_home_stats"] });
      qc.invalidateQueries({ queryKey: ["dp_doc_counts"] });
    },
    onError: (e) => toast.error("Erro", { description: e instanceof Error ? e.message : String(e) }),
  });

  const aprovar = useMutation({
    mutationFn: async (row: Row) => {
      const { error } = await supabase.from("dp_documentos").update({
        aprovacao_status: "aprovado",
        revisado_por: user?.id,
        revisado_em: new Date().toISOString(),
        motivo_recusao: null,
      } as any).eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Documento aprovado");
      qc.invalidateQueries({ queryKey: ["dp_documentos"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const recusar = useMutation({
    mutationFn: async ({ row, motivo }: { row: Row; motivo: string }) => {
      const { error } = await supabase.from("dp_documentos").update({
        aprovacao_status: "recusado",
        revisado_por: user?.id,
        revisado_em: new Date().toISOString(),
        motivo_recusao: motivo,
      } as any).eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Documento recusado");
      qc.invalidateQueries({ queryKey: ["dp_documentos"] });
      setRejectRow(null);
      setRejectMotivo("");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const title = currentLabel ? `${currentLabel} — Documentos` : "Documentos";

  return (
    <DpPage>
      <Helmet><title>{title} — DP 360°</title></Helmet>
      {filterTipo && (
            <Button asChild variant="ghost" size="sm" className="mb-1 -ml-2">
              <Link to="/dp/documentos"><ArrowLeft className="h-4 w-4 mr-1" /> Categorias</Link>
            </Button>
      )}
      <DpPageHeader
        icon={FolderOpen}
        title={currentLabel ?? "Todos os documentos"}
        description={filterTipo ? `Documentos da categoria ${currentLabel}.` : "Contracheques, contratos, atestados e demais documentos."}
        actions={<Button onClick={openDialog}><Upload className="h-4 w-4 mr-2" /> Enviar</Button>}
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
          <TabsList>
            <TabsTrigger value="todos">Todos ({counts.todos})</TabsTrigger>
            <TabsTrigger value="pendente"><Clock className="h-3.5 w-3.5 mr-1" />Pendentes ({counts.pendente})</TabsTrigger>
            <TabsTrigger value="aprovado"><CheckCircle2 className="h-3.5 w-3.5 mr-1" />Aprovados ({counts.aprovado})</TabsTrigger>
            <TabsTrigger value="recusado"><XCircle className="h-3.5 w-3.5 mr-1" />Recusados ({counts.recusado})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap gap-2 items-center">
          <Input placeholder="Buscar por título/colaborador..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
          <Input type="date" value={periodoInicio} onChange={(e) => setPeriodoInicio(e.target.value)} className="w-40" title="Referência a partir de" />
          <Input type="date" value={periodoFim} onChange={(e) => setPeriodoFim(e.target.value)} className="w-40" title="Referência até" />
        </div>
      </div>


      <DpContentCard contentClassName="overflow-x-auto">
          {list.isLoading ? (
            <TableSkeleton columns={filterTipo ? 6 : 7} headers={filterTipo ? ["Título", "Colaborador", "Status", "Referência", "Arquivo", ""] : ["Título", "Tipo", "Colaborador", "Status", "Referência", "Arquivo", ""]} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  {!filterTipo && <TableHead>Tipo</TableHead>}
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Referência</TableHead>
                  <TableHead>Arquivo</TableHead>
                  <TableHead className="w-[180px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((r) => {
                  const status = (r as any).aprovacao_status as Aprov;
                  const submetido = (r as any).submetido_por_colaborador as boolean;
                  const motivo = (r as any).motivo_recusao as string | null;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        {r.titulo}
                        {r.descricao && <div className="text-xs text-muted-foreground">{r.descricao}</div>}
                        {submetido && <div className="text-[11px] text-primary mt-0.5">↑ Enviado pelo colaborador</div>}
                        {status === "recusado" && motivo && (
                          <div className="text-xs text-destructive mt-0.5">Motivo: {motivo}</div>
                        )}
                      </TableCell>
                      {!filterTipo && <TableCell><Badge variant="outline" className="capitalize">{r.tipo}</Badge></TableCell>}
                      <TableCell>{r.dp_colaboradores?.nome ?? "—"}</TableCell>
                      <TableCell><StatusBadge status={status} /></TableCell>
                      <TableCell>{r.referencia_data ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <FileText className="h-3 w-3" />
                          <span className="truncate max-w-[150px]">{r.file_name ?? r.file_path}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          {status === "pendente" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 border-primary/40 text-primary hover:bg-primary/10"
                                onClick={() => aprovar.mutate(r)}
                                disabled={aprovar.isPending}
                              >
                                <Check className="h-3.5 w-3.5 mr-1" /> Aprovar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 border-destructive/40 text-destructive hover:bg-destructive/10"
                                onClick={() => { setRejectRow(r); setRejectMotivo(""); }}
                              >
                                <X className="h-3.5 w-3.5 mr-1" /> Recusar
                              </Button>
                            </>
                          )}
                          <Button size="icon" variant="ghost" onClick={() => download(r)}><Download className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => setToDelete(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredRows.length === 0 && (
                  <TableRow><TableCell colSpan={filterTipo ? 6 : 7} className="text-center text-muted-foreground py-8">Nenhum documento.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
      </DpContentCard>

      {/* Dialog de recusa */}
      <Dialog open={!!rejectRow} onOpenChange={(v) => { if (!v) { setRejectRow(null); setRejectMotivo(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Recusar documento</DialogTitle><DialogDescription>Informe o motivo — será visível ao colaborador.</DialogDescription></DialogHeader>
          <div className="grid gap-2 py-2">
            <p className="text-sm text-muted-foreground">
              Informe o motivo da recusa. O colaborador verá esta mensagem.
            </p>
            <Textarea
              rows={3}
              value={rejectMotivo}
              onChange={(e) => setRejectMotivo(e.target.value)}
              placeholder="Ex.: Arquivo ilegível, favor reenviar."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectRow(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={recusar.isPending || !rejectMotivo.trim()}
              onClick={() => rejectRow && recusar.mutate({ row: rejectRow, motivo: rejectMotivo.trim() })}
            >
              Recusar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Novo documento</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label>Título {(fileRef.current?.files?.length ?? 0) > 1 ? "(ignorado em envio em lote)" : "*"}</Label>
              <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ex.: Contracheque 07/2026" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Tipo</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as Tipo })} disabled={!!filterTipo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Data ref.</Label>
                <Input type="date" value={form.referencia_data} onChange={(e) => setForm({ ...form, referencia_data: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Colaborador (opcional)</Label>
              <Select value={form.colaborador_id} onValueChange={(v) => setForm({ ...form, colaborador_id: v })}>
                <SelectTrigger><SelectValue placeholder="Documento geral da empresa" /></SelectTrigger>
                <SelectContent>
                  {(colabs.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Descrição</Label>
              <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Arquivo(s) * <span className="text-xs text-muted-foreground">— selecione múltiplos para envio em lote</span></Label>
              <Input ref={fileRef} type="file" multiple />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={uploading}>{uploading ? "Enviando..." : "Enviar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir documento "{toDelete?.titulo}"?</AlertDialogTitle>
            <AlertDialogDescription>
              O arquivo será removido do armazenamento e a linha apagada. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (toDelete) { del.mutate(toDelete); setToDelete(null); } }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DpPage>
  );
}
