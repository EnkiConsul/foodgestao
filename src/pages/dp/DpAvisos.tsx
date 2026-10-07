import { Helmet } from "react-helmet-async";
import { prepararUpload } from "@/lib/storage/uploadPolicy";
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
import { useDpUnidades, useDpCargos, useDpSindicatos } from "@/hooks/useDpCadastros";
import { useDpSetores } from "@/hooks/useDpSetores";
import { MultiSelectFilter } from "@/components/lancamentos/MultiSelectFilter";

type Publico = {
  unidades: string[]; cargos: string[]; setores: string[];
  sindicatos: string[]; regimes: string[]; colaboradores: string[];
};
const REGIMES = [
  { id: "clt", name: "CLT" }, { id: "intermitente", name: "Intermitente" },
  { id: "freelancer", name: "Freelancer" }, { id: "estagio", name: "Estágio" },
  { id: "temporario", name: "Temporário" }, { id: "pj", name: "PJ" }, { id: "mei", name: "MEI" },
];
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeStorageFilename } from "@/lib/storage";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { nomeExibicao } from "@/lib/dp/nomeExibicao";
import { notifyError } from "@/lib/notifyError";
import { DpErrorState } from "@/components/dp/DpErrorState";
import { mensagemErro } from "@/lib/dp/mensagemErro";

const MAX_UPLOAD_MB = 10;
const ALLOWED_MIMES = [
  "application/pdf", "image/png", "image/jpeg", "image/webp",
];

export function AvisoDialog({
  aviso, open, onOpenChange, onSave, companyId,
}: {
  aviso?: DpAviso | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (v: Partial<DpAviso> & { titulo: string; conteudo: string }) => Promise<void>;
  companyId: string | null;
}) {
  const [titulo, setTitulo] = useState(aviso?.titulo ?? "");
  const [conteudo, setConteudo] = useState(aviso?.conteudo ?? "");
  const [dataInicio, setDataInicio] = useState(aviso?.publicado_em?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [dataFim, setDataFim] = useState(aviso?.expira_em?.slice(0, 10) ?? "");
  const publicoInicial = ((): Publico => {
    const a = aviso as any;
    const base: Publico = { unidades: [], cargos: [], setores: [], sindicatos: [], regimes: [], colaboradores: [] };
    if (!a) return base;
    if (a.escopo === "segmentado" && a.publico) return { ...base, ...a.publico };
    if (a.escopo === "unidade" && a.unidade_id) return { ...base, unidades: [a.unidade_id] };
    if (a.escopo === "cargo" && a.cargo_id) return { ...base, cargos: [a.cargo_id] };
    if (a.escopo === "colaborador" && a.colaborador_id) return { ...base, colaboradores: [a.colaborador_id] };
    return base;
  })();
  const [modoPublico, setModoPublico] = useState<"todos" | "segmentado">(
    aviso && aviso.escopo !== "todos" ? "segmentado" : "todos",
  );
  const [publico, setPublico] = useState<Publico>(publicoInicial);
  const setP = (k: keyof Publico) => (v: string[]) => setPublico((p) => ({ ...p, [k]: v }));
  const [arquivoPath, setArquivoPath] = useState(aviso?.arquivo_path ?? "");
  const [arquivoMime, setArquivoMime] = useState(aviso?.arquivo_mime ?? "");
  const [uploading, setUploading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [leituraObrigatoria, setLeituraObrigatoria] = useState<boolean>((aviso as any)?.leitura_obrigatoria ?? false);
  const [permitirReacoes, setPermitirReacoes] = useState<boolean>((aviso as any)?.permitir_reacoes ?? true);
  const [permitirComentarios, setPermitirComentarios] = useState<boolean>((aviso as any)?.permitir_comentarios ?? false);

  const unidades = useDpUnidades();
  const colaboradores = useDpColaboradores();
  const cargos = useDpCargos();
  const sindicatos = useDpSindicatos();
  const { todos: setores } = useDpSetores();

  const colabsAtivos = useMemo(
    () => ((colaboradores.data ?? []) as any[]).filter((c) => !c.desligado_em && c.ativo !== false),
    [colaboradores.data],
  );
  const filtrosSegmento = publico.unidades.length + publico.cargos.length + publico.setores.length
    + publico.sindicatos.length + publico.regimes.length;
  const alcance = useMemo(() => {
    if (modoPublico === "todos") return colabsAtivos.length;
    return colabsAtivos.filter((c) => {
      if (publico.colaboradores.includes(c.id)) return true;
      if (filtrosSegmento === 0) return false;
      const ok = (lista: string[], v: string | null) => lista.length === 0 || (!!v && lista.includes(v));
      return ok(publico.unidades, c.unidade_id) && ok(publico.cargos, c.cargo_id)
        && ok(publico.setores, c.setor_id) && ok(publico.sindicatos, c.sindicato_id)
        && ok(publico.regimes, c.regime);
    }).length;
  }, [modoPublico, colabsAtivos, publico, filtrosSegmento]);
  const publicoVazio = modoPublico === "segmentado" && filtrosSegmento === 0 && publico.colaboradores.length === 0;

  const uploadFile = async (escolhido: File) => {
    if (!companyId) return toast.error("Selecione uma empresa");
    setUploading(true);
    try {
      // Foto de iPhone (HEIC) vira JPEG antes de subir.
      const file = await prepararUpload("dp-documentos", escolhido);
      if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
        return toast.error(`Arquivo maior que ${MAX_UPLOAD_MB}MB`);
      }
      if (file.type && !ALLOWED_MIMES.includes(file.type)) {
        return toast.error("Tipo de arquivo não permitido (PDF ou imagem)");
      }
      const safeName = sanitizeStorageFilename(file.name);
      const path = `${companyId}/avisos/${Date.now()}-${safeName}`;
      const up = await supabase.storage.from("dp-documentos").upload(path, file, { contentType: file.type });
      if (up.error) throw up.error;
      setArquivoPath(path);
      setArquivoMime(file.type);
      toast.success("Arquivo enviado");
    } catch (e: any) {
      notifyError(e, { surface: "Avisos", action: "concluir a ação", fallback: "Erro no upload" });
    } finally { setUploading(false); }
  };

  const parseDest = () => {
    if (modoPublico === "segmentado") {
      return { escopo: "segmentado" as any, unidade_id: null, cargo_id: null, colaborador_id: null, publico };
    }
    return { escopo: "todos" as const, unidade_id: null, cargo_id: null, colaborador_id: null, publico: null };
  };
  const ms = "mt-0 h-10 text-sm px-3";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
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
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Data Início *</Label>
              <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
            </div>
            <div>
              <Label>Data Fim *</Label>
              <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
            </div>
          </div>
          <div className="space-y-3">
            <Label>Público</Label>
            <Select value={modoPublico} onValueChange={(v) => setModoPublico(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Colaboradores</SelectItem>
                <SelectItem value="segmentado">Escolher Público (Unidade, Cargo, Setor…)</SelectItem>
              </SelectContent>
            </Select>
            {modoPublico === "segmentado" && (
              <div className="space-y-3 rounded-md border p-3">
                <p className="text-xs text-muted-foreground">
                  Combine os filtros: o aviso vai para quem atende a todos os filtros marcados. Colaboradores escolhidos na lista sempre recebem.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="min-w-0 space-y-1">
                    <Label className="text-xs">Unidades</Label>
                    <MultiSelectFilter triggerClassName={ms} value={publico.unidades} onChange={setP("unidades")}
                      options={((unidades.data ?? []) as any[]).map((u) => ({ id: u.id, name: u.nome }))} />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <Label className="text-xs">Cargos</Label>
                    <MultiSelectFilter triggerClassName={ms} allLabel="Todos" itemLabelSingular="selecionado" itemLabelPlural="selecionados"
                      value={publico.cargos} onChange={setP("cargos")}
                      options={((cargos.data ?? []) as any[]).map((c) => ({ id: c.id, name: c.nome }))} />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <Label className="text-xs">Setores</Label>
                    <MultiSelectFilter triggerClassName={ms} allLabel="Todos" itemLabelSingular="selecionado" itemLabelPlural="selecionados"
                      value={publico.setores} onChange={setP("setores")}
                      options={setores.filter((s) => s.ativo).map((s) => {
                        const un = ((unidades.data ?? []) as any[]).find((u) => u.id === s.unidade_id)?.nome;
                        return { id: s.id, name: un ? `${s.nome} — ${un}` : s.nome };
                      })} />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <Label className="text-xs">Sindicatos</Label>
                    <MultiSelectFilter triggerClassName={ms} allLabel="Todos" itemLabelSingular="selecionado" itemLabelPlural="selecionados"
                      value={publico.sindicatos} onChange={setP("sindicatos")}
                      options={((sindicatos.data ?? []) as any[]).filter((s) => s.ativo !== false).map((s) => ({ id: s.id, name: s.nome }))} />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <Label className="text-xs">Vínculos</Label>
                    <MultiSelectFilter triggerClassName={ms} allLabel="Todos" itemLabelSingular="selecionado" itemLabelPlural="selecionados"
                      value={publico.regimes} onChange={setP("regimes")} options={REGIMES} />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <Label className="text-xs">Colaboradores Específicos</Label>
                    <MultiSelectFilter triggerClassName={ms} allLabel="Nenhum" itemLabelSingular="selecionado" itemLabelPlural="selecionados"
                      searchPlaceholder="Buscar colaborador..."
                      value={publico.colaboradores} onChange={setP("colaboradores")}
                      options={colabsAtivos.map((c) => ({ id: c.id, name: nomeExibicao(c) }))} />
                  </div>
                </div>
              </div>
            )}
            <p className={publicoVazio ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
              {publicoVazio
                ? "Escolha ao menos um filtro ou colaborador."
                : `Alcance estimado: ${alcance} colaborador(es) ativo(s).`}
            </p>
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
          <Button variant="outline" disabled={salvando} onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={!titulo || !conteudo || !dataInicio || !dataFim || uploading || salvando || publicoVazio}
            onClick={async () => {
              if (salvando) return;
              const dest = parseDest();
              setSalvando(true);
              try {
                await onSave({
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
              } catch {
                /* Erro já sinalizado pela mutação; janela e dados permanecem. */
              } finally {
                setSalvando(false);
              }
            }}
          >
            {salvando ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function DpAvisos() {
  const { data: avisos = [], isLoading, isError, error, refetch, upsert, remove } = useDpAvisos();
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
    if (error) return notifyError(error, { surface: "Avisos", action: "concluir a ação" });
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const destinoLabel = (a: DpAviso) => {
    if (a.escopo === "unidade") return "Unidade Específica";
    if ((a as any).escopo === "colaborador") return "Colaborador Específico";
    if ((a as any).escopo === "segmentado") return "Público Segmentado";
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
      ) : isError ? (
        <DpErrorState message={mensagemErro(error)} onRetry={() => void refetch()} />
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
                  <Button aria-label="Ver estatísticas" size="icon" variant="ghost" title="Engajamento" onClick={() => setEngajamento(a)}>
                    <BarChart3 className="h-4 w-4" />
                  </Button>
                  <Button aria-label="Editar aviso" size="icon" variant="ghost" onClick={() => { setEditing(a); setOpen(true); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button aria-label="Excluir aviso" size="icon" variant="ghost" onClick={() => setToDelete(a)}>
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
          onSave={async (v) => { await upsert.mutateAsync(v); }}
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
              disabled={remove.isPending}
              onClick={() => {
                if (!toDelete || remove.isPending) return;
                remove.mutate(toDelete.id);
                setToDelete(null);
              }}
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
