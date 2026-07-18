import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Briefcase, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useDpCargos, useUpsertDpCargo, useDeleteDpCargo, type DpCargo, type DpCargoWithCount } from "@/hooks/useDpCadastros";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { cn } from "@/lib/utils";

type FormState = { nome: string; descricao: string };
const blankForm: FormState = { nome: "", descricao: "" };

export default function DpCargos() {
  const list = useDpCargos();
  const upsert = useUpsertDpCargo();
  const del = useDeleteDpCargo();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DpCargo | null>(null);
  const [form, setForm] = useState<FormState>(blankForm);
  const [toDelete, setToDelete] = useState<DpCargoWithCount | null>(null);
  const [viewCargo, setViewCargo] = useState<DpCargoWithCount | null>(null);
  const [busca, setBusca] = useState("");

  const openNew = () => {
    setEditing(null);
    setForm(blankForm);
    setOpen(true);
  };

  const openEdit = (c: DpCargo) => {
    setEditing(c);
    setForm({ nome: c.nome, descricao: (c as DpCargo & { descricao?: string | null }).descricao ?? "" });
    setOpen(true);
  };

  const save = async () => {
    if (!form.nome.trim()) {
      toast.error("O nome do cargo é obrigatório.");
      return;
    }
    try {
      await upsert.mutateAsync({
        id: editing?.id,
        nome: form.nome.trim(),
        descricao: form.descricao.trim() || null,
      } as Parameters<typeof upsert.mutateAsync>[0]);
      toast.success(editing ? "Cargo atualizado com sucesso." : "Cargo cadastrado com sucesso.");
      setOpen(false);
      setForm(blankForm);
      setEditing(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("23505")) {
        toast.error("Erro", { description: "Já existe um cargo com este nome." });
      } else {
        toast.error("Erro ao salvar", { description: msg });
      }
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await del.mutateAsync(toDelete.id);
      toast.success("Cargo excluído.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("23503")) {
        toast.error("Erro de exclusão", { description: "Este cargo está sendo usado por colaboradores e não pode ser excluído." });
      } else {
        toast.error("Erro ao excluir", { description: msg });
      }
    }
    setToDelete(null);
  };

  const formatDate = (v: string | null | undefined) => {
    if (!v) return "—";
    try {
      return new Date(v).toLocaleDateString("pt-BR", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
      });
    } catch { return v; }
  };

  const rows = useMemo(() => {
    const all = list.data ?? [];
    const q = busca.trim().toLowerCase();
    if (!q) return all;
    return all.filter((c) => c.nome.toLowerCase().includes(q));
  }, [list.data, busca]);

  return (
    <DpPage narrow>
      <Helmet><title>Cargos — DP 360°</title></Helmet>

      <DpPageHeader
        icon={Briefcase}
        title="Cargos"
        description="Gerencie os cargos disponíveis na empresa."
        actions={
          <>
            <Button onClick={openNew} className="rounded-full px-6">
              <Plus className="size-4 mr-2" /> Novo Cargo
            </Button>
          </>
        }
      />

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar cargo por nome..." value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground border-b border-border">
              <tr>
                <th className="text-left p-4 font-bold uppercase tracking-wider text-[10px]">Nome</th>
                <th className="text-left p-4 font-bold uppercase tracking-wider text-[10px] hidden md:table-cell">Descrição</th>
                <th className="text-center p-4 font-bold uppercase tracking-wider text-[10px]">Colaboradores</th>
                <th className="text-right p-4 font-bold uppercase tracking-wider text-[10px]">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.isLoading && (
                <tr><td colSpan={4} className="p-12 text-center text-muted-foreground">Carregando...</td></tr>
              )}
              {!list.isLoading && rows.length === 0 && (
                <tr><td colSpan={4} className="p-12 text-center text-muted-foreground">
                  {(list.data ?? []).length === 0 ? "Nenhum cargo cadastrado." : "Nenhum cargo encontrado."}
                </td></tr>
              )}
              {rows.map((c) => {
                const descricao = (c as DpCargo & { descricao?: string | null }).descricao ?? null;
                return (
                  <tr
                    key={c.id}
                    onClick={() => setViewCargo(c)}
                    className={cn("hover:bg-muted/20 transition-colors cursor-pointer")}
                  >
                    <td className="p-4 font-bold uppercase">{c.nome}</td>
                    <td className="p-4 hidden md:table-cell text-muted-foreground">{descricao || "—"}</td>
                    <td className="p-4 text-center">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                        <Users className="size-3" /> {c.colaboradores_count}
                      </span>
                    </td>
                    <td className="p-4 text-right whitespace-nowrap">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          title="Editar"
                          onClick={(e) => { e.stopPropagation(); openEdit(c); }}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:bg-destructive/10"
                          title="Excluir"
                          onClick={(e) => { e.stopPropagation(); setToDelete(c); }}
                        >
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
      </div>

      {/* Criar / Editar */}
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditing(null); setForm(blankForm); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Cargo" : "Novo Cargo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="cargo-nome">Nome do Cargo *</Label>
              <Input
                id="cargo-nome"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex: Pizzaiolo Sênior"
                maxLength={120}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cargo-descricao">Descrição (Opcional)</Label>
              <Textarea
                id="cargo-descricao"
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                rows={3}
                placeholder="Breve descrição das responsabilidades."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setOpen(false); setEditing(null); setForm(blankForm); }}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={upsert.isPending}>
              {upsert.isPending ? "Salvando..." : editing ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Visualização */}
      <Dialog open={!!viewCargo} onOpenChange={(o) => !o && setViewCargo(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Briefcase className="size-5 text-primary" />
              {viewCargo?.nome}
            </DialogTitle>
          </DialogHeader>
          {viewCargo && (
            <div className="space-y-4 py-2 text-sm">
              <div>
                <Label className="text-xs text-muted-foreground">Descrição</Label>
                <p className="mt-1 whitespace-pre-wrap">
                  {(viewCargo as DpCargo & { descricao?: string | null }).descricao || "—"}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
                <div>
                  <Label className="text-xs text-muted-foreground">Criado em</Label>
                  <p className="mt-1">{formatDate(viewCargo.created_at)}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Atualizado em</Label>
                  <p className="mt-1">{formatDate(viewCargo.updated_at)}</p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setViewCargo(null)}>Fechar</Button>
            {viewCargo && (
              <Button onClick={() => { const c = viewCargo; setViewCargo(null); openEdit(c); }}>
                <Pencil className="size-4 mr-2" /> Editar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Excluir */}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cargo "{toDelete?.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete && toDelete.colaboradores_count > 0
                ? `Este cargo está sendo usado por ${toDelete.colaboradores_count} colaborador(es). A exclusão será bloqueada.`
                : "Vínculos com sindicatos laborais também serão removidos. Esta ação não pode ser desfeita."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DpPage>
  );
}
