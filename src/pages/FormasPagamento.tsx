import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PaymentMethodFormDialog } from "@/components/payment-methods/PaymentMethodFormDialog";
import { Plus, Search, CreditCard, Pencil, Trash2, Download } from "lucide-react";
import { toast } from "sonner";

export default function FormasPagamento() {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<{ id: string; name: string; is_active: boolean; visible_pf?: boolean } | null>(null);
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const { data: methods = [], refetch } = useQuery({
    queryKey: ["payment-methods", user?.id, contextType, selectedCompanyId],
    enabled: !!user && (contextType === "pf" || !!selectedCompanyId),
    queryFn: async () => {
      // PJ: somente formas vinculadas à empresa selecionada.
      if (contextType === "pj") {
        const { data } = await (supabase.from("payment_methods") as any)
          .select("*, payment_method_companies!inner(company_id)")
          .eq("payment_method_companies.company_id", selectedCompanyId)
          .order("name");
        return data ?? [];
      }
      // PF (legado): somente formas visíveis no contexto pessoal.
      const { data } = await supabase
        .from("payment_methods")
        .select("*")
        .eq("user_id", user!.id)
        .eq("visible_pf", true)
        .order("name");
      return data ?? [];
    },
  });

  const { data: methodCompanies = [], refetch: refetchCompanies } = useQuery({
    queryKey: ["payment-method-companies", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await (supabase.from("payment_method_companies" as any) as any)
        .select("payment_method_id, company_id, companies(name, trade_name)");
      return (data ?? []) as { payment_method_id: string; company_id: string; companies: { name: string; trade_name: string | null } }[];
    },
  });

  const companiesByMethod = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const mc of methodCompanies) {
      if (!map[mc.payment_method_id]) map[mc.payment_method_id] = [];
      map[mc.payment_method_id].push(mc.companies?.trade_name || mc.companies?.name || "");
    }
    return map;
  }, [methodCompanies]);

  const filtered = useMemo(() => {
    if (!search) return methods;
    return methods.filter((m: any) => m.name.toLowerCase().includes(search.toLowerCase()));
  }, [methods, search]);

  const confirmDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("payment_methods").delete().eq("id", deleteId);
    if (error) toast.error("Erro ao excluir", { description: error.message });
    else { toast.success("Forma de pagamento excluída"); refetch(); refetchCompanies(); }
    setDeleteId(null);
  };

  const openEdit = (item: any) => {
    setEditItem({ id: item.id, name: item.name, is_active: item.is_active, visible_pf: item.visible_pf });
    setDialogOpen(true);
  };

  const openNew = () => {
    setEditItem(null);
    setDialogOpen(true);
  };

  const handleSaved = () => {
    refetch();
    refetchCompanies();
  };

  const importDefaults = async () => {
    if (contextType === "pj" && !selectedCompanyId) {
      toast.error("Selecione uma empresa para importar as formas padrão");
      return;
    }
    setImporting(true);
    const { data, error } = await (supabase.rpc as any)("apply_default_payment_methods", {
      _context: contextType,
      _company_id: contextType === "pj" ? selectedCompanyId : null,
    });
    setImporting(false);
    if (error) {
      toast.error("Erro ao importar formas padrão", { description: error.message });
      return;
    }
    toast.success(
      (data ?? 0) > 0
        ? `${data} forma(s) de pagamento importada(s)`
        : "As formas padrão já estão disponíveis"
    );
    handleSaved();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Formas de Pagamento</h1>
          <p className="text-sm text-muted-foreground">Gerencie as formas de pagamento disponíveis</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={importDefaults} disabled={importing}>
            <Download className="h-4 w-4 mr-2" /> Importar padrão
          </Button>
          <Button onClick={openNew} className="hidden md:flex">
            <Plus className="h-4 w-4 mr-2" /> Nova Forma
          </Button>
        </div>
      </div>


      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" maxLength={50} />
      </div>

      {methods.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center py-12 text-muted-foreground">
            <CreditCard className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm">Nenhuma forma de pagamento criada</p>
            <Button variant="link" onClick={openNew} className="mt-2">
              Criar primeira forma de pagamento
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item: any) => (
            <Card key={item.id} className="shadow-sm hover:shadow transition-shadow">
              <CardContent className="flex items-center gap-3 p-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <CreditCard className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    <Badge variant={item.is_active ? "secondary" : "outline"} className="text-[10px] h-4 px-1.5">
                      {item.is_active ? "Ativa" : "Inativa"}
                    </Badge>
                    {item.visible_pf && (
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5">Pessoal</Badge>
                    )}
                    {(companiesByMethod[item.id] ?? []).map((name: string, i: number) => (
                      <Badge key={i} variant="outline" className="text-[10px] h-4 px-1.5">{name}</Badge>
                    ))}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={() => openEdit(item)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(item.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {filtered.length === 0 && methods.length > 0 && (
            <p className="text-sm text-muted-foreground text-center py-8 col-span-full">Nenhuma forma encontrada</p>
          )}
        </div>
      )}

      {/* FAB mobile */}
      <button
        onClick={openNew}
        className="fixed bottom-20 right-4 z-50 md:hidden flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
      >
        <Plus className="h-6 w-6" />
      </button>

      <PaymentMethodFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={handleSaved}
        editItem={editItem}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir forma de pagamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A forma de pagamento será removida permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
