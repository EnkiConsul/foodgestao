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

type AdminUserRow = {
  id: string;
  user_id: string;
  full_name: string | null;
  document: string | null;
  phone: string | null;
  profile_type: string;
  currency: string;
  timezone: string;
  onboarding_completed: boolean;
  onboarding_data: any;
  is_active: boolean;
  created_at: string;
  auth: {
    email: string | null;
    phone: string | null;
    email_confirmed_at: string | null;
    last_sign_in_at: string | null;
    created_at: string | null;
  } | null;
};

export function AdminUsers() {
  const [search, setSearch] = useState("");
  const [exemptTarget, setExemptTarget] = useState<{ userId: string; planId: string | null; subscriptionId: string; module: string } | null>(null);
  const removeExemption = useRemoveExemption();

  const queryClient = useQueryClient();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) throw new Error("Sessão expirada. Entre novamente.");
      const { data, error } = await supabase.functions.invoke("admin-list-users-auth");
      if (error) throw error;
      return (data as { users: AdminUserRow[] }).users;
    },
    retry: false,
  });

  const { data: subs = [] } = useQuery({
    queryKey: ["admin-users-subscriptions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("id, user_id, plan_id, module, status, is_exempt, exempt_until, created_at, plan:plans(name, price_cents)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: vinculos } = useQuery({
    queryKey: ["admin-users-vinculos"],
    queryFn: async () => {
      const [comp, mem, roles] = await Promise.all([
        supabase.from("companies").select("id, user_id, name, trade_name"),
        supabase.from("company_members").select("user_id, company_id, role, status"),
        supabase.from("user_roles").select("user_id, role").eq("role", "super_admin"),
      ]);
      if (comp.error) throw comp.error;
      if (mem.error) throw mem.error;
      return { companies: comp.data ?? [], members: mem.data ?? [], superAdmins: roles.data ?? [] };
    },
  });

  /** Clientes = dono de empresa, administrador de empresa ou super admin. */
  const vinculoByUser = useMemo(() => {
    const map = new Map<string, { papel: string; empresas: string[] }>();
    if (!vinculos) return map;
    const nomeEmp = new Map<string, string>();
    for (const c of vinculos.companies as any[]) nomeEmp.set(c.id, c.trade_name || c.name || "—");
    const add = (uid: string, papel: string, emp?: string) => {
      const cur = map.get(uid) ?? { papel, empresas: [] };
      if (papel === "Dono") cur.papel = "Dono";
      if (emp && !cur.empresas.includes(emp)) cur.empresas.push(emp);
      map.set(uid, cur);
    };
    for (const c of vinculos.companies as any[]) if (c.user_id) add(c.user_id, "Dono", nomeEmp.get(c.id));
    for (const m of vinculos.members as any[]) {
      if (m.status && m.status !== "active") continue;
      if (m.role === "owner") add(m.user_id, "Dono", nomeEmp.get(m.company_id));
      else if (m.role === "admin") add(m.user_id, map.get(m.user_id)?.papel ?? "Administrador", nomeEmp.get(m.company_id));
    }
    for (const r of vinculos.superAdmins as any[]) if (!map.has(r.user_id)) add(r.user_id, "Super Admin");
    return map;
  }, [vinculos]);

  /** Assinatura mais recente por usuário e módulo. */
  const subsByUser = useMemo(() => {
    const map = new Map<string, Record<string, any>>();
    for (const s of subs as any[]) {
      const mod = s.module ?? "financeiro";
      const cur = map.get(s.user_id) ?? {};
      const prev = cur[mod];
      const vivo = (x: any) => x && (isExempt(x) || ["active", "trialing", "past_due", "pending"].includes(x.status));
      if (!prev || (!vivo(prev) && vivo(s))) cur[mod] = s;
      map.set(s.user_id, cur);
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
    if (!vinculoByUser.has(u.user_id)) return false;
    const term = search.toLowerCase();
    const emp = vinculoByUser.get(u.user_id)!.empresas.join(" ").toLowerCase();
    return (
      emp.includes(term) ||
      (u.full_name?.toLowerCase().includes(term) ?? false) ||
      (u.document?.toLowerCase().includes(term) ?? false) ||
      (u.phone?.toLowerCase().includes(term) ?? false) ||
      (u.auth?.phone?.toLowerCase().includes(term) ?? false) ||
      (u.auth?.email?.toLowerCase().includes(term) ?? false)
    );
  });

  const STATUS: Record<string, string> = {
    active: "Ativo", trialing: "Em teste", past_due: "Em atraso", pending: "Pendente",
    canceled: "Cancelado", cancelled: "Cancelado", expired: "Expirado",
  };
  const MODULOS = [
    { key: "financeiro", label: "Financeiro 360°" },
    { key: "pessoas", label: "Pessoas 360°" },
  ];

  const ModulosCell = ({ userId }: { userId: string }) => {
    const m = subsByUser.get(userId) ?? {};
    return (
      <div className="flex flex-col gap-1.5">
        {MODULOS.map(({ key, label }) => {
          const s = m[key];
          const exempt = isExempt(s);
          return (
            <div key={key} className="flex flex-wrap items-center gap-1 text-xs">
              <span className="font-medium">{label}:</span>
              {s ? (
                <>
                  <span className="text-muted-foreground">{s.plan?.name ?? "—"}</span>
                  {exempt ? (
                    <Badge variant="secondary" className="text-[10px]">{exemptionLabel(s)}</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">{STATUS[s.status] ?? s.status}</Badge>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground">Não contratado</span>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const MenuModulos = ({ userId }: { userId: string }) => {
    const m = subsByUser.get(userId) ?? {};
    return (
      <>
        {MODULOS.map(({ key, label }) => {
          const s = m[key];
          if (!s) return <DropdownMenuItem key={key} disabled>{label}: sem assinatura</DropdownMenuItem>;
          return isExempt(s) ? (
            <DropdownMenuItem
              key={key}
              onClick={() => {
                if (confirm(`Remover isenção do ${label}? O cliente voltará ao fluxo normal de cobrança deste módulo.`))
                  removeExemption.mutate(s.id);
              }}
            >Remover isenção — {label}</DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              key={key}
              onClick={() => setExemptTarget({ userId, planId: s.plan_id, subscriptionId: s.id, module: key })}
            >Isentar — {label}</DropdownMenuItem>
          );
        })}
      </>
    );
  };

  return (
    <div className="space-y-4">
      <div className="relative w-full sm:max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, empresa, e-mail, documento ou telefone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Desktop */}
      <div className="hidden md:block rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>WhatsApp</TableHead>
              <TableHead>Empresa / Papel</TableHead>
              <TableHead>Módulos / Isenção</TableHead>
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
                  {Array.from({ length: 9 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  Nenhum cliente encontrado
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((user) => {
                const vinc = vinculoByUser.get(user.user_id);
                return (
                  <TableRow key={user.id} className={!user.is_active ? "opacity-60" : ""}>
                    <TableCell className="font-medium">{user.full_name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{user.auth?.email ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{user.phone || user.auth?.phone || "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant="outline" className="w-fit text-[10px]">{vinc?.papel}</Badge>
                        <span className="text-xs text-muted-foreground">{vinc?.empresas.join(", ") || "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell><ModulosCell userId={user.user_id} /></TableCell>
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
                      {formatDate(user.created_at, "dd/MM/yyyy")}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <MenuModulos userId={user.user_id} />
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

      {/* Mobile */}
      <div className="md:hidden space-y-2">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-md border p-3"><Skeleton className="h-16 w-full" /></div>
          ))
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">Nenhum cliente encontrado</p>
        ) : (
          filtered.map((user) => {
            const vinc = vinculoByUser.get(user.user_id);
            return (
              <div key={user.id} className={`rounded-md border p-3 space-y-2 ${!user.is_active ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{user.full_name || "—"}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{user.auth?.email ?? "—"}</p>
                    <p className="text-[11px] text-muted-foreground">{user.phone || user.auth?.phone || "—"}</p>
                    <p className="text-[11px] text-muted-foreground">{formatDate(user.created_at, "dd/MM/yyyy")}</p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <MenuModulos userId={user.user_id} />
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="text-[10px]">{vinc?.papel}</Badge>
                  {vinc?.empresas.length ? <Badge variant="outline" className="text-[10px]">{vinc.empresas.join(", ")}</Badge> : null}
                  <Badge variant={user.onboarding_completed ? "default" : "secondary"} className="text-[10px]">
                    {user.onboarding_completed ? "Onboarding OK" : "Onboarding pendente"}
                  </Badge>
                </div>
                <ModulosCell userId={user.user_id} />
                <div className="flex items-center justify-between pt-1 border-t">
                  <span className="text-xs text-muted-foreground">{user.is_active ? "Ativo" : "Inativo"}</span>
                  <Switch
                    checked={user.is_active}
                    onCheckedChange={(checked) =>
                      toggleActive.mutate({ id: user.id, is_active: checked, full_name: user.full_name })
                    }
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      <ExemptSubscriptionDialog
        open={!!exemptTarget}
        onOpenChange={(o) => !o && setExemptTarget(null)}
        subscriptionId={exemptTarget?.subscriptionId ?? null}
        userId={exemptTarget?.userId ?? null}
        defaultPlanId={exemptTarget?.planId ?? null}
        module={exemptTarget?.module ?? null}
      />
    </div>
  );
}
