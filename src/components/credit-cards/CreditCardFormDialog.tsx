import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CurrencyInput, parseCurrencyToNumber, formatCurrency } from "@/components/ui/currency-input";

const numToInput = (n: number) => formatCurrency(String(Math.round(n * 100)));
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type CreditCard = Database["public"]["Tables"]["credit_cards"]["Row"];
type Account = Database["public"]["Tables"]["accounts"]["Row"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  card?: CreditCard | null;
}

const BRANDS = ["Visa", "Mastercard", "Elo", "American Express", "Hipercard", "Diners", "Outro"];

export function CreditCardFormDialog({ open, onOpenChange, onSaved, card }: Props) {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();
  const isEdit = !!card;

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [holderName, setHolderName] = useState("");
  const [last4, setLast4] = useState("");
  const [brand, setBrand] = useState<string>("Visa");
  const [issuer, setIssuer] = useState("");
  const [accountId, setAccountId] = useState<string>("");
  const [paymentAccountId, setPaymentAccountId] = useState<string>("");
  const [creditLimit, setCreditLimit] = useState("");
  const [closingDay, setClosingDay] = useState<number>(1);
  const [dueDay, setDueDay] = useState<number>(10);
  const [minPct, setMinPct] = useState<number>(15);
  const [interest, setInterest] = useState<number>(12);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    (async () => {
      const { data } = await supabase.rpc("get_accessible_accounts", {
        _context: contextType,
        _company_id: contextType === "pj" ? selectedCompanyId! : undefined,
        _include_inactive: false,
      });
      setAccounts((data ?? []) as any);
    })();
  }, [open, user, contextType, selectedCompanyId]);

  useEffect(() => {
    if (!open) return;
    if (card) {
      setHolderName(card.holder_name ?? "");
      setLast4(card.last4 ?? "");
      setBrand(card.brand ?? "Visa");
      setIssuer(card.issuer ?? "");
      setAccountId(card.account_id);
      setPaymentAccountId(card.default_payment_account_id ?? "");
      setCreditLimit(formatCurrency(Number(card.credit_limit)));
      setClosingDay(card.closing_day);
      setDueDay(card.due_day);
      setMinPct(Number(card.minimum_payment_percent));
      setInterest(Number(card.interest_rate_monthly));
    } else {
      setHolderName(""); setLast4(""); setBrand("Visa"); setIssuer("");
      setAccountId(""); setPaymentAccountId(""); setCreditLimit("");
      setClosingDay(1); setDueDay(10); setMinPct(15); setInterest(12);
    }
  }, [open, card]);

  const cardAccounts = accounts.filter((a) => a.account_type === "cartao_credito");
  const bankAccounts = accounts.filter((a) => a.account_type !== "cartao_credito");

  const handleSave = async () => {
    if (!user) return;
    if (!accountId) return toast.error("Selecione a conta 'Cartão de Crédito' vinculada");
    if (closingDay < 1 || closingDay > 28) return toast.error("Dia de fechamento deve ser entre 1 e 28");
    if (dueDay < 1 || dueDay > 28) return toast.error("Dia de vencimento deve ser entre 1 e 28");
    if (last4 && !/^\d{4}$/.test(last4)) return toast.error("Últimos 4 dígitos devem ter 4 números");

    setSaving(true);
    const payload = {
      user_id: user.id,
      context: contextType,
      company_id: contextType === "pj" ? selectedCompanyId : null,
      account_id: accountId,
      default_payment_account_id: paymentAccountId || null,
      holder_name: holderName || null,
      last4: last4 || null,
      brand,
      issuer: issuer || null,
      credit_limit: parseCurrencyToNumber(creditLimit) || 0,
      closing_day: closingDay,
      due_day: dueDay,
      minimum_payment_percent: minPct,
      interest_rate_monthly: interest,
    };

    const { error } = isEdit
      ? await supabase.from("credit_cards").update(payload).eq("id", card!.id)
      : await supabase.from("credit_cards").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(isEdit ? "Cartão atualizado" : "Cartão criado");
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar cartão" : "Novo cartão de crédito"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Conta 'Cartão de Crédito' vinculada *</Label>
            <Select value={accountId} onValueChange={setAccountId} disabled={isEdit}>
              <SelectTrigger><SelectValue placeholder="Selecione uma conta" /></SelectTrigger>
              <SelectContent>
                {cardAccounts.length === 0 && (
                  <div className="px-2 py-4 text-xs text-muted-foreground">
                    Cadastre uma conta do tipo 'Cartão de Crédito' em Contas Bancárias.
                  </div>
                )}
                {cardAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Bandeira</Label>
              <Select value={brand} onValueChange={setBrand}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BRANDS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Emissor</Label>
              <Input value={issuer} onChange={(e) => setIssuer(e.target.value)} placeholder="Ex.: Nubank" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Titular</Label>
              <Input value={holderName} onChange={(e) => setHolderName(e.target.value)} />
            </div>
            <div>
              <Label>Últimos 4 dígitos</Label>
              <Input value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Fechamento (dia)</Label>
              <Input type="number" min={1} max={28} value={closingDay} onChange={(e) => setClosingDay(Number(e.target.value))} />
            </div>
            <div>
              <Label>Vencimento (dia)</Label>
              <Input type="number" min={1} max={28} value={dueDay} onChange={(e) => setDueDay(Number(e.target.value))} />
            </div>
            <div>
              <Label>Limite</Label>
              <CurrencyInput value={creditLimit} onChange={setCreditLimit} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>% Mínimo da fatura</Label>
              <Input type="number" step="0.01" min={0} max={100} value={minPct} onChange={(e) => setMinPct(Number(e.target.value))} />
            </div>
            <div>
              <Label>Juros rotativo (% a.m.)</Label>
              <Input type="number" step="0.01" min={0} value={interest} onChange={(e) => setInterest(Number(e.target.value))} />
            </div>
          </div>

          <div>
            <Label>Conta padrão de pagamento</Label>
            <Select value={paymentAccountId} onValueChange={setPaymentAccountId}>
              <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
              <SelectContent>
                {bankAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
