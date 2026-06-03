import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { CompanyFormDialog } from "@/components/companies/CompanyFormDialog";
import { Plus, Search, Building2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useCompanyQuota } from "@/hooks/useCompanyQuota";
import { formatCents } from "@/lib/billing";
import type { Database } from "@/integrations/supabase/types";

type Company = Database["public"]["Tables"]["companies"]["Row"];


export default function Empresas() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: quota, refetch: refetchQuota } = useCompanyQuota();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editCompany, setEditCompany] = useState<Company | null>(null);
  const [deleteCompany, setDeleteCompany] = useState<Company | null>(null);
  const [confirmExtra, setConfirmExtra] = useState(false);
  const [search, setSearch] = useState("");

  const syncQuota = useCallback(async () => {
    try {
      await supabase.functions.invoke("sync-extra-companies");
    } catch (e) {
      console.error("sync-extra-companies failed", e);
    } finally {
      await refetchQuota();
      qc.invalidateQueries({ queryKey: ["current-subscription"] });
    }
  }, [refetchQuota, qc]);



  const fetchCompanies = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("companies")
      .select("*")
      .eq("user_id", user.id)
      .order("name");
    if (error) toast.error("Erro ao carregar empresas");
    else setCompanies(data ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);

  const handleDelete = async () => {
    if (!deleteCompany) return;
    const deletedName = deleteCompany.name;
    const { error } = await supabase.from("companies").delete().eq("id", deleteCompany.id);
    if (error) toast.error("Erro ao excluir empresa", { description: error.message });
    else {
      await supabase.rpc("insert_audit_log", {
        _action: "company_deleted",
        _entity_type: "company",
        _entity_id: deleteCompany.id,
        _details: { target_name: deletedName },
      });
      toast.success("Empresa excluída");
      fetchCompanies();
      syncQuota();
    }
    setDeleteCompany(null);
  };

  const requestNewCompany = () => {
    setEditCompany(null);
    if (!quota) { setDialogOpen(true); return; }
    if (quota.blocked) {
      toast.error("Limite de perfis do plano atingido", {
        description: "Faça upgrade do plano para adicionar mais perfis.",
        action: { label: "Ver planos", onClick: () => navigate("/planos") },
      });
      return;
    }
    if (quota.requiresPaidExtra) {
      setConfirmExtra(true);
      return;
    }
    setDialogOpen(true);
  };

  const handleCompanySaved = () => {
    fetchCompanies();
    syncQuota();
  };


  const handleToggleActive = async (company: Company) => {
    const { error } = await supabase
      .from("companies")
      .update({ is_active: !company.is_active })
      .eq("id", company.id);
    if (error) toast.error("Erro ao atualizar status");
    else fetchCompanies();
  };

  const filtered = useMemo(() => {
    return companies.filter((c) => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        c.name.toLowerCase().includes(s) ||
        (c.trade_name?.toLowerCase().includes(s)) ||
        (c.cnpj?.includes(s))
      );
    });
  }, [companies, search]);

  const totals = useMemo(() => {
    const active = companies.filter((c) => c.is_active);
    return { total: companies.length, active: active.length };
  }, [companies]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Perfis de Acesso</h1>
          <p className="text-sm text-muted-foreground">Gerencie seus perfis de acesso cadastrados</p>
        </div>
        <Button onClick={requestNewCompany} className="hidden md:flex">
          <Plus className="h-4 w-4 mr-2" /> Novo Perfil
        </Button>
      </div>

      {quota && quota.pricePerExtraCents > 0 && (
        <div className="text-xs text-muted-foreground bg-muted/40 border rounded-md px-3 py-2">
          {quota.total} perfil(is) · {quota.included} incluso(s) no plano
          {quota.extraBilled > 0 && (
            <> · {quota.extraBilled} extra(s) sendo cobrado(s) ({formatCents(quota.extraBilled * quota.pricePerExtraCents)})</>
          )}
          {" · "}Adicional: {formatCents(quota.pricePerExtraCents)}/perfil</div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="shadow-sm">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-lg font-bold text-foreground">{totals.total}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Ativas</p>
            <p className="text-lg font-bold text-foreground">{totals.active}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por nome, nome fantasia ou CNPJ..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" maxLength={100} />
      </div>

      {/* Company list */}
      <div className="space-y-2">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : filtered.length === 0 ? (
          <Card className="shadow-sm">
            <CardContent className="flex flex-col items-center py-12 text-muted-foreground">
              <Building2 className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm">Nenhuma empresa encontrada</p>
              <Button variant="link" onClick={requestNewCompany} className="mt-2">
                Cadastrar primeira empresa
              </Button>
            </CardContent>
          </Card>
        ) : (
          filtered.map((c) => (
            <Card key={c.id} className={`shadow-sm hover:shadow transition-shadow ${!c.is_active ? "opacity-60" : ""}`}>
              <CardContent className="flex items-center gap-3 p-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Building2 className="h-4 w-4 text-primary" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    {!c.is_active && (
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 shrink-0">Inativa</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {c.trade_name && (
                      <p className="text-xs text-muted-foreground truncate">{c.trade_name}</p>
                    )}
                    {c.cnpj && (
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5 shrink-0">{c.cnpj}</Badge>
                    )}
                  </div>
                </div>

                <Switch
                  checked={c.is_active}
                  onCheckedChange={() => handleToggleActive(c)}
                  className="shrink-0"
                />

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
                  onClick={() => { setEditCompany(c); setDialogOpen(true); }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => setDeleteCompany(c)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* FAB mobile */}
      <button
        onClick={requestNewCompany}
        className="fixed bottom-20 right-4 z-50 md:hidden flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
      >
        <Plus className="h-6 w-6" />
      </button>

      <CompanyFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={handleCompanySaved}
        company={editCompany}
      />

      <AlertDialog open={!!deleteCompany} onOpenChange={(open) => { if (!open) setDeleteCompany(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir empresa</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a empresa <strong>{deleteCompany?.name}</strong>? Todos os dados vinculados serão removidos. Esta ação não pode ser desfeita.
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

      <AlertDialog open={confirmExtra} onOpenChange={setConfirmExtra}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Adicionar perfil extra?</AlertDialogTitle>
            <AlertDialogDescription>
              Seu plano inclui {quota?.included} perfil(is). Adicionar este novo perfil gera uma cobrança adicional de{" "}
              <strong>{quota && formatCents(quota.pricePerExtraCents)}/mês</strong>{" "}
              na próxima fatura. Você pode remover o perfil a qualquer momento para reduzir a cobrança.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmExtra(false); setDialogOpen(true); }}>
              Confirmar e cadastrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
