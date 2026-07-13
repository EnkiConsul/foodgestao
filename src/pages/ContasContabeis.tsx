import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, ChevronRight, ChevronDown, PlusCircle, Sparkles } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ChartAccount | null>(null);
  const [defaultParent, setDefaultParent] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<ChartAccount | null>(null);

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

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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

  const renderNode = (node: Node, depth = 0) => {
    const hasChildren = node.children.length > 0;
    const isOpen = expanded.has(node.id);
    return (
      <div key={node.id}>
        <div
          className="flex items-center gap-2 py-2 px-2 rounded hover:bg-muted/50 group border-b"
          style={{ paddingLeft: `${depth * 20 + 8}px` }}
        >
          <button
            type="button"
            onClick={() => hasChildren && toggleExpand(node.id)}
            className={`h-5 w-5 flex items-center justify-center ${hasChildren ? "" : "invisible"}`}
          >
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          <span className="font-mono text-xs text-muted-foreground w-24 shrink-0">{node.code}</span>
          <span className="flex-1 text-sm truncate">{node.name}</span>
          {node.short_code && <Badge variant="outline" className="text-[10px] font-mono">{node.short_code}</Badge>}
          {node.is_tax && <Badge variant="secondary" className="text-[10px]">Imposto</Badge>}
          <Badge variant={node.allow_transactions ? "default" : "outline"} className="text-[10px]">
            {node.allow_transactions ? "Analítica" : "Sintética"}
          </Badge>
          <Badge variant={node.is_active ? "default" : "destructive"} className="text-[10px]">
            {node.is_active ? "Ativa" : "Inativa"}
          </Badge>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {!node.allow_transactions && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openNew(node.id)} title="Adicionar filha">
                <PlusCircle className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(node)} title="Editar">
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(node)} title="Excluir">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {isOpen && hasChildren && node.children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  const handleRestoreDefault = async () => {
    if (!selectedCompanyId) return;
    if (!confirm("Isto irá adicionar as contas do modelo padrão que ainda não existirem nesta empresa. Contas atuais serão mantidas. Continuar?")) return;
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
    <div className="space-y-6">
      <Helmet><title>Contas Contábeis | 360°FOOD</title></Helmet>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Contas Contábeis</h1>
          <p className="text-sm text-muted-foreground">Plano de contas hierárquico. Contas Sintéticas agrupam; Analíticas recebem lançamentos.</p>
        </div>
        <div className="flex gap-2">
          {canRestore && (
            <Button variant="outline" onClick={handleRestoreDefault} disabled={restoring} title="Adiciona contas do modelo padrão que ainda não existem">
              <Sparkles className="h-4 w-4 mr-2" /> {restoring ? "Restaurando..." : "Restaurar Modelo Padrão"}
            </Button>
          )}
          <Button onClick={() => openNew(null)}>
            <Plus className="h-4 w-4 mr-2" /> Nova Conta
          </Button>
        </div>
      </div>


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
          <div className="divide-y">{tree.map((n) => renderNode(n))}</div>
        )}
      </Card>

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
    </div>
  );
}
