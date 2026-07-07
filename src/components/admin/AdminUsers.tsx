import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, MoreHorizontal } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { formatDate } from "@/lib/date-utils";
import { toast } from "sonner";
import { isExempt, exemptionLabel } from "@/lib/billing";
import { useRemoveExemption } from "@/hooks/useBilling";
import { ExemptSubscriptionDialog } from "./ExemptSubscriptionDialog";

export function AdminUsers() {
  const [search, setSearch] = useState("");
  const [exemptTarget, setExemptTarget] = useState<{ userId: string; planId: string | null } | null>(null);
  const removeExemption = useRemoveExemption();

  const queryClient = useQueryClient();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: subs = [] } = useQuery({
    queryKey: ["admin-users-subscriptions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("id, user_id, plan_id, status, is_exempt, exempt_until, created_at, plan:plans(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const subByUser = useMemo(() => {
    const map = new Map<string, any>();
    for (const s of subs as any[]) {
      if (!map.has(s.user_id)) map.set(s.user_id, s);
    }
    return map;
  }, [subs]);

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active, full_name }: { id: string; is_active: boolean; full_name: string | null }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;

      await supabase.rpc("insert_audit_log", {
        _action: is_active ? "user_activated" : "user_deactivated",
        _entity_type: "user",
        _entity_id: id,
        _details: { target_name: full_name || "—" },
      });
    },
    onSuccess: (_, { is_active }) => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-audit-logs"] });
      toast.success(is_active ? "Usuário ativado" : "Usuário desativado");
    },
    onError: () => {
      toast.error("Erro ao alterar status do usuário");
    },
  });

  const filtered = users.filter((u) => {
    const term = search.toLowerCase();
    return (
      (u.full_name?.toLowerCase().includes(term) ?? false) ||
      (u.document?.toLowerCase().includes(term) ?? false) ||
      (u.phone?.toLowerCase().includes(term) ?? false)
    );
  });

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, documento ou telefone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Plano / Isenção</TableHead>
              <TableHead>Onboarding</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Cadastro</TableHead>
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Nenhum usuário encontrado
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((user) => {
                const sub = subByUser.get(user.user_id);
                const exempt = isExempt(sub);
                return (
                  <TableRow key={user.id} className={!user.is_active ? "opacity-60" : ""}>
                    <TableCell className="font-medium">{user.full_name || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{user.profile_type}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs">{sub?.plan?.name ?? "—"}</span>
                        {exempt && (
                          <Badge variant="secondary" className="w-fit text-[10px]">{exemptionLabel(sub)}</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.onboarding_completed ? "default" : "secondary"}>
                        {user.onboarding_completed ? "Completo" : "Pendente"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={user.is_active}
                          onCheckedChange={(checked) =>
                            toggleActive.mutate({ id: user.id, is_active: checked, full_name: user.full_name })
                          }
                        />
                        <span className="text-xs text-muted-foreground">
                          {user.is_active ? "Ativo" : "Inativo"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(user.created_at), "dd/MM/yyyy", { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {exempt ? (
                            <DropdownMenuItem
                              onClick={() => {
                                if (confirm("Remover isenção? O cliente voltará ao fluxo normal de cobrança."))
                                  removeExemption.mutate(sub.id);
                              }}
                            >
                              Remover isenção
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              disabled={!sub}
                              onClick={() => setExemptTarget({ userId: user.user_id, planId: sub?.plan_id ?? null })}
                            >
                              Isentar mensalidade
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <ExemptSubscriptionDialog
        open={!!exemptTarget}
        onOpenChange={(o) => !o && setExemptTarget(null)}
        subscriptionId={null}
        userId={exemptTarget?.userId ?? null}
        defaultPlanId={exemptTarget?.planId ?? null}
      />
    </div>
  );
}
