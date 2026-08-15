import { Bell, AlertTriangle, Clock, TrendingUp, CheckCircle2, Calculator, BellOff } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/billing";
import { toast } from "sonner";

type Alert = {
  id: string;
  type: "overdue" | "upcoming" | "budget" | "accountant";
  title: string;
  description: string;
  href: string;
  snoozeKey?: string;
};

const formatDate = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

const accountantSnoozeKey = (companyId: string) => `accountant-reminder-snooze-${companyId}`;

export const SNOOZE_OPTIONS = [
  { label: "Por 1 mês", days: 30 },
  { label: "Por 3 meses", days: 90 },
  { label: "Por 6 meses", days: 180 },
  { label: "Por 1 ano", days: 365 },
  { label: "Não mostrar novamente", days: null as number | null },
];

const isSnoozed = (key: string) => {
  if (typeof window === "undefined") return false;
  const raw = localStorage.getItem(key);
  if (!raw) return false;
  if (raw === "never" || raw === "1") return true;
  const until = Date.parse(raw);
  if (Number.isNaN(until)) return false;
  if (until > Date.now()) return true;
  localStorage.removeItem(key);
  return false;
};

const applySnooze = (key: string, days: number | null) => {
  if (typeof window === "undefined") return;
  if (days === null) {
    localStorage.setItem(key, "never");
    return;
  }
  localStorage.setItem(key, new Date(Date.now() + days * 86400000).toISOString());
};

export function NotificationsBell() {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();
  const navigate = useNavigate();
  const [snoozeVersion, setSnoozeVersion] = useState(0);

  const today = new Date().toISOString().slice(0, 10);
  const in7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const { data: alerts = [] } = useQuery<Alert[]>({
    queryKey: ["alerts-bell", user?.id, contextType, selectedCompanyId, snoozeVersion],
    enabled: !!user,
    refetchInterval: 60_000,
    queryFn: async () => {
      const result: Alert[] = [];


      // Base filters
      let txQuery = supabase
        .from("transactions")
        .select("id, description, amount, amount_paid, due_date, bill_status")
        .eq("user_id", user!.id)
        .eq("context", contextType)
        .not("due_date", "is", null)
        .neq("bill_status", "pago")
        .lte("due_date", in7)
        .order("due_date", { ascending: true })
        .limit(20);

      if (contextType === "pj" && selectedCompanyId) {
        txQuery = txQuery.eq("company_id", selectedCompanyId);
      }
      if (contextType === "pf") {
        txQuery = txQuery.is("company_id", null);
      }

      const { data: txs } = await txQuery;

      (txs ?? []).forEach((t: any) => {
        const remaining = Number(t.amount ?? 0) - Number(t.amount_paid ?? 0);
        if (remaining <= 0) return;
        const overdue = t.due_date < today;
        result.push({
          id: `tx-${t.id}`,
          type: overdue ? "overdue" : "upcoming",
          title: overdue ? "Conta atrasada" : "Vence em breve",
          description: `${t.description} • ${formatBRL(remaining)} • ${formatDate(t.due_date)}`,
          href: "/lancamentos",
        });
      });

      // Budgets
      const budgetQuery = supabase
        .from("budgets")
        .select("id, amount, category_id, start_date, end_date, category:categories(name)")
        .eq("user_id", user!.id)
        .eq("context", contextType)
        .lte("start_date", today)
        .gte("end_date", today);

      const { data: budgets } = await budgetQuery;

      for (const b of budgets ?? []) {
        let spentQ = supabase
          .from("transactions")
          .select("amount")
          .eq("user_id", user!.id)
          .eq("context", contextType)
          .eq("transaction_type", "saida")
          .eq("status", "confirmado")
          .eq("category_id", b.category_id)
          .gte("transaction_date", b.start_date)
          .lte("transaction_date", b.end_date);

        if (contextType === "pj" && selectedCompanyId) {
          spentQ = spentQ.eq("company_id", selectedCompanyId);
        }
        if (contextType === "pf") {
          spentQ = spentQ.is("company_id", null);
        }

        const { data: spentRows } = await spentQ;
        const spent = (spentRows ?? []).reduce((s, r: any) => s + Number(r.amount ?? 0), 0);
        const pct = b.amount > 0 ? (spent / Number(b.amount)) * 100 : 0;
        if (pct >= 90) {
          result.push({
            id: `bg-${b.id}`,
            type: "budget",
            title: pct >= 100 ? "Orçamento estourado" : "Orçamento próximo do limite",
            description: `${(b as any).category?.name ?? "Categoria"} • ${pct.toFixed(0)}% usado`,
            href: "/orcamento",
          });
        }
      }

      // Accountant access reminder (PJ only, snoozable, only for owner/admin)
      if (contextType === "pj" && selectedCompanyId) {
        const storageKey = accountantSnoozeKey(selectedCompanyId);

        if (!isSnoozed(storageKey)) {
          const { data: myMembership } = await supabase
            .from("company_members")
            .select("role")
            .eq("company_id", selectedCompanyId)
            .eq("user_id", user!.id)
            .maybeSingle();

          const isAdminOrOwner = myMembership?.role === "owner" || myMembership?.role === "admin";

          if (isAdminOrOwner) {
            const { data: accountants } = await supabase
              .from("company_members")
              .select("id")
              .eq("company_id", selectedCompanyId)
              .eq("role", "contabilidade")
              .limit(1);

            const { data: pendingInvites } = await supabase
              .from("company_invites")
              .select("id")
              .eq("company_id", selectedCompanyId)
              .eq("role", "contabilidade")
              .eq("status", "pending")
              .limit(1);

            if (!accountants?.length && !pendingInvites?.length) {
              result.push({
                id: `accountant-${selectedCompanyId}`,
                type: "accountant",
                title: "Cadastre o acesso do seu contador",
                description: "Adicione um usuário com papel Contabilidade para acesso somente leitura às contas contábeis.",
                href: "/gestao-usuarios",
                snoozeKey: storageKey,
              });
            }
          }
        }
      }


      return result;
    },
  });

  const count = alerts.length;
  const grouped = useMemo(() => {
    const order = ["overdue", "upcoming", "budget", "accountant"] as const;
    return order.flatMap((t) => alerts.filter((a) => a.type === t));
  }, [alerts]);

  const iconFor = (t: Alert["type"]) =>
    t === "overdue" ? (
      <AlertTriangle className="h-4 w-4 text-destructive" />
    ) : t === "upcoming" ? (
      <Clock className="h-4 w-4 text-warning" />
    ) : t === "accountant" ? (
      <Calculator className="h-4 w-4 text-emerald-600" />
    ) : (
      <TrendingUp className="h-4 w-4 text-primary" />
    );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground relative"
          title="Notificações"
        >
          <Bell className="h-4 w-4" />
          {count > 0 && (
            <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-4 py-3 border-b">
          <h3 className="text-sm font-semibold">Notificações</h3>
          <p className="text-xs text-muted-foreground">Alertas financeiros em tempo real</p>
        </div>
        <ScrollArea className="max-h-80">
          {grouped.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <CheckCircle2 className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">Tudo em dia!</p>
              <p className="text-xs text-muted-foreground/70">
                Sem contas atrasadas, vencimentos próximos ou orçamentos estourados.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {grouped.map((a) => (
                <li key={a.id} className="group relative">
                  <button
                    onClick={() => {
                      if (a.type === "accountant") {
                        navigate(a.href, { state: { openInvite: true, defaultRole: "contabilidade" } });
                      } else {
                        navigate(a.href);
                      }
                    }}
                    className={cn(
                      "w-full flex gap-3 items-start px-4 py-3 text-left hover:bg-muted/60 transition-colors",
                      a.type === "accountant" && "bg-emerald-50/50 dark:bg-emerald-950/20"
                    )}
                  >
                    <div className="mt-0.5">{iconFor(a.type)}</div>
                    <div className="flex-1 min-w-0 pr-6">
                      <p className="text-sm font-medium leading-tight">{a.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{a.description}</p>
                    </div>
                  </button>
                  {a.dismiss && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        a.dismiss?.();
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-foreground transition-opacity"
                      aria-label="Dispensar aviso"
                      title="Dispensar este mês"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
