import { Helmet } from "react-helmet-async";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, Pin, Trash2, Pencil, Megaphone, FileText, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDpAvisos, type DpAviso } from "@/hooks/useDpComunicacao";
import { useDpUnidades, useDpCargos } from "@/hooks/useDpCadastros";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { supabase } from "@/integrations/supabase/client";
import { DpContentCard, DpEmptyState, DpPage, DpPageHeader } from "@/components/dp/DpPage";

const prioridadeBadge: Record<string, string> = {
  baixa: "bg-muted text-muted-foreground",
  normal: "bg-primary/10 text-primary",
  alta: "bg-warning/10 text-warning-foreground border border-warning/40",
  urgente: "bg-destructive/10 text-destructive border border-destructive/40",
};

const MAX_UPLOAD_MB = 10;
const ALLOWED_MIMES = [
  "application/pdf", "image/png", "image/jpeg", "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

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
  const [escopo, setEscopo] = useState<DpAviso["escopo"]>(aviso?.escopo ?? "todos");
  const [unidadeId, setUnidadeId] = useState(aviso?.unidade_id ?? "");
  const [cargoId, setCargoId] = useState(aviso?.cargo_id ?? "");
  const [arquivoPath, setArquivoPath] = useState((aviso as any)?.arquivo_path ?? "");
  const [arquivoMime, setArquivoMime] = useState((aviso as any)?.arquivo_mime ?? "");
  const [uploading, setUploading] = useState(false);

  const unidades = useDpUnidades({ ativo: true });
  const cargos = useDpCargos({ ativo: true });

  const uploadFile = async (file: File) => {
    if (!companyId) return toast.error("Selecione uma empresa");
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      return toast.error(`Arquivo maior que ${MAX_UPLOAD_MB}MB`);
    }
    if (file.type && !ALLOWED_MIMES.includes(file.type)) {
      return toast.error("Tipo de arquivo não permitido");
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "bin";
      const safeName = file.name.replace(/[^\w.\-]/g, "_");
      const path = `${companyId}/avisos/${Date.now()}-${safeName}`;
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
          <DialogDescription>Publica um comunicado no quadro de avisos com prioridade e escopo.</DialogDescription>
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Escopo</Label>
              <Select value={escopo} onValueChange={(v: any) => { setEscopo(v); if (v !== "unidade") setUnidadeId(""); if (v !== "cargo") setCargoId(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="unidade">Por unidade</SelectItem>
                  <SelectItem value="cargo">Por cargo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {escopo === "unidade" && (
              <div>
                <Label>Unidade</Label>
                <Select value={unidadeId} onValueChange={setUnidadeId}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {(unidades.data ?? []).map((u: any) => (
                      <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {escopo === "cargo" && (
              <div>
                <Label>Cargo</Label>
                <Select value={cargoId} onValueChange={setCargoId}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {(cargos.data ?? []).map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={fixado} onCheckedChange={setFixado} id="fixado" />
            <Label htmlFor="fixado">Fixar no topo</Label>
          </div>
          <div>
            <Label>Anexo (opcional) <span className="text-xs text-muted-foreground">— até {MAX_UPLOAD_MB}MB (PDF/imagem/DOC)</span></Label>
            <div className="flex items-center gap-2">
              <Input type="file" onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])} disabled={uploading}
                accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" />
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
            disabled={!titulo || !conteudo || (escopo === "unidade" && !unidadeId) || (escopo === "cargo" && !cargoId)}
            onClick={() => {
              onSave({
                id: aviso?.id,
                titulo,
                conteudo,
                prioridade: prioridade as any,
                fixado,
                expira_em: expiraEm ? new Date(expiraEm).toISOString() : null,
                escopo,
                unidade_id: escopo === "unidade" ? unidadeId : null,
                cargo_id: escopo === "cargo" ? cargoId : null,
                ...(arquivoPath ? { arquivo_path: arquivoPath, arquivo_mime: arquivoMime } as any : { arquivo_path: null, arquivo_mime: null } as any),
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
  const [toDelete, setToDelete] = useState<DpAviso | null>(null);
  const [tab, setTab] = useState<"ativos" | "expirados" | "todos">("ativos");
  const [prioridadeFilter, setPrioridadeFilter] = useState<string>("todas");
  const [search, setSearch] = useState("");

  const now = Date.now();
  const filtered = useMemo(() => {
    return avisos.filter((a) => {
      const expirado = a.expira_em ? new Date(a.expira_em).getTime() < now : false;
      if (tab === "ativos" && expirado) return false;
      if (tab === "expirados" && !expirado) return false;
      if (prioridadeFilter !== "todas" && a.prioridade !== prioridadeFilter) return false;
      if (search && !`${a.titulo} ${a.conteudo}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [avisos, tab, prioridadeFilter, search, now]);

  const counts = useMemo(() => {
    let ativos = 0, expirados = 0;
    for (const a of avisos) {
      const exp = a.expira_em ? new Date(a.expira_em).getTime() < now : false;
      if (exp) expirados++; else ativos++;
    }
    return { ativos, expirados, todos: avisos.length };
  }, [avisos, now]);

  const openAnexo = async (path: string) => {
    const { data, error } = await supabase.storage.from("dp-documentos").createSignedUrl(path, 60);
    if (error) return toast.error(error.message);
    const link = document.createElement("a");
    link.href = data.signedUrl;
    link.target = "_blank";
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <DpPage>
      <Helmet><title>Avisos — DP 360°</title></Helmet>
      <DpPageHeader
        icon={Megaphone}
        title="Quadro de avisos"
        description="Comunicados internos para colaboradores."
        actions={
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
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="ativos">Ativos ({counts.ativos})</TabsTrigger>
            <TabsTrigger value="expirados">Expirados ({counts.expirados})</TabsTrigger>
            <TabsTrigger value="todos">Todos ({counts.todos})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 w-56" />
          </div>
          <Select value={prioridadeFilter} onValueChange={setPrioridadeFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas prioridades</SelectItem>
              <SelectItem value="baixa">Baixa</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
              <SelectItem value="urgente">Urgente</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <DpContentCard contentClassName="p-6"><p className="text-sm text-muted-foreground">Carregando…</p></DpContentCard>
      ) : filtered.length === 0 ? (
        <DpContentCard><DpEmptyState icon={Megaphone}>Nenhum aviso encontrado.</DpEmptyState></DpContentCard>
      ) : (
        <div className="grid gap-3">
          {filtered.map((a) => (
            <Card key={a.id} className={a.fixado ? "dp-content-card border-primary/40" : "dp-content-card"}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {a.fixado && <Pin className="h-4 w-4 text-primary" />}
                    <CardTitle className="text-base">{a.titulo}</CardTitle>
                    <Badge className={prioridadeBadge[a.prioridade]}>{a.prioridade}</Badge>
                    {a.escopo !== "todos" && <Badge variant="outline" className="text-[10px]">{a.escopo}</Badge>}
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(a); setOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setToDelete(a)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
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

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir aviso "{toDelete?.titulo}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O aviso será removido para todos os colaboradores.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (toDelete) { remove.mutate(toDelete.id); setToDelete(null); } }}
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
