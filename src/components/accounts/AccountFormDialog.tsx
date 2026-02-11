import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CurrencyInput, formatCurrency, parseCurrencyToNumber } from "@/components/ui/currency-input";
import { toast } from "sonner";
import { accountSchema, validateWithToast } from "@/lib/validations";
import type { Database } from "@/integrations/supabase/types";

type AccountType = Database["public"]["Enums"]["account_type"];
type Account = Database["public"]["Tables"]["accounts"]["Row"];

const accountTypeLabels: Record<AccountType, string> = {
  corrente: "Conta Corrente",
  poupanca: "Poupança",
  investimento: "Investimento",
  cartao_credito: "Cartão de Crédito",
  dinheiro: "Dinheiro",
  outro: "Outro",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  account?: Account | null;
}

export function AccountFormDialog({ open, onOpenChange, onSaved, account }: Props) {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();
  const isEdit = !!account;

  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("corrente");
  const [initialBalance, setInitialBalance] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (account) {
        setName(account.name);
        setAccountType(account.account_type);
        setInitialBalance(formatCurrency(String(Math.round(account.initial_balance * 100))));
      } else {
        setName("");
        setAccountType("corrente");
        setInitialBalance("");
      }
    }
  }, [open, account]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const balance = parseCurrencyToNumber(initialBalance);

    const validated = validateWithToast(accountSchema, { name, account_type: accountType, initial_balance: balance }, toast.error);
    if (!validated) return;

    setSaving(true);

    if (isEdit && account) {
      const { error } = await supabase
        .from("accounts")
        .update({ name: name.trim(), account_type: accountType })
        .eq("id", account.id);
      if (error) toast.error("Erro ao atualizar conta");
      else { toast.success("Conta atualizada"); onSaved(); onOpenChange(false); }
    } else {
      const { error } = await supabase.from("accounts").insert({
        user_id: user.id,
        name: name.trim(),
        account_type: accountType,
        initial_balance: balance,
        current_balance: balance,
        context: contextType,
        company_id: contextType === "pj" ? selectedCompanyId : null,
      });
      if (error) toast.error("Erro ao criar conta");
      else { toast.success("Conta criada"); onSaved(); onOpenChange(false); }
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Conta Bancária" : "Nova Conta Bancária"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome da Conta</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Nubank, Itaú..." required maxLength={100} />
          </div>

          <div className="space-y-2">
            <Label>Tipo de Conta</Label>
            <Select value={accountType} onValueChange={(v) => setAccountType(v as AccountType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(accountTypeLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!isEdit && (
            <div className="space-y-2">
              <Label>Saldo Inicial</Label>
              <CurrencyInput value={initialBalance} onValueChange={setInitialBalance} placeholder="0,00" />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? "Salvando..." : isEdit ? "Salvar" : "Criar Conta"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
