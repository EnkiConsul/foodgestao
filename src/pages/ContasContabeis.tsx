import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, ChevronRight, ChevronDown, PlusCircle, Sparkles, X, CheckCircle2 } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChartAccountFormDialog, type ChartAccount } from "@/components/chart-accounts/ChartAccountFormDialog";

function compareCodes(a: string, b: string) {
  const pa = a.split(".").map((s) => parseInt(s, 10));
  const pb = b.split(".").map((s) => parseInt(s, 10));
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (va !== vb) return va - vb;
  }
  return a.localeCompare(b);
}

type Node = ChartAccount & { children: Node[] };

function buildTree(rows: ChartAccount[]): Node[] {
  const map = new Map<string, Node>();
  rows.forEach((r) => map.set(r.id, { ...r, children: [] }));
  const roots: Node[] = [];
  map.forEach((n) => {
    if (n.parent_id && map.has(n.parent_id)) map.get(n.parent_id)!.children.push(n);
    else roots.push(n);
  });
  const sortRec = (arr: Node[]) => {
    arr.sort((a, b) => compareCodes(a.code, b.code));
    arr.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

export default function ContasContabeis() {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();
  const [restoring, setRestoring] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ChartAccount | null>(null);
  const [defaultParent, setDefaultParent] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<ChartAccount | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["chart-accounts", user?.id, contextType],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("chart_accounts")
        .select("*")
        .eq("user_id", user!.id)
        .eq("context", contextType);
      if (error) throw error;
      return (data ?? []) as ChartAccount[];
    },
  });

  const tree = useMemo(() => buildTree(rows), [rows]);

  // id -> depth (profundidade na árvore) e mapa de filhos
  const { depthById, childrenById } = useMemo(() => {
    const depthById = new Map<string, number>();
    const childrenById = new Map<string, string[]>();
    const walk = (nodes: Node[], depth: number) => {
      nodes.forEach((n) => {
        depthById.set(n.id, depth);
        childrenById.set(n.id, n.children.map((c) => c.id));
        walk(n.children, depth + 1);
      });
    };
    walk(tree, 0);
    return { depthById, childrenById };
  }, [tree]);

  const collectSubtree = (id: string, acc: string[] = []): string[] => {
    acc.push(id);
    (childrenById.get(id) ?? []).forEach((c) => collectSubtree(c, acc));
    return acc;
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelect = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      collectSubtree(id).forEach((sid) => {
        if (checked) next.add(sid);
        else next.delete(sid);
      });
      return next;
    });
  };

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const someSelected = selected.size > 0 && !allSelected;

  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  };

  const openNew = (parentId: string | null = null) => {
    setEditing(null);
    setDefaultParent(parentId);
    setDialogOpen(true);
  };
  const openEdit = (acc: ChartAccount) => {
    setEditing(acc);
    setDefaultParent(null);
    setDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const hasChildren = rows.some((r) => r.parent_id === deleteTarget.id);
    if (hasChildren) {
      toast.error("Não é possível excluir", { description: "Esta conta possui filhas. Inative-a ou remova as filhas primeiro." });
      setDeleteTarget(null);
      return;
    }
    const { error } = await (supabase as any).from("chart_accounts").delete().eq("id", deleteTarget.id);
    if (error) toast.error("Erro ao excluir", { description: error.message });
    else {
      toast.success("Conta excluída");
      queryClient.invalidateQueries({ queryKey: ["chart-accounts"] });
    }
    setDeleteTarget(null);
  };

  const confirmBulkDelete = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBulkDeleting(true);

    const byId = new Map(rows.map((r) => [r.id, r] as const));
    const blocked: { name: string; reason: string }[] = [];

    // Contas com filhas fora da seleção não podem ser excluídas
    const deletable = ids.filter((id) => {
      const children = childrenById.get(id) ?? [];
      const outside = children.filter((c) => !selected.has(c));
      if (outside.length > 0) {
        blocked.push({ name: byId.get(id)?.name ?? id, reason: "possui contas filhas fora da seleção" });
        return false;
      }
      return true;
    });

    // Exclui das folhas para as raízes
    const levels = new Map<number, string[]>();
    deletable.forEach((id) => {
      const d = depthById.get(id) ?? 0;
      levels.set(d, [...(levels.get(d) ?? []), id]);
    });
    const orderedDepths = Array.from(levels.keys()).sort((a, b) => b - a);

    let deletedCount = 0;
    for (const depth of orderedDepths) {
      const batch = levels.get(depth)!;
      const { error } = await (supabase as any).from("chart_accounts").delete().in("id", batch);
      if (!error) {
        deletedCount += batch.length;
        continue;
      }
      // Se o lote falhar, tenta item a item para identificar as contas bloqueadas
      for (const id of batch) {
        const { error: single } = await (supabase as any).from("chart_accounts").delete().eq("id", id);
        if (single) blocked.push({ name: byId.get(id)?.name ?? id, reason: single.message });
        else deletedCount += 1;
      }
    }

    setBulkDeleting(false);
    setBulkOpen(false);
    setSelected(new Set());
    queryClient.invalidateQueries({ queryKey: ["chart-accounts"] });

    if (blocked.length === 0) {
      toast.success(`${deletedCount} conta(s) excluída(s)`);
    } else {
      const detalhes = blocked.slice(0, 5).map((b) => `${b.name}: ${b.reason}`).join(" · ");
      toast.warning(`${deletedCount} excluída(s), ${blocked.length} não excluída(s)`, {
        description: blocked.length > 5 ? `${detalhes} …` : detalhes,
      });
    }
  };

  const renderNode = (node: Node, depth = 0) => {
    const hasChildren = node.children.length > 0;
    const isOpen = expanded.has(node.id);
    const isSelected = selected.has(node.id);
    return (
      <div key={node.id}>
        <div
          className="flex items-center gap-2 py-2 px-2 rounded hover:bg-muted/50 group border-b"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          <label className="flex items-center justify-center h-8 w-8 md:h-6 md:w-6 shrink-0 cursor-pointer">
            <Checkbox
              checked={isSelected}
              onCheckedChange={(c) => toggleSelect(node.id, c === true)}
              aria-label={`Selecionar ${node.name}`}
            />
          </label>
          <button
            type="button"
            onClick={() => hasChildren && toggleExpand(node.id)}
            className={`h-5 w-5 flex items-center justify-center shrink-0 ${hasChildren ? "" : "invisible"}`}
          >
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          <span className="font-mono text-[10px] md:text-xs text-muted-foreground w-14 md:w-24 shrink-0 truncate">{node.code}</span>
          <span className="flex-1 text-xs md:text-sm truncate">{node.name}</span>
          <div className="hidden md:flex items-center gap-1">
            {node.short_code && <Badge variant="outline" className="text-[10px] font-mono">{node.short_code}</Badge>}
            {node.is_tax && <Badge variant="secondary" className="text-[10px]">Imposto</Badge>}
            <Badge variant={node.allow_transactions ? "default" : "outline"} className="text-[10px]">
              {node.allow_transactions ? "Analítica" : "Sintética"}
            </Badge>
            <Badge variant={node.is_active ? "default" : "destructive"} className="text-[10px]">
              {node.is_active ? "Ativa" : "Inativa"}
            </Badge>
          </div>
          {!node.is_active && (
            <Badge variant="destructive" className="md:hidden text-[9px] px-1 h-4">Inativa</Badge>
          )}
          <div className="flex items-center gap-0.5 md:gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0">
            {!node.allow_transactions && (
              <Button variant="ghost" size="icon" className="h-8 w-8 md:h-7 md:w-7" onClick={() => openNew(node.id)} title="Adicionar filha">
                <PlusCircle className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8 md:h-7 md:w-7" onClick={() => openEdit(node)} title="Editar">
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 md:h-7 md:w-7 text-destructive" onClick={() => setDeleteTarget(node)} title="Excluir">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {isOpen && hasChildren && node.children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  const handleRestoreDefault = () => {
    if (!selectedCompanyId) return;
    setRestoreOpen(true);
  };

  const executeRestore = async () => {
    if (!selectedCompanyId) return;
    setRestoreOpen(false);
    setRestoring(true);
    const { data, error } = await (supabase as any).rpc("chart_accounts_restore_default", { _company_id: selectedCompanyId });
    setRestoring(false);
    if (error) toast.error("Erro ao restaurar modelo", { description: error.message });
    else {
      toast.success(`${data ?? 0} conta(s) do modelo adicionada(s)`);
      queryClient.invalidateQueries({ queryKey: ["chart-accounts"] });
    }
  };

  const canRestore = contextType === "pj" && !!selectedCompanyId;

  return (
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-0">
      <Helmet><title>Contas Contábeis | 360°FOOD</title></Helmet>
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 md:gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Contas Contábeis</h1>
          <p className="text-xs md:text-sm text-muted-foreground">Plano de contas hierárquico. Sintéticas agrupam; Analíticas recebem lançamentos.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canRestore && (
            <Button variant="outline" size="sm" onClick={handleRestoreDefault} disabled={restoring} className="flex-1 md:flex-none min-h-9" title="Adiciona contas do modelo padrão que ainda não existem">
              <Sparkles className="h-4 w-4 mr-2" /> {restoring ? "Restaurando..." : "Restaurar Modelo"}
            </Button>
          )}
          <Button size="sm" onClick={() => openNew(null)} className="flex-1 md:flex-none min-h-9">
            <Plus className="h-4 w-4 mr-2" /> Nova Conta
          </Button>
        </div>
      </div>

      {selected.size > 0 && (
        <Card className="hidden md:flex items-center justify-between gap-3 p-3">
          <span className="text-sm font-medium">{selected.size} conta(s) selecionada(s)</span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              <X className="h-4 w-4 mr-2" /> Limpar seleção
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setBulkOpen(true)}>
              <Trash2 className="h-4 w-4 mr-2" /> Excluir selecionadas
            </Button>
          </div>
        </Card>
      )}

      <Card className="p-2">
        {isLoading ? (
          <p className="text-sm text-muted-foreground p-6 text-center">Carregando...</p>
        ) : tree.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm text-muted-foreground">Nenhuma conta contábil cadastrada.</p>
            <Button onClick={() => openNew(null)} variant="outline">
              <Plus className="h-4 w-4 mr-2" /> Criar primeira conta
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 px-2 py-2 border-b">
              <label className="flex items-center justify-center h-8 w-8 md:h-6 md:w-6 shrink-0 cursor-pointer">
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Selecionar todas as contas"
                />
              </label>
              <span className="text-xs text-muted-foreground">
                {selected.size > 0 ? `${selected.size} selecionada(s)` : "Selecionar todas"}
              </span>
            </div>
            <div className="divide-y">{tree.map((n) => renderNode(n))}</div>
          </>
        )}
      </Card>

      {selected.size > 0 && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t bg-background p-3 flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{selected.size} selecionada(s)</span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Limpar</Button>
            <Button variant="destructive" size="sm" onClick={() => setBulkOpen(true)}>
              <Trash2 className="h-4 w-4 mr-2" /> Excluir
            </Button>
          </div>
        </div>
      )}

      <ChartAccountFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["chart-accounts"] })}
        editAccount={editing}
        defaultParentId={defaultParent}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conta contábil?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Contas com filhas não podem ser excluídas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkOpen} onOpenChange={(o) => !bulkDeleting && setBulkOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {selected.size} conta(s) contábil(is)?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A exclusão começa pelas contas mais profundas.
              Contas com filhas fora da seleção ou em uso em lançamentos não serão excluídas e serão informadas ao final.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); confirmBulkDelete(); }} disabled={bulkDeleting}>
              {bulkDeleting ? "Excluindo..." : "Excluir selecionadas"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={restoreOpen} onOpenChange={(o) => !restoring && setRestoreOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader className="sm:text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#EB6119]/10 mb-2">
              <Sparkles className="h-6 w-6 text-[#EB6119]" />
            </div>
            <AlertDialogTitle>Restaurar modelo padrão?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                Adicione as contas do plano padrão que ainda estão faltando na empresa.
                Nenhuma conta existente será alterada ou removida.
              </p>
              <ul className="space-y-2 text-left">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#EB6119] mt-0.5 shrink-0" />
                  <span>Contas padrão ausentes são criadas automaticamente.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#EB6119] mt-0.5 shrink-0" />
                  <span>Contas criadas, editadas ou inativadas por você permanecem intactas.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#EB6119] mt-0.5 shrink-0" />
                  <span>A ação é reversível: basta excluir as contas adicionadas manualmente.</span>
                </li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); executeRestore(); }} disabled={restoring}>
              {restoring ? "Restaurando..." : "Restaurar modelo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
