import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useDpCargos, useUpsertDpCargo, useDeleteDpCargo, type DpCargo } from "@/hooks/useDpCadastros";
import { TableSkeleton } from "@/components/dp/DpSkeletons";
import { DpContentCard, DpPage, DpPageHeader } from "@/components/dp/DpPage";

export default function DpCargos() {
  const list = useDpCargos();
  const upsert = useUpsertDpCargo();
  const del = useDeleteDpCargo();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DpCargo | null>(null);
  const [toDelete, setToDelete] = useState<DpCargo | null>(null);
  const [form, setForm] = useState({ nome: "", cbo: "", salario_base: "", ativo: true });

  const openNew = () => {
    setEditing(null);
    setForm({ nome: "", cbo: "", salario_base: "", ativo: true });
    setOpen(true);
  };

  const openEdit = (c: DpCargo) => {
    setEditing(c);
    setForm({
      nome: c.nome,
      cbo: c.cbo ?? "",
      salario_base: c.salario_base != null ? String(c.salario_base) : "",
      ativo: c.ativo,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.nome.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    try {
      await upsert.mutateAsync({
        id: editing?.id,
        nome: form.nome.trim(),
        cbo: form.cbo.trim() || null,
        salario_base: form.salario_base ? Number(form.salario_base.replace(",", ".")) : null,
        ativo: form.ativo,
      });
      toast.success(editing ? "Cargo atualizado" : "Cargo criado");
      setOpen(false);
    } catch (e) {
      toast.error("Erro ao salvar", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await del.mutateAsync(toDelete.id);
      toast.success("Cargo removido");
    } catch (e) {
      toast.error("Erro ao remover", { description: e instanceof Error ? e.message : String(e) });
    }
    setToDelete(null);
  };

  const fmtBRL = (v: number | null) => v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  return (
    <DpPage>
      <Helmet><title>Cargos — DP 360°</title></Helmet>
      <DpPageHeader
        icon={Briefcase}
        title="Cargos"
        description={`${list.data?.length ?? 0} cadastrados`}
        actions={<Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Novo cargo</Button>}
      />

      <DpContentCard contentClassName="overflow-x-auto">
          {list.isLoading ? (
            <TableSkeleton columns={5} headers={["Nome", "CBO", "Salário base", "Status", ""]} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>CBO</TableHead>
                  <TableHead>Salário base</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(list.data ?? []).map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.nome}</TableCell>
                    <TableCell>{c.cbo ?? "—"}</TableCell>
                    <TableCell>{fmtBRL(c.salario_base)}</TableCell>
                    <TableCell>{c.ativo ? <Badge className="bg-primary">Ativo</Badge> : <Badge variant="outline">Inativo</Badge>}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => setToDelete(c)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {(list.data ?? []).length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum cargo cadastrado.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
      </DpContentCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar cargo" : "Novo cargo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome *</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} maxLength={120} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>CBO</Label>
                <Input value={form.cbo} onChange={(e) => setForm({ ...form, cbo: e.target.value })} maxLength={10} />
              </div>
              <div>
                <Label>Salário base (R$)</Label>
                <Input value={form.salario_base} onChange={(e) => setForm({ ...form, salario_base: e.target.value })} inputMode="decimal" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
              <Label>Ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={upsert.isPending}>{upsert.isPending ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover cargo "{toDelete?.nome}"?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DpPage>
  );
}
