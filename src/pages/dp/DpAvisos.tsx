import { Helmet } from "react-helmet-async";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, Trash2, Pencil, Bell, FileText, Paperclip, BarChart3 } from "lucide-react";
import { AvisoEngajamentoDialog } from "@/components/dp/comunicacao/AvisoEngajamentoDialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
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
import { useDpAvisos, type DpAviso } from "@/hooks/useDpComunicacao";
import { useDpUnidades } from "@/hooks/useDpCadastros";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeStorageFilename } from "@/lib/storage";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";

const MAX_UPLOAD_MB = 10;
const ALLOWED_MIMES = [
  "application/pdf", "image/png", "image/jpeg", "image/webp",
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
  const [dataInicio, setDataInicio] = useState(aviso?.publicado_em?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [dataFim, setDataFim] = useState(aviso?.expira_em?.slice(0, 10) ?? "");
  const [destinatario, setDestinatario] = useState<string>(
    aviso?.escopo === "unidade" ? `unidade:${aviso.unidade_id}` :
    (aviso as any)?.escopo === "colaborador" ? `colaborador:${(aviso as any).colaborador_id}` : "todos"
  );
  const [arquivoPath, setArquivoPath] = useState(aviso?.arquivo_path ?? "");
  const [arquivoMime, setArquivoMime] = useState(aviso?.arquivo_mime ?? "");
  const [uploading, setUploading] = useState(false);
  const [leituraObrigatoria, setLeituraObrigatoria] = useState<boolean>((aviso as any)?.leitura_obrigatoria ?? false);
  const [permitirReacoes, setPermitirReacoes] = useState<boolean>((aviso as any)?.permitir_reacoes ?? true);
  const [permitirComentarios, setPermitirComentarios] = useState<boolean>((aviso as any)?.permitir_comentarios ?? false);

  const unidades = useDpUnidades();
  const colaboradores = useDpColaboradores();

  const uploadFile = async (file: File) => {
    if (!companyId) return toast.error("Selecione uma empresa");
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      return toast.error(`Arquivo maior que ${MAX_UPLOAD_MB}MB`);
    }
    if (file.type && !ALLOWED_MIMES.includes(file.type)) {
      return toast.error("Tipo de arquivo não permitido (PDF ou imagem)");
    }
    setUploading(true);
    try {
      const safeName = sanitizeStorageFilename(file.name);
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

  const parseDest = () => {
    if (destinatario.startsWith("unidade:")) {
      return { escopo: "unidade" as const, unidade_id: destinatario.split(":")[1], cargo_id: null, colaborador_id: null };
    }
    if (destinatario.startsWith("colaborador:")) {
      return { escopo: "colaborador" as any, unidade_id: null, cargo_id: null, colaborador_id: destinatario.split(":")[1] };
    }
    return { escopo: "todos" as const, unidade_id: null, cargo_id: null, colaborador_id: null };
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{aviso ? "Editar Aviso" : "Novo Aviso"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Título *</Label>
            <Input placeholder="Título do aviso" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </div>
          <div>
            <Label>Mensagem *</Label>
            <Textarea rows={4} placeholder="Conteúdo do aviso" value={conteudo} onChange={(e) => setConteudo(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Data Início *</Label>
              <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
            </div>
            <div>
              <Label>Data Fim *</Label>
              <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Destinatário</Label>
            <Select value={destinatario} onValueChange={setDestinatario}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Colaboradores</SelectItem>
                {(unidades.data ?? []).length > 0 && (
                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Unidade Específica</div>
                )}
                {(unidades.data ?? []).map((u: any) => (
                  <SelectItem key={`u-${u.id}`} value={`unidade:${u.id}`}>{u.nome}</SelectItem>
                ))}
                {(colaboradores.data ?? []).length > 0 && (
                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Colaborador Específico</div>
                )}
                {(colaboradores.data ?? []).map((c: any) => (
                  <SelectItem key={`c-${c.id}`} value={`colaborador:${c.id}`}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Anexo (PDF ou Imagem)</Label>
            <Input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp"
              onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])} disabled={uploading} />
            {arquivoPath && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <FileText className="h-3 w-3" />{arquivoPath.split("/").pop()}
                <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => { setArquivoPath(""); setArquivoMime(""); }}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </p>
            )}
          </div>
          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <Label className="text-sm">Leitura obrigatória</Label>
                <p className="text-xs text-muted-foreground">Exibe o aviso em pop-up até a confirmação.</p>
              </div>
              <Switch checked={leituraObrigatoria} onCheckedChange={setLeituraObrigatoria} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <div>
                <Label className="text-sm">Permitir reações</Label>
                <p className="text-xs text-muted-foreground">Colaboradores podem reagir com emojis.</p>
              </div>
              <Switch checked={permitirReacoes} onCheckedChange={setPermitirReacoes} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <div>
                <Label className="text-sm">Permitir comentários</Label>
                <p className="text-xs text-muted-foreground">Comentários passam por moderação do admin.</p>
              </div>
              <Switch checked={permitirComentarios} onCheckedChange={setPermitirComentarios} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={!titulo || !conteudo || !dataInicio || !dataFim}
            onClick={() => {
              const dest = parseDest();
              onSave({
                id: aviso?.id,
                titulo,
                conteudo,
                prioridade: aviso?.prioridade ?? "normal",
                fixado: aviso?.fixado ?? false,
                publicado_em: new Date(dataInicio).toISOString(),
                expira_em: dataFim ? new Date(dataFim).toISOString() : null,
                ...dest,
                arquivo_path: arquivoPath || null,
                arquivo_mime: arquivoMime || null,
                leitura_obrigatoria: leituraObrigatoria,
                permitir_reacoes: permitirReacoes,
                permitir_comentarios: permitirComentarios,
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
  const [engajamento, setEngajamento] = useState<DpAviso | null>(null);
  const colaboradoresAdmin = useDpColaboradores();
  const totalColaboradores = (colaboradoresAdmin.data ?? []).filter((c: any) => c.ativo !== false).length;

  const sorted = useMemo(() => {
    return [...avisos].sort((a, b) => new Date(b.publicado_em).getTime() - new Date(a.publicado_em).getTime());
  }, [avisos]);

  const openAnexo = async (path: string) => {
    const { data, error } = await supabase.storage.from("dp-documentos").createSignedUrl(path, 60);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const destinoLabel = (a: DpAviso) => {
    if (a.escopo === "unidade") return "Unidade Específica";
    if ((a as any).escopo === "colaborador") return "Colaborador Específico";
    return "Todos os Colaboradores";
  };

  return (
    <DpPage>
      <Helmet><title>Quadro de Avisos — Pessoas 360°</title></Helmet>
      <DpPageHeader
        icon={Bell}
        title="Quadro de Avisos"
        description="Crie avisos que aparecerão para os colaboradores ao fazerem login."
        actions={
          <Button onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Novo Aviso
          </Button>
        }
      />

      {isLoading ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Carregando…
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Nenhum aviso cadastrado.
        </div>
      ) : (
        <div className="grid gap-3">
          {sorted.map((a) => (
            <div key={a.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-base">{a.titulo}</h3>
                    <Badge variant="outline" className="text-xs">{destinoLabel(a)}</Badge>
                    {(a as any).leitura_obrigatoria && (
                      <Badge variant="secondary" className="text-[10px]">Leitura obrigatória</Badge>
                    )}
                    {(a as any).permitir_comentarios && (
                      <Badge variant="outline" className="text-[10px]">Comentários</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(a.publicado_em), "dd/MM/yyyy", { locale: ptBR })}
                    {a.expira_em && ` até ${format(new Date(a.expira_em), "dd/MM/yyyy", { locale: ptBR })}`}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" title="Engajamento" onClick={() => setEngajamento(a)}>
                    <BarChart3 className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(a); setOpen(true); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setToDelete(a)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm">{a.conteudo}</p>
              {a.arquivo_path && (
                <Button size="sm" variant="outline" className="mt-3" onClick={() => openAnexo(a.arquivo_path!)}>
                  <Paperclip className="h-4 w-4 mr-1" /> Ver anexo
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
        <AvisoDialog
          key={editing?.id ?? "new"}
          aviso={editing}
          open={open}
          onOpenChange={setOpen}
          companyId={selectedCompanyId}
          onSave={(v) => upsert.mutate(v)}
        />
      </Dialog>

      <AvisoEngajamentoDialog
        avisoId={engajamento?.id ?? null}
        titulo={engajamento?.titulo}
        totalColaboradores={totalColaboradores}
        onOpenChange={(v) => { if (!v) setEngajamento(null); }}
      />


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
