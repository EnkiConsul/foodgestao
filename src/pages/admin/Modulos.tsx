import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Loader2 } from "lucide-react";
import { MODULES, statusLabel, type AppModule, type ModuleStatus, MODULE_BY_SLUG } from "@/lib/modules";
import { ModulosCatalogoCard } from "@/components/admin/ModulosCatalogoCard";

interface CompanyRow { id: string; name: string; trade_name: string | null }
interface ModuleRow {
  id: string;
  company_id: string;
  module: AppModule;
  status: ModuleStatus;
  starts_at: string | null;
  ends_at: string | null;
  trial_iniciado_em: string | null;
  trial_termina_em: string | null;
}

const STATUS_OPTIONS: ModuleStatus[] = ["not_contracted", "trial", "active", "suspended", "canceled"];

function formatDate(value: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString("pt-BR");
}


export default function AdminModulos() {
  const [search, setSearch] = useState("");
  const qc = useQueryClient();

  const companiesQuery = useQuery({
    queryKey: ["admin_companies_modules"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("id,name,trade_name").order("name");
      if (error) throw error;
      return (data ?? []) as CompanyRow[];
    },
  });

  const modulesQuery = useQuery({
    queryKey: ["admin_all_company_modules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_modules")
        .select("id,company_id,module,status,starts_at,ends_at,trial_iniciado_em,trial_termina_em");
      if (error) throw error;
      return (data ?? []) as ModuleRow[];
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async ({ company_id, module, status }: { company_id: string; module: AppModule; status: ModuleStatus }) => {
      const { error } = await supabase
        .from("company_modules")
        .upsert(
          { company_id, module, status, starts_at: (status === "active" || status === "trial") ? new Date().toISOString() : null },
          { onConflict: "company_id,module" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Módulo atualizado");
      qc.invalidateQueries({ queryKey: ["admin_all_company_modules"] });
      qc.invalidateQueries({ queryKey: ["company_modules"] });
      qc.invalidateQueries({ queryKey: ["module-entitlement"] });
    },
    onError: (e) => toast.error("Falha ao salvar", { description: e instanceof Error ? e.message : String(e) }),
  });

  const modulesByCompany = useMemo(() => {
    const map = new Map<string, Partial<Record<AppModule, ModuleRow>>>();
    (modulesQuery.data ?? []).forEach((r) => {
      const cur = map.get(r.company_id) ?? {};
      cur[r.module] = r;
      map.set(r.company_id, cur);
    });
    return map;
  }, [modulesQuery.data]);


  const filtered = (companiesQuery.data ?? []).filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || (c.trade_name ?? "").toLowerCase().includes(q);
  });

  const loading = companiesQuery.isLoading || modulesQuery.isLoading;

  return (
    <div className="space-y-6">
      <Helmet><title>Módulos — Admin 360°FOOD</title></Helmet>
      <AdminPageHeader
        title="Contratação de Módulos"
        description="Ative, suspenda ou cancele módulos por empresa. Financeiro é ativado automaticamente."
      />

      <ModulosCatalogoCard />


      <Card>
        <CardContent className="p-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar empresa..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Empresa</TableHead>
                  {MODULES.map((m) => (
                    <TableHead key={m.slug} className="min-w-[160px]">{m.shortName}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => {
                  const mods = modulesByCompany.get(c.id) ?? {};
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="font-medium">{c.name}</div>
                        {c.trade_name && <div className="text-xs text-muted-foreground">{c.trade_name}</div>}
                      </TableCell>
                      {MODULES.map((m) => {
                        const row = mods[m.slug];
                        const status: ModuleStatus = row?.status ?? "not_contracted";
                        const trialEnd = formatDate(row?.trial_termina_em ?? null);
                        const startedAt = formatDate(row?.starts_at ?? null);
                        return (
                          <TableCell key={m.slug} className="align-top">
                            <Select
                              value={status}
                              onValueChange={(val) =>
                                upsertMutation.mutate({ company_id: c.id, module: m.slug, status: val as ModuleStatus })
                              }
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {STATUS_OPTIONS.map((s) => (
                                  <SelectItem key={s} value={s} className="text-xs">
                                    {statusLabel(s)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className="mt-1 space-y-0.5 text-[10px] leading-tight text-muted-foreground">
                              {startedAt && <div>Início: {startedAt}</div>}
                              {trialEnd && <div>Teste até {trialEnd}</div>}
                              {row?.trial_iniciado_em && <div>Teste já utilizado</div>}
                              {m.parent && <div>Requer {MODULE_BY_SLUG[m.parent].shortName}</div>}
                            </div>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={MODULES.length + 1} className="text-center text-muted-foreground py-8">
                      Nenhuma empresa encontrada.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
