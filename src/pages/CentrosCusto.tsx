import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CostCenterFormDialog, type CostCenterEditItem } from "@/components/cost-centers/CostCenterFormDialog";
import { Plus, Search, Target, Pencil, Power, PowerOff } from "lucide-react";
import { toast } from "sonner";

interface CostCenterRow {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  visible_pf: boolean;
}

export default function CentrosCusto() {
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<CostCenterEditItem | null>(null);
  const [search, setSearch] = useState("");
  const [toggleItem, setToggleItem] = useState<CostCenterRow | null>(null);

  const { data: costCenters = [], isLoading, refetch } = useQuery({
    queryKey: ["cost-centers", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cost_centers")
        .select("id, name, description, is_active, visible_pf")
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as CostCenterRow[];
    },
  });

  const { data: links = [], refetch: refetchLinks } = useQuery({
    queryKey: ["cost-center-companies", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await (supabase.from("cost_center_companies" as any) as any)
        .select("cost_center_id, company_id, companies(name, trade_name)");
      return (data ?? []) as {
        cost_center_id: string;
        company_id: string;
        companies: { name: string; trade_name: string | null } | null;
      }[];
    },
  });

  const companiesByCostCenter = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const l of links) {
      const label = l.companies?.trade_name || l.companies?.name || "";
      if (!label) continue;
      (map[l.cost_center_id] ||= []).push(label);
    }
    return map;
  }, [links]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return costCenters;
    return costCenters.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        (c.description ?? "").toLowerCase().includes(term)
    );
  }, [costCenters, search]);

  const openNew = () => {
    setEditItem(null);
    setDialogOpen(true);
  };

  const openEdit = (item: CostCenterRow) => {
    setEditItem({
      id: item.id,
      name: item.name,
      description: item.description,
      is_active: item.is_active,
      visible_pf: item.visible_pf,
    });
    setDialogOpen(true);
  };

  const applyToggle = async (item: CostCenterRow) => {
    const { error } = await supabase
      .from("cost_centers")
      .update({ is_active: !item.is_active } as any)
      .eq("id", item.id);
    if (error) {
      toast.error("Erro ao alterar status", { description: error.message });
      return;
    }
    toast.success(item.is_active ? "Centro de custo inativado" : "Centro de custo ativado");
    refetch();
  };

  const handleToggleClick = (item: CostCenterRow) => {
    if (item.is_active) setToggleItem(item);
    else applyToggle(item);
  };

  const handleSaved = () => {
    refetch();
    refetchLinks();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Centros de Custo</h1>
          <p className="text-sm text-muted-foreground">
            Cadastre os centros de custo usados para classificar seus lançamentos
          </p>
        </div>
        <Button onClick={openNew} className="hidden md:flex">
          <Plus className="h-4 w-4 mr-2" /> Novo Centro de Custo
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
          maxLength={50}
        />
      </div>

      {isLoading ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px] w-full rounded-lg" />
          ))}
        </div>
      ) : costCenters.length === 0 ? (
        <Card className="shadow-sm">
          <CardContent className="flex flex-col items-center py-12 text-muted-foreground">
            <Target className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm">Nenhum centro de custo cadastrado</p>
            <Button variant="link" onClick={openNew} className="mt-2">
              Criar primeiro centro de custo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <Card key={item.id} className="shadow-sm hover:shadow transition-shadow">
              <CardContent className="flex items-center gap-3 p-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Target className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  {item.description && (
                    <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                  )}
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    <Badge variant={item.is_active ? "secondary" : "outline"} className="text-[10px] h-4 px-1.5">
                      {item.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                    {(companiesByCostCenter[item.id] ?? []).map((name, i) => (
                      <Badge key={i} variant="outline" className="text-[10px] h-4 px-1.5">{name}</Badge>
                    ))}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-primary"
                    onClick={() => openEdit(item)}
                    aria-label={`Editar ${item.name}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-primary"
                    onClick={() => handleToggleClick(item)}
                    aria-label={item.is_active ? `Inativar ${item.name}` : `Ativar ${item.name}`}
                  >
                    {item.is_active ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {filtered.length === 0 && costCenters.length > 0 && (
            <p className="text-sm text-muted-foreground text-center py-8 col-span-full">
              Nenhum centro de custo encontrado
            </p>
          )}
        </div>
      )}

      {/* FAB mobile */}
      <button
        onClick={openNew}
        aria-label="Novo centro de custo"
        className="fixed bottom-20 right-4 z-50 md:hidden flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
      >
        <Plus className="h-6 w-6" />
      </button>

      <CostCenterFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={handleSaved}
        editItem={editItem}
      />

      <AlertDialog open={!!toggleItem} onOpenChange={(open) => !open && setToggleItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Inativar centro de custo?</AlertDialogTitle>
            <AlertDialogDescription>
              Os lançamentos já classificados mantêm este centro de custo, mas ele deixa de aparecer
              para novas seleções. Você pode reativá-lo a qualquer momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (toggleItem) applyToggle(toggleItem);
                setToggleItem(null);
              }}
            >
              Inativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
