import { useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Download, FileText, Eye, DownloadCloud, Upload, Ban,
  CheckCircle2, Clock, XCircle,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeStorageFilename } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { DocumentPreview } from "@/components/dp/DocumentPreview";
import { DpContentCard, DpFilterCard, DpPage, DpPageHeader } from "@/components/dp/DpPage";
import type { Database } from "@/integrations/supabase/types";

type Tipo = Database["public"]["Enums"]["dp_documento_tipo"];

const TABS: { key: string; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "contracheque", label: "Contracheques" },
  { key: "ponto", label: "Ponto" },
  { key: "adiantamento", label: "Adiantamentos" },
  { key: "contrato", label: "Contratos" },
  { key: "outros", label: "Outros" },
];

const KNOWN_TIPOS = new Set(["contracheque", "ponto", "adiantamento", "contrato"]);

// Tipos que o colaborador pode enviar (subset — os demais são gerados pelo DP).
const TIPOS_SUBMETIVEIS: { value: Tipo; label: string }[] = [
  { value: "atestado", label: "Atestado" },
  { value: "outros", label: "Outros" },
];

const BUCKET = "dp-documentos";

type Doc = {
  id: string;
  titulo: string;
  tipo: string;
  referencia_data: string | null;
  file_path: string;
  mime_type?: string | null;
  aprovacao_status: "pendente" | "aprovado" | "recusado";
  motivo_recusao: string | null;
  submetido_por_colaborador: boolean;
  created_at: string;
};

export default function DpMeuDocumentos() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState("all");
  const [preview, setPreview] = useState<Doc | null>(null);
  const [openSubmit, setOpenSubmit] = useState(false);
  const [form, setForm] = useState<{ tipo: Tipo; titulo: string; descricao: string; referencia_data: string }>({
    tipo: "atestado", titulo: "", descricao: "", referencia_data: "",
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const meRef = useQuery({
    queryKey: ["colab_of_docs", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.rpc("dp_colaborador_of", { _user_id: user!.id });
      if (!data) return null;
      const { data: c } = await supabase
        .from("dp_colaboradores").select("id, company_id").eq("id", data).single();
      return c;
    },
  });

  const list = useQuery({
    queryKey: ["dp_meu_docs", meRef.data?.id],
    enabled: !!meRef.data?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_documentos")
        .select("id, titulo, tipo, referencia_data, file_path, mime_type, aprovacao_status, motivo_recusao, submetido_por_colaborador, created_at")
        .eq("colaborador_id", meRef.data!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Doc[];
    },
  });

  const filtered = useMemo(() => {
    const all = list.data ?? [];
    if (tab === "all") return all;
    if (tab === "outros") return all.filter((d) => !KNOWN_TIPOS.has(d.tipo));
    return all.filter((d) => d.tipo === tab);
  }, [list.data, tab]);

  const download = async (path: string) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);
    if (error || !data) return toast.error("Erro ao gerar link");
    window.open(data.signedUrl, "_blank");
  };

  const downloadAll = async () => {
    if (filtered.length === 0) return;
    toast.info(`Abrindo ${filtered.length} download(s)…`);
    for (const d of filtered) {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(d.file_path, 120);
      if (data?.signedUrl) window.open(data.signedUrl, "_blank");
      await new Promise((r) => setTimeout(r, 250));
    }
  };

  const submit = async () => {
    const files = fileRef.current?.files;
    if (!meRef.data) return toast.error("Colaborador não encontrado");
    if (!files || files.length === 0) return toast.error("Selecione o arquivo");
    if (!form.titulo.trim()) return toast.error("Título obrigatório");
    setUploading(true);
    try {
      const file = files[0];
      const path = `${meRef.data.company_id}/${meRef.data.id}/${Date.now()}-${file.name}`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) throw up.error;
      const { error } = await supabase.from("dp_documentos").insert({
        company_id: meRef.data.company_id,
        colaborador_id: meRef.data.id,
        tipo: form.tipo,
        titulo: form.titulo.trim(),
        descricao: form.descricao.trim() || null,
        file_path: path,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        referencia_data: form.referencia_data || null,
        uploaded_by: user?.id,
        submetido_por_colaborador: true,
        aprovacao_status: "pendente",
      });
      if (error) throw error;
      toast.success("Documento enviado para aprovação");
      qc.invalidateQueries({ queryKey: ["dp_meu_docs"] });
      setOpenSubmit(false);
      setForm({ tipo: "atestado", titulo: "", descricao: "", referencia_data: "" });
      if (fileRef.current) fileRef.current.value = "";
    } catch (e: any) {
      toast.error("Erro ao enviar", { description: e.message ?? String(e) });
    } finally {
      setUploading(false);
    }
  };

  const cancelar = useMutation({
    mutationFn: async (d: Doc) => {
      await supabase.storage.from(BUCKET).remove([d.file_path]);
      const { error } = await supabase.from("dp_documentos").delete().eq("id", d.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Envio cancelado");
      qc.invalidateQueries({ queryKey: ["dp_meu_docs"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao cancelar"),
  });

  return (
    <DpPage>
      <Helmet><title>Meus documentos — Portal</title></Helmet>
      <DpPageHeader
        icon={FileText}
        title="Meus documentos"
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={downloadAll} disabled={filtered.length === 0}>
              <DownloadCloud className="h-4 w-4 mr-1" /> Baixar todos ({filtered.length})
            </Button>
            <Dialog open={openSubmit} onOpenChange={setOpenSubmit}>
              <DialogTrigger asChild>
                <Button size="sm"><Upload className="h-4 w-4 mr-1" /> Enviar documento</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>Enviar documento para aprovação</DialogTitle></DialogHeader>
                <div className="grid gap-3 py-2">
                  <div className="grid gap-1.5">
                    <Label>Título *</Label>
                    <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ex.: Atestado médico 16/07/2026" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                      <Label>Tipo</Label>
                      <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as Tipo })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {TIPOS_SUBMETIVEIS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Data referência</Label>
                      <Input type="date" value={form.referencia_data} onChange={(e) => setForm({ ...form, referencia_data: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Observações</Label>
                    <Textarea rows={2} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Arquivo *</Label>
                    <Input ref={fileRef} type="file" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Seu envio ficará em análise até que o DP aprove ou recuse.
                  </p>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpenSubmit(false)}>Cancelar</Button>
                  <Button onClick={submit} disabled={uploading}>{uploading ? "Enviando…" : "Enviar"}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <DpFilterCard>
          <TabsList className="flex-wrap h-auto">
            {TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>
            ))}
          </TabsList>
        </DpFilterCard>
        <TabsContent value={tab} className="mt-4">
          <DpContentCard contentClassName="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Referência</TableHead>
                  <TableHead className="w-40 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">
                      {d.titulo}
                      {d.aprovacao_status === "recusado" && d.motivo_recusao && (
                        <div className="text-xs text-destructive mt-0.5">Recusado: {d.motivo_recusao}</div>
                      )}
                    </TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{d.tipo}</Badge></TableCell>
                    <TableCell><StatusBadge status={d.aprovacao_status} /></TableCell>
                    <TableCell>{d.referencia_data ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" title="Pré-visualizar" onClick={() => setPreview(d)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" title="Baixar" onClick={() => download(d.file_path)}>
                        <Download className="h-4 w-4" />
                      </Button>
                      {d.submetido_por_colaborador && d.aprovacao_status === "pendente" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Cancelar envio"
                          onClick={() => cancelar.mutate(d)}
                          disabled={cancelar.isPending}
                        >
                          <Ban className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Sem documentos nesta categoria.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </DpContentCard>
        </TabsContent>
      </Tabs>

      <DocumentPreview
        open={!!preview}
        onOpenChange={(v) => { if (!v) setPreview(null); }}
        title={preview?.titulo}
        bucket={BUCKET}
        path={preview?.file_path}
        mime={preview?.mime_type}
      />
    </DpPage>
  );
}

export function StatusBadge({ status }: { status: "pendente" | "aprovado" | "recusado" }) {
  if (status === "aprovado")
    return <Badge className="bg-green-500/15 text-green-700 border-green-300 border"><CheckCircle2 className="h-3 w-3 mr-1" />Aprovado</Badge>;
  if (status === "recusado")
    return <Badge className="bg-red-500/15 text-red-700 border-red-300 border"><XCircle className="h-3 w-3 mr-1" />Recusado</Badge>;
  return <Badge className="bg-amber-500/15 text-amber-700 border-amber-300 border"><Clock className="h-3 w-3 mr-1" />Pendente</Badge>;
}
