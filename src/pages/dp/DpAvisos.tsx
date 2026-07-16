import { Helmet } from "react-helmet-async";
import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, Pin, Trash2, Pencil, Megaphone, Upload, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useDpAvisos, type DpAviso } from "@/hooks/useDpComunicacao";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { supabase } from "@/integrations/supabase/client";

const prioridadeColor: Record<string, string> = {
  baixa: "bg-muted text-muted-foreground",
  normal: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  alta: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  urgente: "bg-red-500/10 text-red-700 dark:text-red-300",
};

function AvisoDialog({
  aviso, open, onOpenChange, onSave, companyId,
}: {
  aviso?: DpAviso | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (v: Partial<DpAviso> & { titulo: string; conteudo: string }) => void;
  companyId: string | null;
}) {
  const [titulo, setTitulo] = useState(aviso?.titulo ?? "");
  const [conteudo, setConteudo] = useState(aviso?.conteudo ?? "");
  const [prioridade, setPrioridade] = useState(aviso?.prioridade ?? "normal");
  const [fixado, setFixado] = useState(aviso?.fixado ?? false);
  const [expiraEm, setExpiraEm] = useState(aviso?.expira_em?.slice(0, 10) ?? "");
  const [arquivoPath, setArquivoPath] = useState((aviso as any)?.arquivo_path ?? "");
  const [arquivoMime, setArquivoMime] = useState((aviso as any)?.arquivo_mime ?? "");
  const [uploading, setUploading] = useState(false);

  const uploadFile = async (file: File) => {
    if (!companyId) return toast.error("Selecione uma empresa");
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "bin";
      const path = `${companyId}/avisos/${Date.now()}.${ext}`;
      const up = await supabase.storage.from("dp-documentos").upload(path, file, { contentType: file.type });
      if (up.error) throw up.error;
      setArquivoPath(path);
      setArquivoMime(file.type);
      toast.success("Arquivo enviado");
    } catch (e: any) {
      toast.error(e.message ?? "Erro no upload");
    } finally { setUploading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{aviso ? "Editar aviso" : "Novo aviso"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Título</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </div>
          <div>
            <Label>Conteúdo</Label>
            <Textarea rows={5} value={conteudo} onChange={(e) => setConteudo(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Prioridade</Label>
              <Select value={prioridade} onValueChange={(v: any) => setPrioridade(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Expira em</Label>
              <Input type="date" value={expiraEm} onChange={(e) => setExpiraEm(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={fixado} onCheckedChange={setFixado} id="fixado" />
            <Label htmlFor="fixado">Fixar no topo</Label>
          </div>
          <div>
            <Label>Anexo (opcional)</Label>
            <div className="flex items-center gap-2">
              <Input type="file" onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])} disabled={uploading} />
              {arquivoPath && (
                <Button size="sm" variant="ghost" onClick={() => { setArquivoPath(""); setArquivoMime(""); }}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
            {arquivoPath && <p className="text-xs text-muted-foreground mt-1"><FileText className="inline h-3 w-3 mr-1" />{arquivoPath.split("/").pop()}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={!titulo || !conteudo}
            onClick={() => {
              onSave({
                id: aviso?.id,
                titulo,
                conteudo,
                prioridade: prioridade as any,
                fixado,
                expira_em: expiraEm ? new Date(expiraEm).toISOString() : null,
                ...(arquivoPath ? { arquivo_path: arquivoPath, arquivo_mime: arquivoMime } as any : {}),
              } as any);
              onOpenChange(false);
            }}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function DpAvisos() {
  const { data: avisos = [], isLoading, upsert, remove } = useDpAvisos();
  const { selectedCompanyId } = useCompanyContext();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DpAviso | null>(null);

  const openAnexo = async (path: string) => {
    const { data, error } = await supabase.storage.from("dp-documentos").createSignedUrl(path, 60);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank");
  };

  return (
    <div className="space-y-4">
      <Helmet><title>Avisos — DP 360°</title></Helmet>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Megaphone className="h-6 w-6" /> Quadro de avisos
          </h1>
          <p className="text-muted-foreground">Comunicados internos para colaboradores.</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditing(null)}>
              <Plus className="h-4 w-4 mr-1" /> Novo aviso
            </Button>
          </DialogTrigger>
          <AvisoDialog
            key={editing?.id ?? "new"}
            aviso={editing}
            open={open}
            onOpenChange={setOpen}
            companyId={selectedCompanyId}
            onSave={(v) => upsert.mutate(v)}
          />
        </Dialog>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : avisos.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">
          Nenhum aviso publicado ainda.
        </CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {avisos.map((a) => (
            <Card key={a.id} className={a.fixado ? "border-primary/40" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {a.fixado && <Pin className="h-4 w-4 text-primary" />}
                    <CardTitle className="text-base">{a.titulo}</CardTitle>
                    <Badge className={prioridadeColor[a.prioridade]}>{a.prioridade}</Badge>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(a); setOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => remove.mutate(a.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Publicado {format(new Date(a.publicado_em), "dd 'de' MMM yyyy", { locale: ptBR })}
                  {a.expira_em && ` · expira em ${format(new Date(a.expira_em), "dd/MM/yyyy")}`}
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="whitespace-pre-wrap text-sm">{a.conteudo}</p>
                {(a as any).arquivo_path && (
                  <Button size="sm" variant="outline" onClick={() => openAnexo((a as any).arquivo_path)}>
                    <FileText className="h-4 w-4 mr-1" /> Ver anexo
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
