import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Briefcase, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useDpCargos, useDeleteDpCargo, useDpCargoSalarios, type DpCargo, type DpCargoWithCount } from "@/hooks/useDpCadastros";
import { rotuloSalarioCargo, agruparPisosPorCargo } from "@/lib/dp/cargoSalarios";

import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { ColaboradorFormDialog } from "@/components/dp/ColaboradorFormDialog";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { moedaBR, selosRiscoCargo, textoPercentualRisco } from "@/lib/dp/cargos";
import { CargoSalariosUnidadePanel } from "@/components/dp/CargoSalariosUnidadePanel";
import { CargoFormDialog } from "@/components/dp/cargos/CargoFormDialog";

import { cn } from "@/lib/utils";

export default function DpCargos() {
  const list = useDpCargos();
  const del = useDeleteDpCargo();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DpCargo | null>(null);
  const [toDelete, setToDelete] = useState<DpCargoWithCount | null>(null);
  const [viewCargo, setViewCargo] = useState<DpCargoWithCount | null>(null);
  const [busca, setBusca] = useState("");
  /** Colaborador aberto para edição a partir da lista de vinculados. */
  const [editarColaborador, setEditarColaborador] = useState<any | null>(null);
  const colaboradores = useDpColaboradores();

  const openNew = () => {
    setEditing(null);
    setOpen(true);
  };

  const openEdit = (c: DpCargo) => {
    setEditing(c);
    setOpen(true);
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

  // Pisos por unidade da empresa (uma consulta só): usados para mostrar
  // "por unidade" na lista quando o cargo tem valores distintos.
  const todosPisos = useDpCargoSalarios();
  const hojeISO = new Date().toISOString().slice(0, 10);
  const pisosPorCargo = useMemo(
    () => agruparPisosPorCargo((todosPisos.data ?? []) as any[]),
    [todosPisos.data],
  );

  /** Célula de salário: valor único ou faixa por sindicato patronal / unidade. */
  const salarioResumo = (c: any) =>
    rotuloSalarioCargo((pisosPorCargo.get(c.id) ?? []) as any, { data: hojeISO });



  return (
    <DpPage narrow>
      <Helmet><title>Cargos — Pessoas 360°</title></Helmet>

      <DpPageHeader
        icon={Briefcase}
        title="Cargos"
        description="Gerencie os cargos disponíveis na empresa. Pisos diferentes por unidade (convenções patronais distintas) são cadastrados em “Salário por unidade”, dentro da ficha ou da edição do cargo."
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

      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm hidden md:block">
        <div>
          <table className="w-full table-fixed text-sm">
            <thead className="bg-muted/50 text-muted-foreground border-b border-border">
              <tr>
                <th className="text-left p-4 font-bold uppercase tracking-wider text-[10px] w-[30%]">Nome</th>
                <th className="text-left p-4 font-bold uppercase tracking-wider text-[10px] hidden md:table-cell w-[27%]">Descrição</th>
                <th className="text-right p-4 font-bold uppercase tracking-wider text-[10px] w-[17%]">Salário base</th>
                <th className="text-center p-4 font-bold uppercase tracking-wider text-[10px] w-[14%]">Colaboradores</th>
                <th className="text-right p-4 font-bold uppercase tracking-wider text-[10px] w-[12%]">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.isLoading && (
                <tr><td colSpan={5} className="p-12 text-center text-muted-foreground">Carregando...</td></tr>
              )}
              {!list.isLoading && rows.length === 0 && (
                <tr><td colSpan={5} className="p-12 text-center text-muted-foreground">
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
                    <td className="p-4 font-bold uppercase truncate" title={c.nome}>{c.nome}</td>
                    <td className="p-4 hidden md:table-cell text-muted-foreground truncate" title={descricao ?? ""}>{descricao || "—"}</td>
                    <td className="p-4 text-right tabular-nums whitespace-nowrap" title={salarioResumo(c).dica}>
                      {salarioResumo(c).texto}
                      {selosRiscoCargo(c as any).map((selo) => (
                        <span
                          key={selo.tipo}
                          className={cn(
                            "ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium",
                            selo.tipo === "insalubridade" && "bg-amber-500/10 text-amber-700 dark:text-amber-400",
                            selo.tipo === "periculosidade" && "bg-destructive/10 text-destructive",
                            selo.tipo === "indefinido" && "bg-muted text-muted-foreground",
                          )}
                        >
                          {selo.label}
                        </span>
                      ))}
                    </td>


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

      {/* Mobile: lista de cards */}
      <div className="md:hidden space-y-3">
        {list.isLoading && (
          <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">Carregando…</div>
        )}
        {!list.isLoading && rows.length === 0 && (
          <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            {(list.data ?? []).length === 0 ? "Nenhum cargo cadastrado." : "Nenhum cargo encontrado."}
          </div>
        )}
        {!list.isLoading && rows.map((c) => {
          const descricao = (c as DpCargo & { descricao?: string | null }).descricao ?? null;
          return (
            <div
              key={c.id}
              onClick={() => setViewCargo(c)}
              className="rounded-2xl border border-border bg-card p-4 space-y-2 active:scale-[0.98] transition-transform"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-bold uppercase truncate">{c.nome}</div>
                  {descricao && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{descricao}</div>}
                  <div className="mt-1 text-xs tabular-nums text-muted-foreground">
                    Piso: {salarioResumo(c).texto}
                    <span className="ml-1 normal-case">({salarioResumo(c).dica})</span>
                  </div>

                </div>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary shrink-0">
                  <Users className="size-3" /> {c.colaboradores_count}
                </span>
              </div>
              <div className="flex gap-1 pt-1 border-t border-border/60" onClick={(e) => e.stopPropagation()}>
                <Button size="sm" variant="ghost" className="min-h-11 flex-1" onClick={() => openEdit(c)}>
                  <Pencil className="size-4 mr-1" /> Editar
                </Button>
                <Button size="sm" variant="ghost" className="min-h-11 flex-1 text-destructive hover:bg-destructive/10" onClick={() => setToDelete(c)}>
                  <Trash2 className="size-4 mr-1" /> Excluir
                </Button>
              </div>
            </div>
          );
        })}
      </div>


      {/* Criar / Editar */}
      <CargoFormDialog
        open={open}
        onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}
        cargo={editing as any}
        colaboradoresCount={
          editing ? (list.data ?? []).find((c) => c.id === editing.id)?.colaboradores_count ?? 0 : 0
        }
      />


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
                  <Label className="text-xs text-muted-foreground">Piso salarial</Label>
                  <p className="mt-1 tabular-nums">{salarioResumo(viewCargo).texto}</p>
                  <p className="text-[11px] text-muted-foreground">{salarioResumo(viewCargo).dica}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Adicionais de risco</Label>
                  <p className="mt-1">
                    Insalubridade: {textoPercentualRisco((viewCargo as any).insalubridade_percentual)}
                  </p>
                  <p>
                    Periculosidade: {textoPercentualRisco((viewCargo as any).periculosidade_percentual)}
                  </p>
                </div>

              </div>

              <div className="pt-2 border-t border-border">
                <CargoSalariosUnidadePanel cargoId={viewCargo.id} />
              </div>

              <div className="pt-2 border-t border-border">

                <Label className="text-xs text-muted-foreground">Colaboradores neste cargo</Label>
                {(() => {
                  const vinculados = (colaboradores.data ?? []).filter((x: any) => x.cargo_id === viewCargo.id);
                  if (vinculados.length === 0) {
                    return <p className="mt-1 text-muted-foreground">Nenhum colaborador vinculado.</p>;
                  }
                  return (
                    <ul className="mt-2 divide-y rounded-lg border">
                      {vinculados.map((x: any) => (
                        <li key={x.id} className="flex items-center gap-2 p-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{x.nome}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {x.unidade_nome ?? "Sem unidade"}
                              {x.salario_base != null ? ` · ${moedaBR(Number(x.salario_base))}` : ""}
                              {x.ativo === false ? " · desligado" : ""}
                            </p>
                          </div>
                          <Button
                            size="sm" variant="outline" className="shrink-0"
                            onClick={() => { setViewCargo(null); setEditarColaborador(x); }}
                          >
                            <Pencil className="size-4 mr-1" /> Editar
                          </Button>
                        </li>
                      ))}
                    </ul>
                  );
                })()}
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

      {/* Edição do colaborador a partir da lista de vinculados */}
      <ColaboradorFormDialog
        open={!!editarColaborador}
        onOpenChange={(o) => { if (!o) setEditarColaborador(null); }}
        colaborador={editarColaborador}
      />

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
