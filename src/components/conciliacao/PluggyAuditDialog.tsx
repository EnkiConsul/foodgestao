import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Search, Eye, FileJson, Loader2, X } from "lucide-react";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface AuditTransaction {
  id: string;
  description: string | null;
  transaction_date: string | null;
  amount: number;
  transaction_type: "entrada" | "saida" | "transferencia";
  pluggy_transaction_id: string | null;
  pluggy_raw_snapshot: Record<string, unknown> | null;
  account_id: string | null;
  account_name: string | null;
  created_at: string;
}

interface PluggyAuditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PluggyAuditDialog({ open, onOpenChange }: PluggyAuditDialogProps) {
  const { selectedCompanyId } = useCompanyContext();
  const [rows, setRows] = useState<AuditTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedRow, setSelectedRow] = useState<AuditTransaction | null>(null);

  useEffect(() => {
    if (!open || !selectedCompanyId) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from("transactions")
      .select("id, description, transaction_date, amount, transaction_type, pluggy_transaction_id, pluggy_raw_snapshot, account_id, accounts(name), created_at")
      .eq("company_id", selectedCompanyId)
      .eq("context", "pj")
      .not("pluggy_transaction_id", "is", null)
      .order("transaction_date", { ascending: false })
      .limit(500)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          toast.error("Erro ao carregar auditoria", { description: error.message });
          setRows([]);
        } else {
          const mapped = (data ?? []).map((r: any) => ({
            id: r.id,
            description: r.description,
            transaction_date: r.transaction_date,
            amount: r.amount,
            transaction_type: r.transaction_type,
            pluggy_transaction_id: r.pluggy_transaction_id,
            pluggy_raw_snapshot: r.pluggy_raw_snapshot,
            account_id: r.account_id,
            account_name: r.accounts?.name ?? null,
            created_at: r.created_at,
          }));
          setRows(mapped);
        }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, selectedCompanyId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      (r.description ?? "").toLowerCase().includes(q) ||
      (r.pluggy_transaction_id ?? "").toLowerCase().includes(q) ||
      (r.account_name ?? "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  const formatCurrency = (amount: number, type: string) => {
    const sign = type === "saida" || type === "transferencia" ? "-" : "";
    return `${sign}R$ ${amount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <FileJson className="h-5 w-5 text-muted-foreground" />
            Auditoria Open Finance
          </DialogTitle>
          <DialogDescription>
            Visualize os dados originais retornados pela Pluggy para cada lançamento confirmado.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-3 border-y bg-muted/30">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por descrição, ID Pluggy ou conta..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col sm:flex-row">
          <ScrollArea className="flex-1 h-[50vh] sm:h-[60vh]">
            {loading ? (
              <div className="flex items-center justify-center h-40 gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando...
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm">
                <FileJson className="h-8 w-8 mb-2 opacity-40" />
                Nenhum lançamento do Open Finance encontrado.
              </div>
            ) : (
              <div className="divide-y">
                {filtered.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setSelectedRow(r)}
                    className={cn(
                      "w-full text-left px-4 py-3 hover:bg-accent transition-colors flex flex-col gap-1",
                      selectedRow?.id === r.id && "bg-accent"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm truncate flex-1">{r.description ?? "(sem descrição)"}</span>
                      <Badge variant={r.transaction_type === "entrada" ? "default" : "secondary"} className="text-xs shrink-0">
                        {r.transaction_type === "entrada" ? "Entrada" : r.transaction_type === "saida" ? "Saída" : "Transferência"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{r.transaction_date ? format(new Date(r.transaction_date), "dd/MM/yyyy") : "-"}</span>
                      <span className={cn(
                        r.transaction_type === "entrada" ? "text-emerald-600" : "text-rose-600"
                      )}>
                        {formatCurrency(r.amount, r.transaction_type)}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {r.account_name ?? "Conta não identificada"} · {r.pluggy_transaction_id}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>

          {selectedRow && (
            <div className="border-t sm:border-t-0 sm:border-l w-full sm:w-[45%] flex flex-col h-[40vh] sm:h-[60vh]">
              <div className="px-4 py-3 border-b flex items-center justify-between bg-muted/30">
                <div className="text-sm font-medium truncate pr-2">Dados originais</div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedRow(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <ScrollArea className="flex-1 p-4">
                <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-muted p-3 rounded-md">
                  {JSON.stringify(selectedRow.pluggy_raw_snapshot, null, 2)}
                </pre>
              </ScrollArea>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t flex justify-between items-center text-xs text-muted-foreground">
          <span>{filtered.length} lançamento(s) encontrado(s)</span>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
