import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CurrencyInput, parseCurrencyToNumber, formatCurrency } from "@/components/ui/currency-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Invoice = Database["public"]["Tables"]["credit_card_invoices"]["Row"];
type Account = Database["public"]["Tables"]["accounts"]["Row"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPaid: () => void;
  invoice: Invoice | null;
  defaultPaymentAccountId?: string | null;
}

const brl = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

export function PayInvoiceDialog({ open, onOpenChange, onPaid, invoice, defaultPaymentAccountId }: Props) {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const outstanding = invoice ? Number(invoice.total_amount) - Number(invoice.paid_amount) : 0;

  useEffect(() => {
    if (!open || !user) return;
    (async () => {
      const { data } = await supabase.rpc("get_accessible_accounts", {
        _context: contextType,
        _company_id: contextType === "pj" ? selectedCompanyId! : undefined,
        _include_inactive: false,
      });
      const list = ((data ?? []) as any[]).filter((a) => a.account_type !== "cartao_credito");
      setAccounts(list);
      setAccountId(defaultPaymentAccountId ?? list[0]?.id ?? "");
    })();
  }, [open, user, contextType, selectedCompanyId, defaultPaymentAccountId]);

  useEffect(() => {
    if (!open || !invoice) return;
    setAmount(formatCurrency(outstanding));
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setNotes("");
  }, [open, invoice, outstanding]);

  const setPreset = (kind: "full" | "min") => {
    if (!invoice) return;
    setAmount(formatCurrency(kind === "full" ? outstanding : Number(invoice.minimum_amount)));
  };

  const handlePay = async () => {
    if (!invoice) return;
    if (!accountId) return toast.error("Selecione a conta de pagamento");
    const value = parseCurrencyToNumber(amount);
    if (!value || value <= 0) return toast.error("Informe um valor válido");
    if (value > outstanding + 0.005) return toast.error("Valor maior que o saldo da fatura");
    setSaving(true);
    const { data, error } = await supabase.rpc("pay_credit_card_invoice", {
      _invoice_id: invoice.id,
      _amount: value,
      _payment_account_id: accountId,
      _payment_date: paymentDate,
      _notes: notes || undefined,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    const res = (data ?? {}) as { status?: string; remainder?: number; interest_charged?: number };
    if (res.status === "parcial") {
      toast.success(`Pagamento parcial. Rotativo: ${brl(res.remainder ?? 0)} + juros ${brl(res.interest_charged ?? 0)}`);
    } else {
      toast.success("Fatura paga");
    }
    onPaid();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pagar fatura</DialogTitle>
          {invoice && (
            <DialogDescription>
              Ref. {invoice.reference_month.slice(0, 7)} · Vence em {new Date(invoice.due_date + "T00:00:00").toLocaleDateString("pt-BR")}
            </DialogDescription>
          )}
        </DialogHeader>

        {invoice && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-md bg-muted/40 p-3">
                <p className="text-[10px] uppercase text-muted-foreground">Saldo a pagar</p>
                <p className="font-bold text-foreground">{brl(outstanding)}</p>
              </div>
              <div className="rounded-md bg-muted/40 p-3">
                <p className="text-[10px] uppercase text-muted-foreground">Mínimo</p>
                <p className="font-bold text-foreground">{brl(Number(invoice.minimum_amount))}</p>
              </div>
            </div>

            <div>
              <Label>Conta de pagamento</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label>Valor</Label>
                <div className="flex gap-2 text-xs">
                  <button type="button" className="text-primary hover:underline" onClick={() => setPreset("full")}>Total</button>
                  <button type="button" className="text-primary hover:underline" onClick={() => setPreset("min")}>Mínimo</button>
                </div>
              </div>
              <CurrencyInput value={amount} onChange={setAmount} />
            </div>

            <div>
              <Label>Data do pagamento</Label>
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </div>

            <div>
              <Label>Observações</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200} />
            </div>

            {parseCurrencyToNumber(amount) < outstanding && parseCurrencyToNumber(amount) > 0 && (
              <Alert>
                <AlertDescription className="text-xs">
                  Pagamento parcial: o saldo remanescente rola para a próxima fatura com juros de rotativo.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handlePay} disabled={saving}>{saving ? "Processando..." : "Confirmar pagamento"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
