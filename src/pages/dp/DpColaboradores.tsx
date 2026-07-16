import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useDpColaboradores, useDeleteDpColaborador, type DpColaborador } from "@/hooks/useDpColaboradores";
import { ColaboradorFormDialog } from "@/components/dp/ColaboradorFormDialog";
import { TableSkeleton } from "@/components/dp/DpSkeletons";

export default function DpColaboradores() {
  const list = useDpColaboradores();
  const del = useDeleteDpColaborador();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DpColaborador | null>(null);
  const [toDelete, setToDelete] = useState<DpColaborador | null>(null);

  const filtered = (list.data ?? []).filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return c.nome.toLowerCase().includes(q) || (c.cpf ?? "").includes(q) || (c.matricula ?? "").toLowerCase().includes(q);
  });

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await del.mutateAsync(toDelete.id);
      toast.success("Colaborador removido");
    } catch (e) {
      toast.error("Erro ao remover", { description: e instanceof Error ? e.message : String(e) });
    }
    setToDelete(null);
  };

  return (
    <div className="space-y-4">
      <Helmet><title>Colaboradores — DP 360°</title></Helmet>
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Colaboradores</h2>
          <p className="text-sm text-muted-foreground">{list.data?.length ?? 0} cadastrados</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Input placeholder="Buscar por nome, CPF ou matrícula" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full sm:w-72" />
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Novo
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {list.isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Matrícula</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Regime</TableHead>
                  <TableHead>Admissão</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="font-medium">{c.nome}</div>
                      {c.cpf && <div className="text-xs text-muted-foreground">{c.cpf}</div>}
                    </TableCell>
                    <TableCell>{c.matricula ?? "—"}</TableCell>
                    <TableCell>{c.cargo_nome ?? c.cargo ?? "—"}</TableCell>
                    <TableCell className="uppercase text-xs">{c.regime}</TableCell>
                    <TableCell>{c.data_admissao ?? "—"}</TableCell>
                    <TableCell>
                      {c.ativo ? <Badge className="bg-primary">Ativo</Badge> : <Badge variant="outline">Inativo</Badge>}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" onClick={() => { setEditing(c); setDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => setToDelete(c)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum colaborador cadastrado.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ColaboradorFormDialog open={dialogOpen} onOpenChange={setDialogOpen} colaborador={editing} />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover colaborador?</AlertDialogTitle>
            <AlertDialogDescription>
              Isto também remove todas as solicitações e documentos vinculados a <strong>{toDelete?.nome}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
