import { useState, useRef } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useDpDocumentos, type DpDocumentoRow } from "@/hooks/useDpDocumentos";

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
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { TableSkeleton } from "@/components/dp/DpSkeletons";
import { DpContentCard, DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { MobileDetailsSheet } from "@/components/dp/MobileCardKit";
import { StatusBadge } from "@/pages/dp/portal/DpMeuDocumentos";
import type { Database } from "@/integrations/supabase/types";

type Tipo = Database["public"]["Enums"]["dp_documento_tipo"];
type Aprov = "pendente" | "aprovado" | "recusado";
type Row = Database["public"]["Tables"]["dp_documentos"]["Row"] & { dp_colaboradores?: { nome: string } | null };

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


export default function DpDocumentos() {
  const { categoria } = useParams<{ categoria?: string }>();
  const filterTipo = TIPOS.find((t) => t.value === categoria)?.value;
  const currentLabel = TIPOS.find((t) => t.value === filterTipo)?.label;

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
  const [detailsRow, setDetailsRow] = useState<Row | null>(null);

  const {
    isLoading,
    filteredRows,
    counts,
    enviar,
    download,
    remover,
    aprovar,
    recusar: recusarMut,
  } = useDpDocumentos(filterTipo, { statusFilter, search, periodoInicio, periodoFim });

  const list = { isLoading };
  const del = remover;

  const recusar = {
    isPending: recusarMut.isPending,
    mutate: (vars: { row: Row; motivo: string }) =>
      recusarMut.mutate(vars, {
        onSuccess: () => { setRejectRow(null); setRejectMotivo(""); },
      }),
  };

  const openDialog = () => {
    setForm({ colaborador_id: "", tipo: (filterTipo ?? "outros") as Tipo, titulo: "", descricao: "", referencia_data: "" });
    setDialogOpen(true);
  };

  const submit = async () => {
    const files = fileRef.current?.files;
    if (!files || files.length === 0) return toast.error("Selecione ao menos um arquivo");
    if (files.length === 1 && !form.titulo.trim()) return toast.error("Título é obrigatório");
    setUploading(true);
    try {
      const ok = await enviar({ files: Array.from(files), ...form });
      toast.success(`${ok} documento(s) enviado(s)`);
      setDialogOpen(false);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      toast.error("Erro ao enviar", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setUploading(false);
    }
  };


  const title = currentLabel ? `${currentLabel} — Documentos` : "Documentos";

  return (
    <DpPage>
      <Helmet><title>{title} — Pessoas 360°</title></Helmet>
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


      <DpContentCard contentClassName="overflow-x-auto hidden md:block">
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

      {/* Mobile: lista de cards */}
      <div className="md:hidden space-y-3">
        {list.isLoading && (
          <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">Carregando…</div>
        )}
        {!list.isLoading && filteredRows.length === 0 && (
          <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">Nenhum documento.</div>
        )}
        {!list.isLoading && filteredRows.map((r) => {
          const status = (r as any).aprovacao_status as Aprov;
          const submetido = (r as any).submetido_por_colaborador as boolean;
          const motivo = (r as any).motivo_recusao as string | null;
          return (
            <div
              key={r.id}
              role="button"
              tabIndex={0}
              onClick={() => setDetailsRow(r)}
              onKeyDown={(e) => { if (e.key === "Enter") setDetailsRow(r); }}
              className="rounded-2xl border border-border bg-card p-4 space-y-2 cursor-pointer hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{r.titulo}</div>
                  {r.dp_colaboradores?.nome && <div className="text-[11px] text-muted-foreground truncate">{r.dp_colaboradores.nome}</div>}
                </div>
                <StatusBadge status={status} />
              </div>
              <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                {!filterTipo && <Badge variant="outline" className="capitalize text-[10px]">{r.tipo}</Badge>}
                {r.referencia_data && <span>Ref: {r.referencia_data}</span>}
                {submetido && <span className="text-primary">↑ Colab.</span>}
              </div>
              <div
                className="flex gap-1 pt-2 border-t border-border/60"
                onClick={(e) => e.stopPropagation()}
              >
                {status === "pendente" && (
                  <>
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label="Aprovar documento"
                      title="Aprovar"
                      className="h-11 w-11 border-primary/40 text-primary hover:bg-primary/10"
                      onClick={() => aprovar.mutate(r)}
                      disabled={aprovar.isPending}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label="Recusar documento"
                      title="Recusar"
                      className="h-11 w-11 border-destructive/40 text-destructive hover:bg-destructive/10"
                      onClick={() => { setRejectRow(r); setRejectMotivo(""); }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                )}
                <Button size="icon" variant="ghost" aria-label="Baixar" title="Baixar" className="h-11 w-11" onClick={() => download(r)}>
                  <Download className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" aria-label="Excluir" title="Excluir" className="h-11 w-11" onClick={() => setToDelete(r)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <MobileDetailsSheet
        open={!!detailsRow}
        onOpenChange={(o) => !o && setDetailsRow(null)}
        title={detailsRow?.titulo ?? "Documento"}
        description={detailsRow ? TIPOS.find(t => t.value === detailsRow.tipo)?.label : undefined}
        meta={detailsRow ? [
          { label: "Colaborador", value: detailsRow.dp_colaboradores?.nome ?? "—" },
          { label: "Status", value: <StatusBadge status={(detailsRow as any).aprovacao_status} /> },
          ...(detailsRow.referencia_data ? [{ label: "Referência", value: detailsRow.referencia_data }] : []),
          ...(detailsRow.descricao ? [{ label: "Descrição", value: detailsRow.descricao }] : []),
          { label: "Arquivo", value: <span className="truncate inline-flex items-center gap-1"><FileText className="h-3 w-3" />{detailsRow.file_name ?? detailsRow.file_path}</span> },
          ...(((detailsRow as any).motivo_recusao) ? [{ label: "Motivo", value: <span className="text-destructive">{(detailsRow as any).motivo_recusao}</span> }] : []),
        ] : []}
        footer={detailsRow ? (
          <div className="flex gap-2 w-full flex-wrap">
            {(detailsRow as any).aprovacao_status === "pendente" && (
              <>
                <Button
                  variant="outline"
                  className="flex-1 border-primary/40 text-primary hover:bg-primary/10"
                  onClick={() => { aprovar.mutate(detailsRow); setDetailsRow(null); }}
                  disabled={aprovar.isPending}
                >
                  <Check className="h-4 w-4 mr-1" /> Aprovar
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={() => { setRejectRow(detailsRow); setRejectMotivo(""); setDetailsRow(null); }}
                >
                  <X className="h-4 w-4 mr-1" /> Recusar
                </Button>
              </>
            )}
            <Button variant="outline" className="flex-1" onClick={() => download(detailsRow)}>
              <Download className="h-4 w-4 mr-1" /> Baixar
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => { setToDelete(detailsRow); setDetailsRow(null); }}>
              <Trash2 className="h-4 w-4 mr-1 text-destructive" /> Excluir
            </Button>
          </div>
        ) : null}
      />


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
          <DialogHeader><DialogTitle>Novo documento</DialogTitle><DialogDescription>Envie um ou mais arquivos vinculados a uma categoria e opcionalmente a um colaborador.</DialogDescription></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label>Título {(fileRef.current?.files?.length ?? 0) > 1 ? "(ignorado em envio em lote)" : "*"}</Label>
              <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ex.: Contracheque 07/2026" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
