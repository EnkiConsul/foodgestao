import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Upload, History, Download, Pencil, Check, X, Trash2, Eye,
  FileText, Clock, Loader2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";

import { DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";
import { BulkImportPanel } from "@/components/dp/documentos/BulkImportPanel";


type Tipo = "contracheque" | "ponto" | "adiantamento";
type Aprov = Database["public"]["Enums"]["dp_documento_aprovacao_status"];
type Row = Database["public"]["Tables"]["dp_documentos"]["Row"];

const BUCKET = "dp-documentos";
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const CONFIG: Record<Tipo, {
  titulo: string; descricao: string; importTitle: string; icon: LucideIcon;
}> = {
  contracheque: {
    titulo: "Contracheques",
    descricao: "Importe e gerencie contracheques dos colaboradores.",
    importTitle: "Importar Contracheques",
    icon: FileText,
  },
  ponto: {
    titulo: "Folhas de Ponto",
    descricao: "Importe e gerencie as folhas de ponto dos colaboradores.",
    importTitle: "Importar Folhas de Ponto",
    icon: Clock,
  },
  adiantamento: {
    titulo: "Adiantamentos",
    descricao: "Importe e gerencie adiantamentos salariais dos colaboradores.",
    importTitle: "Importar Adiantamentos",
    icon: FileText,
  },
};

function parseMesAno(row: Row): { mes: number; ano: number } | null {
  if (!row.referencia_data) return null;
  const [y, m] = row.referencia_data.split("-");
  const ano = Number(y), mes = Number(m);
  if (!ano || !mes) return null;
  return { mes, ano };
}

function StatusBadge({ status }: { status: Aprov }) {
  if (status === "aprovado")
    return <Badge className="bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/30 font-normal lowercase">disponível</Badge>;
  if (status === "recusado")
    return <Badge className="bg-destructive/15 text-destructive border-destructive/30 font-normal lowercase">recusado</Badge>;
  return <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 font-normal lowercase">pendente</Badge>;
}

export default function DpDocumentosPorTipo({ tipo: tipoProp }: { tipo?: Tipo } = {}) {
  const { categoria } = useParams<{ categoria: Tipo }>();
  const tipo = (tipoProp ?? categoria ?? "contracheque") as Tipo;
  const cfg = CONFIG[tipo] ?? CONFIG.contracheque;
  const Icon = cfg.icon;

  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const { data: colaboradores = [] } = useDpColaboradores();

  const [aba, setAba] = useState<"importar" | "historico">("importar");

  // Filtros
  const [filtroColab, setFiltroColab] = useState("todos");
  const [filtroMes, setFiltroMes] = useState("todos");
  const [filtroAno, setFiltroAno] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState<Aprov | "todos">("todos");
  const [filtroUnidade, setFiltroUnidade] = useState("todos");

  // Edição / diálogos
  const [editando, setEditando] = useState<string | null>(null);
  const [editMes, setEditMes] = useState("");
  const [editAno, setEditAno] = useState("");
  const [busy, setBusy] = useState(false);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<Row | null>(null);

  const [toDelete, setToDelete] = useState<Row | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const list = useQuery({
    queryKey: ["dp_documentos", tipo, selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_documentos")
        .select("*")
        .eq("company_id", selectedCompanyId!)
        .eq("tipo", tipo)
        .order("referencia_data", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const unidades = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of colaboradores) {
      if (c.unidade_id && c.unidade_nome) map.set(c.unidade_id, c.unidade_nome);
    }
    return Array.from(map, ([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [colaboradores]);

  const colabMap = useMemo(() => new Map(colaboradores.map((c) => [c.id, c])), [colaboradores]);

  const anosDisponiveis = useMemo(() => {
    const set = new Set<number>();
    for (const d of list.data ?? []) {
      const ma = parseMesAno(d);
      if (ma) set.add(ma.ano);
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [list.data]);

  const filtrados = useMemo(() => {
    return (list.data ?? []).filter((d) => {
      const ma = parseMesAno(d);
      if (filtroColab !== "todos" && d.colaborador_id !== filtroColab) return false;
      if (filtroMes !== "todos" && ma?.mes !== Number(filtroMes)) return false;
      if (filtroAno !== "todos" && ma?.ano !== Number(filtroAno)) return false;
      if (filtroStatus !== "todos" && d.aprovacao_status !== filtroStatus) return false;
      const colab = d.colaborador_id ? colabMap.get(d.colaborador_id) : null;
      if (filtroUnidade !== "todos" && colab?.unidade_id !== filtroUnidade) return false;
      return true;
    }).sort((a, b) => {
      const ma = parseMesAno(a); const mb = parseMesAno(b);
      if (ma && mb) {
        if (ma.ano !== mb.ano) return mb.ano - ma.ano;
        if (ma.mes !== mb.mes) return mb.mes - ma.mes;
      }
      const na = a.colaborador_id ? colabMap.get(a.colaborador_id)?.nome ?? "" : "";
      const nb = b.colaborador_id ? colabMap.get(b.colaborador_id)?.nome ?? "" : "";
      return na.localeCompare(nb);
    });
  }, [list.data, filtroColab, filtroMes, filtroAno, filtroStatus, filtroUnidade, colabMap]);


  const handleDownload = async (row: Row) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(row.file_path, 60);
    if (error || !data) return toast.error("Erro ao gerar link");
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.target = "_blank";
    a.rel = "noopener";
    a.download = row.file_name ?? "";
    document.body.appendChild(a); a.click(); a.remove();
  };

  const handlePreview = async (row: Row) => {
    setPreviewDoc(row);
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(row.file_path, 60);
    if (error || !data) return toast.error("Erro ao gerar visualização");
    setPreviewUrl(data.signedUrl);
    setPreviewOpen(true);
  };

  const startEditing = (row: Row) => {
    const ma = parseMesAno(row);
    setEditando(row.id);
    setEditMes(ma ? String(ma.mes) : "");
    setEditAno(ma ? String(ma.ano) : "");
  };

  const saveEdit = async (id: string) => {
    const mes = Number(editMes), ano = Number(editAno);
    if (!mes || !ano) return toast.error("Mês e ano são obrigatórios");
    setBusy(true);
    const refDate = `${ano}-${String(mes).padStart(2, "0")}-01`;
    const { error } = await supabase.from("dp_documentos")
      .update({ referencia_data: refDate }).eq("id", id);
    setBusy(false);
    if (error) return toast.error("Erro ao atualizar", { description: error.message });
    toast.success("Competência atualizada");
    setEditando(null);
    qc.invalidateQueries({ queryKey: ["dp_documentos"] });
    qc.invalidateQueries({ queryKey: ["dp_pendencias"] });
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setExcluindo(true);
    try {
      await supabase.storage.from(BUCKET).remove([toDelete.file_path]);
      const { error } = await supabase.from("dp_documentos").delete().eq("id", toDelete.id);
      if (error) throw error;
      toast.success("Documento excluído");
      setToDelete(null);
      qc.invalidateQueries({ queryKey: ["dp_documentos"] });
      qc.invalidateQueries({ queryKey: ["dp_doc_counts"] });
      qc.invalidateQueries({ queryKey: ["dp_pendencias"] });
    } catch (e) {
      toast.error("Erro ao excluir", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setExcluindo(false);
    }
  };

  return (
    <DpPage>
      <Helmet><title>{cfg.titulo} — Pessoas 360°</title></Helmet>


      <DpPageHeader
        icon={Icon}
        title={cfg.titulo}
        description={cfg.descricao}
      />

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setAba("importar")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors",
            aba === "importar"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <Upload className="size-4" /> Importar
        </button>
        <button
          onClick={() => setAba("historico")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors",
            aba === "historico"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <History className="size-4" /> Histórico
        </button>
      </div>

      {aba === "importar" && (
        <BulkImportPanel tipoFixed={tipo} title={cfg.importTitle} />
      )}



      {aba === "historico" && (
        <div className="space-y-4">
          {/* Filtros */}
          <div className="bg-card border border-border rounded-2xl p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground font-bold">Colaborador</Label>
              <Select value={filtroColab} onValueChange={setFiltroColab}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {colaboradores.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground font-bold">Mês</Label>
              <Select value={filtroMes} onValueChange={setFiltroMes}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {MESES.map((m, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground font-bold">Ano</Label>
              <Select value={filtroAno} onValueChange={setFiltroAno}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {anosDisponiveis.map((a) => (
                    <SelectItem key={a} value={String(a)}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground font-bold">Status</Label>
              <Select value={filtroStatus} onValueChange={(v) => setFiltroStatus(v as any)}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="aprovado">Disponível</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="recusado">Recusado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase text-muted-foreground font-bold">Unidade</Label>
              <Select value={filtroUnidade} onValueChange={setFiltroUnidade}>
                <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas</SelectItem>
                  {unidades.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {list.isLoading ? (
            <div className="flex items-center justify-center p-12 text-muted-foreground">
              <Loader2 className="size-6 animate-spin mr-2" /> Carregando...
            </div>
          ) : filtrados.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">
              Nenhum documento encontrado com os filtros selecionados.
            </div>
          ) : (
            <>
            <div className="bg-card border border-border rounded-2xl hidden md:block">
              <table className="w-full table-fixed text-sm">
                <thead className="border-b border-border">
                  <tr>
                    <th className="text-left p-4 font-bold uppercase text-[10px] text-muted-foreground w-[24%]">Colaborador</th>
                    <th className="text-left p-4 font-bold uppercase text-[10px] text-muted-foreground w-[20%]">Competência</th>
                    <th className="text-left p-4 font-bold uppercase text-[10px] text-muted-foreground w-[16%]">Unidade</th>
                    <th className="text-left p-4 font-bold uppercase text-[10px] text-muted-foreground w-[14%]">Status</th>
                    <th className="text-left p-4 font-bold uppercase text-[10px] text-muted-foreground w-[14%]">Aprovado em</th>
                    <th className="text-right p-4 font-bold uppercase text-[10px] text-muted-foreground w-[12%]">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtrados.map((doc) => {
                    const colab = doc.colaborador_id ? colabMap.get(doc.colaborador_id) : null;
                    const ma = parseMesAno(doc);
                    const isEditing = editando === doc.id;
                    return (
                      <tr key={doc.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-4 font-semibold truncate" title={colab?.nome ?? ""}>
                          {colab?.nome ?? "—"}
                        </td>
                        <td className="p-4">
                          {isEditing ? (
                            <div className="flex items-center gap-2">
                              <Select value={editMes} onValueChange={setEditMes}>
                                <SelectTrigger className="w-[100px] h-8"><SelectValue placeholder="Mês" /></SelectTrigger>
                                <SelectContent>
                                  {MESES.map((m, i) => (
                                    <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Input className="w-[90px] h-8" placeholder="Ano" value={editAno}
                                onChange={(e) => setEditAno(e.target.value.replace(/\D/g, ""))} maxLength={4} />
                              <Button size="icon" className="size-8" onClick={() => saveEdit(doc.id)} disabled={busy}>
                                {busy ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                              </Button>
                              <Button size="icon" variant="ghost" className="size-8" onClick={() => setEditando(null)}>
                                <X className="size-3" />
                              </Button>
                            </div>
                          ) : (
                            <span>
                              {ma ? `${String(ma.mes).padStart(2, "0")}/${ma.ano}` : "—"}
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-muted-foreground">
                          {colab?.unidade_nome ?? "—"}
                        </td>
                        <td className="p-4">
                          <StatusBadge status={doc.aprovacao_status} />
                        </td>
                        <td className="p-4 text-muted-foreground text-xs">
                          {(() => {
                            const when = doc.revisado_em ?? (doc as any).created_at;
                            if (!when) return "—";
                            const d = new Date(when);
                            const label = doc.revisado_em && doc.aprovacao_status === "aprovado" ? "" : "Importado ";
                            return label +
                              d.toLocaleDateString("pt-BR") + " às " +
                              d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                          })()}
                        </td>
                        <td className="p-4 text-right whitespace-nowrap">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="size-8 text-blue-600 hover:text-blue-700 hover:bg-blue-500/10"
                              title="Visualizar" onClick={() => handlePreview(doc)}>
                              <Eye className="size-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="size-8"
                              title="Editar competência" onClick={() => startEditing(doc)}>
                              <Pencil className="size-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="size-8"
                              title="Baixar" onClick={() => handleDownload(doc)}>
                              <Download className="size-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                              title="Excluir" onClick={() => setToDelete(doc)}>
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile: lista de cards */}
            <div className="md:hidden space-y-3">
              {filtrados.map((doc) => {
                const colab = doc.colaborador_id ? colabMap.get(doc.colaborador_id) : null;
                const ma = parseMesAno(doc);
                const isEditing = editando === doc.id;
                const when = doc.revisado_em ?? (doc as any).created_at;
                return (
                  <div key={doc.id} className="rounded-2xl border border-border bg-card p-4 space-y-2 active:scale-[0.98] transition-transform">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold truncate">{colab?.nome ?? "—"}</div>
                        {colab?.unidade_nome && <div className="text-[11px] text-muted-foreground truncate">{colab.unidade_nome}</div>}
                      </div>
                      <StatusBadge status={doc.aprovacao_status} />
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Competência: <span className="font-mono">{ma ? `${String(ma.mes).padStart(2, "0")}/${ma.ano}` : "—"}</span>
                      {when && (
                        <> · {doc.revisado_em && doc.aprovacao_status === "aprovado" ? "Aprovado em " : "Importado "}
                          {new Date(when).toLocaleDateString("pt-BR")}
                        </>
                      )}
                    </div>
                    {isEditing && (
                      <div className="flex items-center gap-2 pt-1">
                        <Select value={editMes} onValueChange={setEditMes}>
                          <SelectTrigger className="w-[100px] h-9"><SelectValue placeholder="Mês" /></SelectTrigger>
                          <SelectContent>
                            {MESES.map((m, i) => (
                              <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input className="w-[90px] h-9" placeholder="Ano" value={editAno}
                          onChange={(e) => setEditAno(e.target.value.replace(/\D/g, ""))} maxLength={4} />
                        <Button size="icon" className="size-9" onClick={() => saveEdit(doc.id)} disabled={busy}>
                          {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                        </Button>
                        <Button size="icon" variant="ghost" className="size-9" onClick={() => setEditando(null)}>
                          <X className="size-4" />
                        </Button>
                      </div>
                    )}
                    <div className="flex gap-1 pt-1 border-t border-border/60">
                      <Button size="sm" variant="ghost" className="min-h-11 flex-1 text-blue-600" onClick={() => handlePreview(doc)}>
                        <Eye className="size-4 mr-1" /> Ver
                      </Button>
                      <Button size="sm" variant="ghost" className="min-h-11 flex-1" onClick={() => startEditing(doc)}>
                        <Pencil className="size-4 mr-1" /> Editar
                      </Button>
                      <Button size="icon" variant="ghost" className="min-h-11 min-w-11" onClick={() => handleDownload(doc)} title="Baixar">
                        <Download className="size-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="min-h-11 min-w-11 text-destructive" onClick={() => setToDelete(doc)} title="Excluir">
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
            </>
          )}

        </div>
      )}

      {/* Preview */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Visualização do Documento</DialogTitle>
            <DialogDescription>
              {previewDoc ? (() => {
                const ma = parseMesAno(previewDoc);
                return `${cfg.titulo.slice(0, -1)} — ${ma ? `${String(ma.mes).padStart(2, "0")}/${ma.ano}` : previewDoc.titulo}`;
              })() : "Documento"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-[500px] bg-muted/20 rounded-lg overflow-hidden">
            {previewUrl ? (
              <iframe src={previewUrl} className="w-full h-[600px] border-0" title="Visualização do documento" />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">Carregando visualização...</div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>Fechar</Button>
            <Button onClick={() => previewDoc && handleDownload(previewDoc)}>
              <Download className="size-4 mr-1" /> Baixar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Excluir */}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir documento?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                Tem certeza que deseja excluir este documento?
                <br /><br />
                <strong>Colaborador:</strong>{" "}
                {toDelete?.colaborador_id ? colabMap.get(toDelete.colaborador_id)?.nome ?? "—" : "—"}
                <br />
                <strong>Competência:</strong>{" "}
                {(() => {
                  if (!toDelete) return "";
                  const ma = parseMesAno(toDelete);
                  return ma ? `${String(ma.mes).padStart(2, "0")}/${ma.ano}` : "—";
                })()}
                <br /><br />
                Esta ação <strong>não pode ser desfeita</strong>.
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={excluindo}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {excluindo ? <Loader2 className="size-4 mr-2 animate-spin" /> : null}
              {excluindo ? "Excluindo..." : "Sim, excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DpPage>
  );
}
