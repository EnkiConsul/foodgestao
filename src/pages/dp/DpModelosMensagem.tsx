import { Helmet } from "react-helmet-async";
import { useMemo, useState } from "react";
import { MessageSquare, Plus, Trash2, Pencil, Search, Eye } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/dp/DpSkeletons";
import { DpContentCard, DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { applyModeloVars } from "@/hooks/useDpModelosMensagem";

type Modelo = {
  id: string; titulo: string; corpo: string; canal: "whatsapp" | "email" | "sms";
  variaveis: string[]; ativo: boolean;
};

export default function DpModelosMensagem() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Modelo | null>(null);
  const [form, setForm] = useState({ titulo: "", corpo: "", canal: "whatsapp" as Modelo["canal"], variaveis: "", ativo: true });
  const [toDelete, setToDelete] = useState<Modelo | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | "ativo" | "inativo">("todos");
  const [canalFilter, setCanalFilter] = useState<string>("todos");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<Modelo | null>(null);
  const [previewVars, setPreviewVars] = useState<Record<string, string>>({});

  const list = useQuery({
    queryKey: ["dp_modelos", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("dp_modelos_mensagem")
        .select("*").eq("company_id", selectedCompanyId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any as Modelo[];
    },
  });

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return (list.data ?? []).filter((m) => {
      if (statusFilter === "ativo" && !m.ativo) return false;
      if (statusFilter === "inativo" && m.ativo) return false;
      if (canalFilter !== "todos" && m.canal !== canalFilter) return false;
      if (s && !`${m.titulo} ${m.corpo}`.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [list.data, search, statusFilter, canalFilter]);

  const openNew = () => {
    setEditing(null);
    setForm({ titulo: "", corpo: "", canal: "whatsapp", variaveis: "", ativo: true });
    setOpen(true);
  };
  const openEdit = (m: Modelo) => {
    setEditing(m);
    setForm({ titulo: m.titulo, corpo: m.corpo, canal: m.canal, variaveis: (m.variaveis ?? []).join(", "), ativo: m.ativo });
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("Sem empresa");
      const payload: any = {
        company_id: selectedCompanyId,
        titulo: form.titulo.trim(),
        corpo: form.corpo,
        canal: form.canal,
        ativo: form.ativo,
        variaveis: form.variaveis.split(",").map((s) => s.trim()).filter(Boolean),
      };
      if (editing) {
        const { error } = await supabase.from("dp_modelos_mensagem").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("dp_modelos_mensagem").insert(payload).select("id").single();
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Modelo atualizado" : "Modelo criado");
      qc.invalidateQueries({ queryKey: ["dp_modelos"] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const toggleAtivo = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from("dp_modelos_mensagem").update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dp_modelos"] }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_modelos_mensagem").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Removido"); qc.invalidateQueries({ queryKey: ["dp_modelos"] }); },
  });

  const openPreview = (m: Modelo) => {
    setPreview(m);
    const vars: Record<string, string> = {};
    (m.variaveis ?? []).forEach((v) => { vars[v] = ""; });
    setPreviewVars(vars);
    setPreviewOpen(true);
  };

  return (
    <DpPage>
      <Helmet><title>Modelos de mensagem — Pessoas 360°</title></Helmet>
      <DpPageHeader
        icon={MessageSquare}
        title="Modelos de mensagem"
        description="Templates de WhatsApp/e-mail com variáveis."
        actions={<Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo modelo</Button>}
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por título ou corpo..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        <Select value={canalFilter} onValueChange={setCanalFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos canais</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="email">E-mail</SelectItem>
            <SelectItem value="sms">SMS</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="ativo">Ativos</SelectItem>
            <SelectItem value="inativo">Inativos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DpContentCard contentClassName="overflow-x-auto hidden md:block">
          {list.isLoading ? <TableSkeleton columns={5} headers={["Título", "Canal", "Variáveis", "Ativo", ""]} /> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Variáveis</TableHead>
                  <TableHead className="w-20">Ativo</TableHead>
                  <TableHead className="w-32"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((m) => (
                  <TableRow key={m.id} className={!m.ativo ? "opacity-60" : ""}>
                    <TableCell className="font-medium">{m.titulo}</TableCell>
                    <TableCell><Badge variant="outline" className="uppercase">{m.canal}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{(m.variaveis ?? []).join(", ") || "—"}</TableCell>
                    <TableCell>
                      <Switch checked={m.ativo} onCheckedChange={(v) => toggleAtivo.mutate({ id: m.id, ativo: v })} />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" onClick={() => openPreview(m)} title="Preview"><Eye className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => openEdit(m)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => setToDelete(m)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum modelo encontrado.</TableCell></TableRow>
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
        {!list.isLoading && filtered.length === 0 && (
          <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">Nenhum modelo encontrado.</div>
        )}
        {!list.isLoading && filtered.map((m) => (
          <div key={m.id} className={"rounded-2xl border border-border bg-card p-4 space-y-3 active:scale-[0.98] transition-transform " + (!m.ativo ? "opacity-60" : "")}>
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium min-w-0 flex-1 truncate">{m.titulo}</div>
              <Switch checked={m.ativo} onCheckedChange={(v) => toggleAtivo.mutate({ id: m.id, ativo: v })} />
            </div>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              <Badge variant="outline" className="uppercase">{m.canal}</Badge>
              {(m.variaveis ?? []).length > 0 && (
                <span className="text-muted-foreground">Variáveis: {(m.variaveis ?? []).join(", ")}</span>
              )}
            </div>
            <div className="flex gap-1 pt-1 border-t border-border/60">
              <Button size="sm" variant="ghost" className="min-h-11 flex-1" onClick={() => openPreview(m)}><Eye className="h-4 w-4 mr-1" /> Preview</Button>
              <Button size="sm" variant="ghost" className="min-h-11 flex-1" onClick={() => openEdit(m)}><Pencil className="h-4 w-4 mr-1" /> Editar</Button>
              <Button size="icon" variant="ghost" className="min-h-11 min-w-11" onClick={() => setToDelete(m)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
          </div>
        ))}
      </div>


      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar modelo" : "Novo modelo"}</DialogTitle>
            <DialogDescription>Use chaves {"{nome}"}, {"{data}"} para variáveis dinâmicas.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Título</Label><Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} /></div>
            <div>
              <Label>Canal</Label>
              <Select value={form.canal} onValueChange={(v: any) => setForm({ ...form, canal: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="email">E-mail</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Corpo</Label>
              <Textarea rows={6} value={form.corpo} onChange={(e) => setForm({ ...form, corpo: e.target.value })}
                placeholder="Olá {nome}, você tem folga em {data}." />
            </div>
            <div>
              <Label>Variáveis (separadas por vírgula)</Label>
              <Input value={form.variaveis} onChange={(e) => setForm({ ...form, variaveis: e.target.value })} placeholder="nome, data, unidade" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} id="ativo" />
              <Label htmlFor="ativo">Ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !form.titulo.trim() || !form.corpo.trim()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Preview: {preview?.titulo}</DialogTitle>
            <DialogDescription>Informe valores das variáveis para visualizar a mensagem final.</DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="space-y-3">
              {(preview.variaveis ?? []).length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {(preview.variaveis ?? []).map((v) => (
                    <div key={v}>
                      <Label className="text-xs">{v}</Label>
                      <Input value={previewVars[v] ?? ""} onChange={(e) => setPreviewVars({ ...previewVars, [v]: e.target.value })} placeholder={`Ex.: valor de ${v}`} />
                    </div>
                  ))}
                </div>
              )}
              <div className="rounded-lg border bg-muted/40 p-3 text-sm whitespace-pre-wrap">
                {applyModeloVars(preview.corpo.replace(/\{(\w+)\}/g, "{{$1}}"), previewVars)}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir modelo "{toDelete?.titulo}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Mensagens já enviadas não são afetadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (toDelete) { del.mutate(toDelete.id); setToDelete(null); } }}
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
