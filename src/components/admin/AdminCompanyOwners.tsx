import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Crown, Search, UserPlus } from "lucide-react";
import { formatDate } from "@/lib/date-utils";
import { toast } from "sonner";

type OwnerPerson = {
  userId: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
};

type CompanyOwnersRow = {
  companyId: string;
  name: string;
  tradeName: string | null;
  cnpj: string | null;
  isActive: boolean;
  createdAt: string;
  holder: OwnerPerson | null;
  owners: OwnerPerson[];
  holderIsOwner: boolean;
  subscription: {
    status: string | null;
    isExempt: boolean | null;
    exemptUntil: string | null;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    planName: string | null;
  } | null;
};

const STATUS_LABEL: Record<string, string> = {
  trialing: "Em teste",
  active: "Ativa",
  past_due: "Em atraso",
  canceled: "Cancelada",
  incomplete: "Incompleta",
  paused: "Pausada",
};

function statusBadge(sub: CompanyOwnersRow["subscription"]) {
  if (!sub) return <Badge variant="secondary">Sem assinatura</Badge>;
  if (sub.isExempt) return <Badge variant="outline">Isenta</Badge>;
  const label = STATUS_LABEL[sub.status ?? ""] ?? sub.status ?? "—";
  const variant =
    sub.status === "active" ? "default" : sub.status === "trialing" ? "secondary" : "destructive";
  return <Badge variant={variant as any}>{label}</Badge>;
}

function subDetail(sub: CompanyOwnersRow["subscription"]) {
  if (!sub) return "—";
  if (sub.isExempt) {
    return sub.exemptUntil ? `Isenta até ${formatDate(sub.exemptUntil, "dd/MM/yyyy")}` : "Isenta permanente";
  }
  if (sub.status === "trialing" && sub.trialEndsAt) {
    return `Teste até ${formatDate(sub.trialEndsAt, "dd/MM/yyyy")}`;
  }
  if (sub.currentPeriodEnd) return `Vence ${formatDate(sub.currentPeriodEnd, "dd/MM/yyyy")}`;
  return sub.planName ?? "—";
}

function personLabel(p: OwnerPerson | null) {
  if (!p) return "—";
  return p.fullName || p.email || `${p.userId.slice(0, 8)}…`;
}

async function callOwners(payload: Record<string, unknown>) {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) throw new Error("Sessão expirada. Entre novamente.");
  const { data, error } = await supabase.functions.invoke("admin-company-owners", {
    body: payload,
  });
  if (error) {
    const message = (data as any)?.error;
    throw new Error(typeof message === "string" ? message : error.message);
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return data;
}

export function AdminCompanyOwners() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [addTarget, setAddTarget] = useState<CompanyOwnersRow | null>(null);
  const [addEmail, setAddEmail] = useState("");
  const [removeTarget, setRemoveTarget] = useState<{ row: CompanyOwnersRow; person: OwnerPerson } | null>(null);
  const [transferTarget, setTransferTarget] = useState<{ row: CompanyOwnersRow; person: OwnerPerson } | null>(null);

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["admin-company-owners"],
    queryFn: async () => {
      const data = await callOwners({ action: "list" });
      return (data as { companies: CompanyOwnersRow[] }).companies;
    },
    retry: false,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-company-owners"] });

  const addOwner = useMutation({
    mutationFn: (vars: { companyId: string; email: string }) =>
      callOwners({ action: "add_owner", companyId: vars.companyId, email: vars.email }),
    onSuccess: () => {
      toast.success("Dono adicionado");
      setAddTarget(null);
      setAddEmail("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeOwner = useMutation({
    mutationFn: (vars: { companyId: string; userId: string }) =>
      callOwners({ action: "remove_owner", ...vars }),
    onSuccess: () => {
      toast.success("Dono removido");
      setRemoveTarget(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const transferOwner = useMutation({
    mutationFn: (vars: { companyId: string; userId: string }) =>
      callOwners({ action: "transfer_owner", ...vars }),
    onSuccess: () => {
      toast.success("Titularidade transferida");
      setTransferTarget(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return companies;
    return companies.filter((c) => {
      const people = [c.holder, ...c.owners].filter(Boolean) as OwnerPerson[];
      return (
        c.name.toLowerCase().includes(term) ||
        (c.tradeName?.toLowerCase().includes(term) ?? false) ||
        (c.cnpj?.toLowerCase().includes(term) ?? false) ||
        people.some(
          (p) =>
            (p.fullName?.toLowerCase().includes(term) ?? false) ||
            (p.email?.toLowerCase().includes(term) ?? false),
        )
      );
    });
  }, [companies, search]);

  const renderOwners = (row: CompanyOwnersRow) => {
    const others = row.owners.filter((o) => o.userId !== row.holder?.userId);
    if (others.length === 0) return <span className="text-muted-foreground">—</span>;
    return (
      <div className="space-y-1">
        {others.map((o) => (
          <div key={o.userId} className="flex flex-wrap items-center gap-2">
            <span className="text-sm">{personLabel(o)}</span>
            {o.email && <span className="text-xs text-muted-foreground">{o.email}</span>}
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={() => setTransferTarget({ row, person: o })}
            >
              Tornar titular
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs text-destructive"
              onClick={() => setRemoveTarget({ row, person: o })}
            >
              Remover
            </Button>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="relative sm:max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por empresa, CNPJ, dono ou e-mail..."
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
              <TableHead>Empresa</TableHead>
              <TableHead>Titular (paga)</TableHead>
              <TableHead>Assinatura</TableHead>
              <TableHead>Outros donos</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Nenhuma empresa encontrada
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => (
                <TableRow key={row.companyId}>
                  <TableCell>
                    <div className="font-medium">{row.name}</div>
                    {row.tradeName && (
                      <div className="text-xs text-muted-foreground">{row.tradeName}</div>
                    )}
                    <div className="mt-1 flex items-center gap-2">
                      <Badge variant={row.isActive ? "default" : "secondary"} className="text-[10px]">
                        {row.isActive ? "Ativa" : "Inativa"}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">
                        {formatDate(row.createdAt, "dd/MM/yyyy")}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 font-medium">
                      <Crown className="h-3.5 w-3.5 text-primary" />
                      {personLabel(row.holder)}
                    </div>
                    <div className="text-xs text-muted-foreground">{row.holder?.email ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{row.holder?.phone ?? "—"}</div>
                    {!row.holderIsOwner && (
                      <div className="mt-1 flex items-center gap-1 text-[11px] text-destructive">
                        <AlertTriangle className="h-3 w-3" /> Titular sem papel de dono
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {statusBadge(row.subscription)}
                    <div className="mt-1 text-xs text-muted-foreground">{subDetail(row.subscription)}</div>
                  </TableCell>
                  <TableCell>{renderOwners(row)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => setAddTarget(row)}>
                      <UserPlus className="mr-1.5 h-3.5 w-3.5" /> Adicionar dono
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile */}
      <div className="space-y-3 md:hidden">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-md border p-3">
              <Skeleton className="h-16 w-full" />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma empresa encontrada</p>
        ) : (
          filtered.map((row) => (
            <div key={row.companyId} className="space-y-2 rounded-md border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{row.name}</p>
                  {row.tradeName && (
                    <p className="truncate text-xs text-muted-foreground">{row.tradeName}</p>
                  )}
                </div>
                {statusBadge(row.subscription)}
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Titular: </span>
                {personLabel(row.holder)}
              </div>
              <div className="text-xs text-muted-foreground">{row.holder?.email ?? "—"}</div>
              <div className="text-xs text-muted-foreground">{subDetail(row.subscription)}</div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Outros donos</p>
                {renderOwners(row)}
              </div>
              <Button size="sm" variant="outline" className="w-full" onClick={() => setAddTarget(row)}>
                <UserPlus className="mr-1.5 h-3.5 w-3.5" /> Adicionar dono
              </Button>
            </div>
          ))
        )}
      </div>

      {/* Adicionar dono */}
      <Dialog open={!!addTarget} onOpenChange={(o) => !o && setAddTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar dono</DialogTitle>
            <DialogDescription>
              {addTarget?.name} — informe o e-mail de um usuário já cadastrado no sistema.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="owner-email">E-mail do usuário</Label>
            <Input
              id="owner-email"
              type="email"
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              placeholder="pessoa@empresa.com"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTarget(null)}>
              Cancelar
            </Button>
            <Button
              disabled={!addEmail.trim() || addOwner.isPending}
              onClick={() =>
                addTarget && addOwner.mutate({ companyId: addTarget.companyId, email: addEmail.trim() })
              }
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remover dono */}
      <AlertDialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover dono</AlertDialogTitle>
            <AlertDialogDescription>
              {personLabel(removeTarget?.person ?? null)} deixará de ser dono de {removeTarget?.row.name}. A
              empresa continuará com o titular atual.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                removeTarget &&
                removeOwner.mutate({
                  companyId: removeTarget.row.companyId,
                  userId: removeTarget.person.userId,
                })
              }
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Transferir titularidade */}
      <AlertDialog open={!!transferTarget} onOpenChange={(o) => !o && setTransferTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Transferir titularidade</AlertDialogTitle>
            <AlertDialogDescription>
              {personLabel(transferTarget?.person ?? null)} passará a ser o titular de{" "}
              {transferTarget?.row.name}. A cobrança da assinatura passa a ser desse usuário.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                transferTarget &&
                transferOwner.mutate({
                  companyId: transferTarget.row.companyId,
                  userId: transferTarget.person.userId,
                })
              }
            >
              Transferir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
