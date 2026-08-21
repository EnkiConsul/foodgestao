import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Building2, ListChecks, Users, Search, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  useDpUnidades,
  useDeleteDpUnidade,
  useToggleDpUnidadeAtivo,
  type DpUnidadeWithCounts,
} from "@/hooks/useDpCadastros";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { UnidadeFormDialog, formatCNPJ, onlyNumbers } from "@/components/dp/UnidadeFormDialog";
import { useDpFuncionamentoResumo } from "@/hooks/useDpFuncionamentoResumo";

export default function DpUnidades() {
  const list = useDpUnidades();
  const del = useDeleteDpUnidade();
  const toggle = useToggleDpUnidadeAtivo();

  const { resumos } = useDpFuncionamentoResumo();
  const [open, setOpen] = useState(false);
  const [abaForm, setAbaForm] = useState<"dados" | "funcionamento">("dados");
  const [editing, setEditing] = useState<DpUnidadeWithCounts | null>(null);
  const [toDelete, setToDelete] = useState<DpUnidadeWithCounts | null>(null);
  const [busca, setBusca] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "ativa" | "inativa">("all");

  const [viewOpen, setViewOpen] = useState(false);
  const [viewing, setViewing] = useState<DpUnidadeWithCounts | null>(null);

  const openNew = () => {
    setEditing(null);
    setAbaForm("dados");
    setOpen(true);
  };

  const openEdit = (u: DpUnidadeWithCounts, aba: "dados" | "funcionamento" = "dados") => {
    setEditing(u);
    setAbaForm(aba);
    setOpen(true);
  };

  const openView = (u: DpUnidadeWithCounts) => {
    setViewing(u);
    setViewOpen(true);
  };



  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      await del.mutateAsync(toDelete.id);
      toast.success("Unidade removida");
    } catch (e: any) {
      const msg = e?.code === "23503"
        ? "Existem registros vinculados a esta unidade."
        : (e instanceof Error ? e.message : String(e));
      toast.error("Erro ao remover", { description: msg });
    }
    setToDelete(null);
  };

  const handleToggle = async (u: DpUnidadeWithCounts) => {
    try {
      await toggle.mutateAsync({ id: u.id, ativo: !u.ativo });
    } catch (e) {
      toast.error("Erro ao atualizar status", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const rows = useMemo(() => {
    const all = list.data ?? [];
    const q = busca.trim().toLowerCase();
    return all.filter((u) => {
      if (statusFilter === "ativa" && !u.ativo) return false;
      if (statusFilter === "inativa" && u.ativo) return false;
      if (!q) return true;
      return u.nome.toLowerCase().includes(q) || (u.cnpj ?? "").includes(onlyNumbers(q));
    });
  }, [list.data, busca, statusFilter]);

  return (
    <DpPage narrow>
      <Helmet><title>Unidades — Pessoas 360°</title></Helmet>

      <DpPageHeader
        icon={Building2}
        title="Unidades"
        description="Cadastre e gerencie as unidades, seus cargos e sindicatos patronais."
        actions={
          aba === "unidades" ? (
            <>
              <Button onClick={openNew} className="rounded-full px-6">
                <Plus className="size-4 mr-2" /> Nova Unidade
              </Button>
            </>
          ) : undefined
        }
      />

      <Tabs value={aba} onValueChange={setAba} className="space-y-4">
        <DpTabsBar>
          <TabsTrigger value="unidades">Unidades</TabsTrigger>
          <TabsTrigger value="sindicatos">Sindicatos Patronais</TabsTrigger>
        </DpTabsBar>

        <TabsContent value="sindicatos" className="m-0">
          <SindicatosPanel tipo="patronal" />
        </TabsContent>

        <TabsContent value="unidades" className="m-0">
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por nome ou CNPJ..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="ativa">Ativas</SelectItem>
            <SelectItem value="inativa">Inativas</SelectItem>
          </SelectContent>
        </Select>
      </div>


      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm hidden md:block">
        <div>
          <table className="w-full table-fixed text-sm">
            <thead className="bg-muted/50 text-muted-foreground border-b border-border">
              <tr>
                <th className="text-left p-4 font-bold uppercase tracking-wider text-[10px] w-[24%]">Unidade</th>
                <th className="text-left p-4 font-bold uppercase tracking-wider text-[10px] hidden lg:table-cell w-[14%]">Empresa</th>
                <th className="text-left p-4 font-bold uppercase tracking-wider text-[10px] hidden md:table-cell w-[12%]">CNPJ</th>
                <th className="text-center p-4 font-bold uppercase tracking-wider text-[10px] w-[10%]">Colab.</th>
                <th className="text-center p-4 font-bold uppercase tracking-wider text-[10px] w-[10%]">Cargos</th>
                <th className="text-center p-4 font-bold uppercase tracking-wider text-[10px] w-[14%]">Sind. Patronais</th>
                <th className="text-center p-4 font-bold uppercase tracking-wider text-[10px] w-[10%]">Status</th>
                <th className="text-right p-4 font-bold uppercase tracking-wider text-[10px] w-[10%]">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.isLoading && (
                <tr><td colSpan={8} className="p-12 text-center text-muted-foreground">Carregando...</td></tr>
              )}
              {!list.isLoading && rows.length === 0 && (
                <tr><td colSpan={8} className="p-12 text-center text-muted-foreground">
                  {(list.data ?? []).length === 0 ? "Nenhuma unidade cadastrada." : "Nenhuma unidade encontrada com os filtros atuais."}
                </td></tr>
              )}
              {rows.map((u) => (
                <tr
                  key={u.id}
                  className="hover:bg-muted/20 transition-colors cursor-pointer"
                  onClick={() => openView(u)}
                >
                  <td className="p-4">
                    <div className="font-bold truncate" title={u.nome}>{u.nome}</div>
                    {u.endereco && <div className="text-xs text-muted-foreground truncate" title={u.endereco}>{u.endereco}</div>}
                    <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground truncate" title={resumos[u.id] ?? "Funcionamento não configurado"}>
                      <Store className="size-3 shrink-0" aria-hidden="true" />
                      {resumos[u.id] ?? "Funcionamento não configurado"}
                    </div>
                  </td>
                  <td className="p-4 hidden lg:table-cell text-xs truncate">
                    {u.company_name ?? "—"}
                  </td>
                  <td className="p-4 hidden md:table-cell font-mono text-xs">
                    {u.cnpj ? formatCNPJ(u.cnpj) : "—"}
                  </td>
                  <td className="p-4 text-center">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
                      <Users className="size-3" /> {u.colaboradores_count}
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                      <ListChecks className="size-3" /> {u.cargos_count}
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-accent text-accent-foreground">
                      <Users className="size-3" /> {u.sindicatos_patronais_count}
                    </span>
                  </td>
                  <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                    <Switch checked={u.ativo} onCheckedChange={() => handleToggle(u)} />
                  </td>
                  <td className="p-4 text-right whitespace-nowrap">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        title="Horário de funcionamento"
                        aria-label={`Horário de funcionamento de ${u.nome}`}
                        onClick={(e) => { e.stopPropagation(); openEdit(u, "funcionamento"); }}
                      >
                        <Store className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={(e) => { e.stopPropagation(); openEdit(u); }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={(e) => { e.stopPropagation(); setToDelete(u); }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile: lista de cards */}
      <div className="md:hidden space-y-3">
        {list.isLoading && (
          <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">Carregando…</div>
        )}
        {!list.isLoading && rows.length === 0 && (
          <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            {(list.data ?? []).length === 0 ? "Nenhuma unidade cadastrada." : "Nenhuma unidade encontrada com os filtros atuais."}
          </div>
        )}
        {!list.isLoading && rows.map((u) => (
          <div
            key={u.id}
            onClick={() => openView(u)}
            className="rounded-2xl border border-border bg-card p-4 space-y-3 active:scale-[0.98] transition-transform"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-bold truncate">{u.nome}</div>
                {u.company_name && <div className="text-[11px] text-muted-foreground truncate">{u.company_name}</div>}
                {u.cnpj && <div className="font-mono text-[11px] text-muted-foreground">{formatCNPJ(u.cnpj)}</div>}
                {u.endereco && <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{u.endereco}</div>}
                <div className="mt-1 flex items-start gap-1 text-[11px] text-muted-foreground">
                  <Store className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                  <span className="line-clamp-2">{resumos[u.id] ?? "Funcionamento não configurado"}</span>
                </div>
              </div>
              <div onClick={(e) => e.stopPropagation()}>
                <Switch checked={u.ativo} onCheckedChange={() => handleToggle(u)} />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium bg-secondary text-secondary-foreground">
                <Users className="size-3" /> {u.colaboradores_count} colab.
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium bg-primary/10 text-primary">
                <ListChecks className="size-3" /> {u.cargos_count} cargos
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium bg-accent text-accent-foreground">
                <Users className="size-3" /> {u.sindicatos_patronais_count} sind.
              </span>
            </div>
            <div className="flex flex-wrap gap-1 pt-1 border-t border-border/60" onClick={(e) => e.stopPropagation()}>
              <Button size="sm" variant="ghost" className="min-h-11 flex-1" onClick={() => openEdit(u, "funcionamento")}>
                <Store className="size-4 mr-1" /> Funcionamento
              </Button>
              <Button size="sm" variant="ghost" className="min-h-11 flex-1" onClick={() => openEdit(u)}>
                <Pencil className="size-4 mr-1" /> Editar
              </Button>
              <Button size="sm" variant="ghost" className="min-h-11 flex-1 text-destructive hover:bg-destructive/10" onClick={() => setToDelete(u)}>
                <Trash2 className="size-4 mr-1" /> Excluir
              </Button>
            </div>
          </div>
        ))}
      </div>
        </TabsContent>
      </Tabs>




      {/* View dialog */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="size-5 text-primary" />
              {viewing?.nome || "Unidade"}
            </DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
              <div className="md:col-span-2">
                <Label className="text-xs text-muted-foreground uppercase">Empresa vinculada</Label>
                <p className="font-semibold">{viewing.company_name ?? "—"}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground uppercase">Nome</Label>
                <p className="font-semibold">{viewing.nome}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground uppercase">CNPJ</Label>
                <p className="font-mono">{viewing.cnpj ? formatCNPJ(viewing.cnpj) : "—"}</p>
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs text-muted-foreground uppercase">Endereço</Label>
                <p>{viewing.endereco || "—"}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground uppercase">Cidade / UF</Label>
                <p>{[viewing.cidade, viewing.uf].filter(Boolean).join(" / ") || "—"}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground uppercase">Telefone</Label>
                <p>{(viewing as any).telefone || "—"}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground uppercase">Status</Label>
                <p>{viewing.ativo ? "Ativa" : "Inativa"}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground uppercase">Colaboradores vinculados</Label>
                <p>{viewing.colaboradores_count}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground uppercase">Relógio de Ponto</Label>
                <p>{(viewing as any).possui_relogio_ponto ? "Sim" : "Não"}</p>
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs text-muted-foreground uppercase">Funcionamento da loja</Label>
                <p>{resumos[viewing.id] ?? "Não configurado"}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground uppercase">Adiantamento</Label>
                <p>
                  {(viewing as any).tem_adiantamento
                    ? `Sim (Dia ${(viewing as any).dia_adiantamento || "—"})`
                    : "Não"}
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setViewOpen(false)}>Fechar</Button>
            {viewing && (
              <Button variant="outline" onClick={() => { const u = viewing; setViewOpen(false); openEdit(u, "funcionamento"); }}>
                <Store className="size-4 mr-2" /> Funcionamento
              </Button>
            )}
            {viewing && (
              <Button onClick={() => { const u = viewing; setViewOpen(false); openEdit(u); }}>
                <Pencil className="size-4 mr-2" /> Editar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create/Edit dialog — mesmo formulário usado no cadastro do colaborador */}
      <UnidadeFormDialog open={open} onOpenChange={setOpen} unidade={editing} abaInicial={abaForm} />


      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover unidade "{toDelete?.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Colaboradores, folgas, escalas e vínculos sindicais associados a esta unidade ficarão sem referência.
              Se houver registros vinculados, a exclusão será bloqueada pelo banco de dados.
            </AlertDialogDescription>
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
