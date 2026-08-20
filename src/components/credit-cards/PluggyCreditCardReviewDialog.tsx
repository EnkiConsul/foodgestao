import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CurrencyInput, parseCurrencyToNumber, formatCurrency } from "@/components/ui/currency-input";
import { toast } from "sonner";
import { CreditCard } from "lucide-react";
import { buildCreditCardSuggestion } from "@/lib/pluggy/creditCardSuggestion";
import type { PluggyCreditReviewRow } from "@/hooks/usePluggyCreditReview";
import type { Database } from "@/integrations/supabase/types";

type CreditCardRow = Database["public"]["Tables"]["credit_cards"]["Row"];

const BRANDS = ["Visa", "Mastercard", "Elo", "American Express", "Hipercard", "Diners", "Outro"];
const NEW_CARD = "__new__";

const numToInput = (n: number) => formatCurrency(String(Math.round(n * 100)));

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Contas de crédito pendentes de autorização (revisadas uma a uma). */
  accounts: PluggyCreditReviewRow[];
  onDone: () => void;
}

export function PluggyCreditCardReviewDialog({ open, onOpenChange, accounts, onDone }: Props) {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();

  const [index, setIndex] = useState(0);
  const [existingCards, setExistingCards] = useState<CreditCardRow[]>([]);
  const [paymentAccounts, setPaymentAccounts] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);

  const [target, setTarget] = useState<string>(NEW_CARD);
  const [brand, setBrand] = useState("Outro");
  const [issuer, setIssuer] = useState("");
  const [holderName, setHolderName] = useState("");
  const [last4, setLast4] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [closingDay, setClosingDay] = useState(1);
  const [dueDay, setDueDay] = useState(10);
  const [paymentAccountId, setPaymentAccountId] = useState("");

  const account = accounts[index] ?? null;
  const suggestion = useMemo(() => (account ? buildCreditCardSuggestion(account) : null), [account]);

  useEffect(() => { if (open) setIndex(0); }, [open]);

  useEffect(() => {
    if (!open || !selectedCompanyId) return;
    (async () => {
      const [{ data: cards }, { data: accs }] = await Promise.all([
        supabase.from("credit_cards").select("*").eq("context", "pj").eq("company_id", selectedCompanyId),
        supabase.rpc("get_accessible_accounts", {
          _context: "pj", _company_id: selectedCompanyId, _include_inactive: false,
        }),
      ]);
      setExistingCards((cards ?? []) as CreditCardRow[]);
      setPaymentAccounts(((accs ?? []) as { id: string; name: string; account_type?: string }[])
        .filter((a) => a.account_type !== "cartao_credito")
        .map((a) => ({ id: a.id, name: a.name })));
    })();
  }, [open, selectedCompanyId]);

  // Pré-preenche o formulário com a sugestão do Open Finance.
  useEffect(() => {
    if (!suggestion) return;
    setTarget(NEW_CARD);
    setBrand(suggestion.brand);
    setIssuer(suggestion.issuer ?? "");
    setHolderName(suggestion.holderName ?? "");
    setLast4(suggestion.last4 ?? "");
    setCreditLimit(suggestion.creditLimit > 0 ? numToInput(suggestion.creditLimit) : "");
    setClosingDay(suggestion.closingDay);
    setDueDay(suggestion.dueDay);
    setPaymentAccountId("");
  }, [suggestion]);

  const advance = () => {
    if (index + 1 < accounts.length) {
      setIndex((i) => i + 1);
    } else {
      onDone();
      onOpenChange(false);
    }
  };

  const markReviewed = async (status: "approved" | "ignored", creditCardId: string | null) => {
    if (!account) return;
    const { error } = await supabase
      .from("pluggy_accounts")
      .update({
        credit_review_status: status,
        credit_review_at: new Date().toISOString(),
        credit_review_by: user?.id ?? null,
        linked_credit_card_id: creditCardId,
      })
      .eq("id", account.id);
    if (error) throw new Error(error.message);
  };

  const handleIgnore = async () => {
    setSaving(true);
    try {
      await markReviewed("ignored", null);
      toast.success("Cartão ignorado — não será cadastrado");
      advance();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async () => {
    if (!user || !account) return;
    if (contextType !== "pj" || !selectedCompanyId) {
      toast.error("Selecione a empresa antes de autorizar o cartão");
      return;
    }
    if (closingDay < 1 || closingDay > 28) return toast.error("Dia de fechamento deve ser entre 1 e 28");
    if (dueDay < 1 || dueDay > 28) return toast.error("Dia de vencimento deve ser entre 1 e 28");
    if (last4 && !/^\d{4}$/.test(last4)) return toast.error("Últimos 4 dígitos devem ter 4 números");

    setSaving(true);
    try {
      let cardId = target;
      if (target === NEW_CARD) {
        const { data, error } = await supabase
          .from("credit_cards")
          .insert({
            user_id: user.id,
            context: "pj",
            company_id: selectedCompanyId,
            brand,
            issuer: issuer || null,
            holder_name: holderName || null,
            last4: last4 || null,
            credit_limit: parseCurrencyToNumber(creditLimit) || 0,
            closing_day: closingDay,
            due_day: dueDay,
            default_payment_account_id: paymentAccountId || null,
          })
          .select("id")
          .single();
        if (error || !data) throw new Error(error?.message ?? "Falha ao criar o cartão");
        cardId = (data as { id: string }).id;
      }
      await markReviewed("approved", cardId);
      toast.success(target === NEW_CARD ? "Cartão criado e vinculado ao Open Finance" : "Conta vinculada ao cartão existente");
      advance();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!account || !suggestion) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" />
            Autorizar cartão do Open Finance
          </DialogTitle>
          <DialogDescription>
            Encontramos este cartão no banco conectado. Confira os dados antes de cadastrar — nada é criado sem sua autorização.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">{suggestion.name}</p>
              {accounts.length > 1 && (
                <Badge variant="outline" className="text-[10px]">{index + 1} de {accounts.length}</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Conta do banco: {account.number_masked ?? "—"}
            </p>
          </div>

          <div>
            <Label>Destino</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NEW_CARD}>Criar novo cartão</SelectItem>
                {existingCards.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    Vincular a {c.brand ?? "Cartão"} •••• {c.last4 ?? "----"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {target === NEW_CARD && (
            <>
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
                  <Input value={issuer} onChange={(e) => setIssuer(e.target.value)} />
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
                  <CurrencyInput value={creditLimit} onValueChange={setCreditLimit} />
                </div>
              </div>

              <div>
                <Label>Conta padrão de pagamento</Label>
                <Select value={paymentAccountId} onValueChange={setPaymentAccountId}>
                  <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                  <SelectContent>
                    {paymentAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={handleIgnore} disabled={saving}>
            Ignorar este cartão
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Depois</Button>
            <Button onClick={handleConfirm} disabled={saving}>
              {saving ? "Salvando..." : target === NEW_CARD ? "Autorizar e cadastrar" : "Autorizar e vincular"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
