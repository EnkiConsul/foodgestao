import { useNavigate } from "react-router-dom";
import { CreditCard, AlertCircle, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePrivacy } from "@/hooks/usePrivacy";
import { useUpcomingCardInvoices } from "@/hooks/useUpcomingCardInvoices";

const STATUS_STYLES: Record<string, string> = {
  aberta: "bg-primary/10 text-primary",
  fechada: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  parcial: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  vencida: "bg-destructive/15 text-destructive",
  atrasada: "bg-destructive/15 text-destructive",
};
const STATUS_LABEL: Record<string, string> = {
  aberta: "Aberta",
  fechada: "Fechada",
  parcial: "Parcial",
  vencida: "Vencida",
  atrasada: "Atrasada",
};

export function UpcomingCardInvoicesWidget({ className }: { className?: string }) {
  const { data = [], isLoading } = useUpcomingCardInvoices(5);
  const { maskBRL } = usePrivacy();
  const navigate = useNavigate();

  const total = data.reduce((s, r) => s + r.remaining, 0);

  return (
    <div className={cn("p-6 rounded-3xl bg-card border border-border/60 shadow-sm", className)}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <CreditCard className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">Faturas a vencer</h2>
            <p className="text-xs text-muted-foreground">Cartões de crédito</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => navigate("/cartoes-credito")}>
          Ver todos <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : data.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
          <CreditCard className="h-8 w-8 mb-2 opacity-40" />
          <p className="text-sm">Nenhuma fatura pendente</p>
        </div>
      ) : (
        <>
          <div className="mt-3 mb-4">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total a pagar</p>
            <p className="font-display text-2xl font-bold tracking-tight">{maskBRL(total)}</p>
          </div>
          <div className="space-y-2">
            {data.map(({ invoice, card, remaining, daysUntilDue }) => {
              const overdue = daysUntilDue < 0;
              const soon = daysUntilDue >= 0 && daysUntilDue <= 5;
              const label = overdue
                ? `${Math.abs(daysUntilDue)}d em atraso`
                : daysUntilDue === 0
                ? "Vence hoje"
                : `Em ${daysUntilDue}d`;
              return (
                <button
                  key={invoice.id}
                  onClick={() => navigate("/cartoes-credito")}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border/40 hover:border-primary/30 hover:bg-muted/60 transition-all text-left"
                >
                  <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-primary-foreground shrink-0">
                    <CreditCard className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold truncate">
                        {card.brand ?? "Cartão"} •••• {card.last4 ?? "----"}
                      </span>
                      <Badge className={cn("h-4 text-[10px] px-1.5 border-0", STATUS_STYLES[invoice.status] ?? "")}>
                        {STATUS_LABEL[invoice.status] ?? invoice.status}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Vence {new Date(invoice.due_date + "T00:00:00").toLocaleDateString("pt-BR")}
                      <span className={cn("ml-1.5 inline-flex items-center gap-1", overdue ? "text-destructive font-medium" : soon ? "text-amber-600 dark:text-amber-400" : "")}>
                        {overdue && <AlertCircle className="h-3 w-3" />} {label}
                      </span>
                    </p>
                  </div>
                  <span className={cn("font-display text-sm font-bold tracking-tight shrink-0", overdue ? "text-destructive" : "text-foreground")}>
                    {maskBRL(remaining)}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
