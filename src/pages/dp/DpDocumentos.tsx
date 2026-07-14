import { useState, useRef } from "react";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Upload, Loader2, Download, Trash2, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { useAuth } from "@/hooks/useAuth";
import type { Database } from "@/integrations/supabase/types";

type Tipo = Database["public"]["Enums"]["dp_documento_tipo"];
type Row = Database["public"]["Tables"]["dp_documentos"]["Row"];

const TIPOS: { value: Tipo; label: string }[] = [
  { value: "contracheque", label: "Contracheque" },
  { value: "contrato", label: "Contrato" },
  { value: "atestado", label: "Atestado" },
  { value: "adiantamento", label: "Adiantamento" },
  { value: "ponto", label: "Ponto" },
  { value: "disciplinar", label: "Disciplinar" },
  { value: "outros", label: "Outros" },
];

const BUCKET = "dp-documentos";

export default function DpDocumentos() {
  const { selectedCompanyId } = useCompanyContext();
  const { user } = useAuth();
  const qc = useQueryClient();
  const colabs = useDpColaboradores();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    colaborador_id: "", tipo: "outros" as Tipo, titulo: "", descricao: "", referencia_data: "",
  });
  const [uploading, setUploading] = useState(false);

  const list = useQuery({
    queryKey: ["dp_documentos", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_documentos")
        .select("*, dp_colaboradores(nome)")
        .eq("company_id", selectedCompanyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as (Row & { dp_colaboradores: { nome: string } | null })[];
    },
  });

  const submit = async () => {
    const file = fileRef.current?.files?.[0];
    if (!selectedCompanyId) return toast.error("Sem empresa selecionada");
    if (!file) return toast.error("Selecione um arquivo");
    if (!form.titulo.trim()) return toast.error("Título é obrigatório");
    setUploading(true);
    try {
      const path = `${selectedCompanyId}/${form.colaborador_id || "geral"}/${Date.now()}-${file.name}`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) throw up.error;
      const { error } = await supabase.from("dp_documentos").insert({
        company_id: selectedCompanyId,
        colaborador_id: form.colaborador_id || null,
        tipo: form.tipo,
        titulo: form.titulo.trim(),
        descricao: form.descricao.trim() || null,
        file_path: path,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        referencia_data: form.referencia_data || null,
        uploaded_by: user?.id,
      });
      if (error) throw error;
      toast.success("Documento enviado");
      qc.invalidateQueries({ queryKey: ["dp_documentos"] });
      qc.invalidateQueries({ queryKey: ["dp_home_stats"] });
      setDialogOpen(false);
      setForm({ colaborador_id: "", tipo: "outros", titulo: "", descricao: "", referencia_data: "" });
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
    },
    onError: (e) => toast.error("Erro", { description: e instanceof Error ? e.message : String(e) }),
  });

  return (
    <div className="space-y-4">
      <Helmet><title>Documentos — DP 360°</title></Helmet>
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Documentos</h2>
          <p className="text-sm text-muted-foreground">Contracheques, contratos, atestados e demais documentos.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}><Upload className="h-4 w-4 mr-2" /> Enviar</Button>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {list.isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Tipo</TableHead>
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
                    <TableCell><Badge variant="outline" className="capitalize">{r.tipo}</Badge></TableCell>
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
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum documento.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Novo documento</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label>Título *</Label>
              <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ex.: Contracheque 07/2026" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Tipo</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as Tipo })}>
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
              <Label>Arquivo *</Label>
              <Input ref={fileRef} type="file" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={uploading}>{uploading ? "Enviando..." : "Enviar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
