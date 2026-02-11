import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CurrencyInput, parseCurrencyToNumber } from "@/components/ui/currency-input";
import { toast } from "sonner";
import { Calendar } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bill: {
    id: string;
    description: string;
    amount: number;
    amount_paid: number;
    bill_type: "receita" | "despesa";
    account_id: string | null;
    category_id: string | null;
    contact_id: string | null;
  } | null;
  onPaid: () => void;
}

export function PaymentDialog({ open, onOpenChange, bill, onPaid }: Props) {
  const { user } = useAuth();
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [paymentMethods, setPaymentMethods] = useState<Tables<"payment_methods">[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user || !open) return;
    supabase.from("payment_methods").select("*").eq("user_id", user.id).eq("is_active", true)
      .then(({ data }) => setPaymentMethods(data ?? []));
  }, [user, open]);

  if (!bill) return null;

  const remaining = bill.amount - bill.amount_paid;

  const formatBRL = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseCurrencyToNumber(paymentAmount);
    if (numAmount <= 0) return toast.error("Informe o valor do pagamento");
    if (numAmount > remaining + 0.01) return toast.error("Valor excede o saldo restante");

    setSaving(true);
    const newPaid = bill.amount_paid + numAmount;
    const isPaidFull = newPaid >= bill.amount - 0.01;

    const { error } = await supabase
      .from("bills")
      .update({
        amount_paid: newPaid,
        payment_date: paymentDate,
        status: isPaidFull ? "pago" : "parcial",
      })
      .eq("id", bill.id);

    if (error) {
      toast.error("Erro ao registrar pagamento", { description: error.message });
    } else {
      // Criar lançamento automático
      if (user && bill.account_id) {
        // Criar lançamento automático
        const { error: txError } = await supabase.from("transactions").insert({
          user_id: user.id,
          description: `Pgto: ${bill.description}`,
          amount: numAmount,
          transaction_type: bill.bill_type,
          transaction_date: paymentDate,
          account_id: bill.account_id,
          category_id: bill.category_id,
          contact_id: bill.contact_id,
          payment_method_id: paymentMethodId || null,
          status: "confirmado",
        });
        if (txError) {
          toast.warning("Pagamento registrado, mas não foi possível criar o lançamento automático", { description: txError.message });
        }

        // Atualizar saldo da conta bancária
        const { data: account } = await supabase
          .from("accounts")
          .select("current_balance")
          .eq("id", bill.account_id)
          .single();

        if (account) {
          const balanceChange = bill.bill_type === "receita" ? numAmount : -numAmount;
          await supabase
            .from("accounts")
            .update({ current_balance: account.current_balance + balanceChange })
            .eq("id", bill.account_id);
        }
      }

      toast.success(isPaidFull ? "Conta paga integralmente!" : "Pagamento parcial registrado!");
      setPaymentAmount("");
      setPaymentMethodId("");
      onOpenChange(false);
      onPaid();
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Registrar Pagamento</DialogTitle>
          <DialogDescription>{bill.description}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-muted-foreground">Total</span>
            <p className="font-semibold">{formatBRL(bill.amount)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Restante</span>
            <p className="font-semibold text-destructive">{formatBRL(remaining)}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Valor do pagamento</Label>
            <CurrencyInput value={paymentAmount} onValueChange={setPaymentAmount} placeholder="0,00" />
          </div>

          <div className="space-y-2">
            <Label>Data do pagamento</Label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="pl-10" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Forma de pagamento (opcional)</Label>
            <Select value={paymentMethodId} onValueChange={setPaymentMethodId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {paymentMethods.map((pm) => (
                  <SelectItem key={pm.id} value={pm.id}>{pm.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => {
                const formatted = remaining.toFixed(2).replace(".", ",");
                setPaymentAmount(formatted);
              }}
            >
              Pagar total ({formatBRL(remaining)})
            </Button>
          </div>

          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? "Salvando..." : "Confirmar Pagamento"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
