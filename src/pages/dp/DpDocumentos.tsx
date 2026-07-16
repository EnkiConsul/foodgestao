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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
    window.open(data.signedUrl, "_blank");
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

      <DpContentCard contentClassName="overflow-x-auto">
          {list.isLoading ? (
            <TableSkeleton columns={filterTipo ? 5 : 6} headers={filterTipo ? ["Título", "Colaborador", "Referência", "Arquivo", ""] : ["Título", "Tipo", "Colaborador", "Referência", "Arquivo", ""]} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  {!filterTipo && <TableHead>Tipo</TableHead>}
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Referência</TableHead>
                  <TableHead>Arquivo</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(list.data ?? []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {r.titulo}
                      {r.descricao && <div className="text-xs text-muted-foreground">{r.descricao}</div>}
                    </TableCell>
                    {!filterTipo && <TableCell><Badge variant="outline" className="capitalize">{r.tipo}</Badge></TableCell>}
                    <TableCell>{r.dp_colaboradores?.nome ?? "—"}</TableCell>
                    <TableCell>{r.referencia_data ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <FileText className="h-3 w-3" />
                        <span className="truncate max-w-[150px]">{r.file_name ?? r.file_path}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" onClick={() => download(r)}><Download className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => del.mutate(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {(list.data?.length ?? 0) === 0 && (
                  <TableRow><TableCell colSpan={filterTipo ? 5 : 6} className="text-center text-muted-foreground py-8">Nenhum documento.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
      </DpContentCard>

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
    </DpPage>
  );
}
