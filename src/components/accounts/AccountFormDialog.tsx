import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CurrencyInput, formatCurrency, parseCurrencyToNumber } from "@/components/ui/currency-input";
import { toast } from "sonner";
import { BankSelect } from "./BankSelect";
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

const BANK_TYPES: AccountType[] = ["corrente", "poupanca"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (newId?: string) => void;
  account?: Account | null;
}

export function AccountFormDialog({ open, onOpenChange, onSaved, account }: Props) {
  const { user } = useAuth();
  const { contextType, selectedCompanyId, companies } = useCompanyContext();
  const isEdit = !!account;



  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("corrente");
  const [initialBalance, setInitialBalance] = useState("");
  const [currentBalance, setCurrentBalance] = useState("");
  const [originalCurrentBalance, setOriginalCurrentBalance] = useState<number>(0);
  const [ownerType, setOwnerType] = useState<"pf" | "pj">("pf");
  const [ownerCompanyId, setOwnerCompanyId] = useState<string | null>(null);
  const [bankSlug, setBankSlug] = useState<string | null>(null);
  const [agency, setAgency] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (account) {
      const a = account as Account & {
        bank_slug?: string | null;
        agency?: string | null;
        account_number?: string | null;
      };
      setBankSlug(a.bank_slug ?? null);
      setName(account.name);
      setAccountType(account.account_type);
      setInitialBalance(formatCurrency(String(Math.round(account.initial_balance * 100))));
      setCurrentBalance(formatCurrency(String(Math.round(account.current_balance * 100))));
      setOriginalCurrentBalance(Number(account.current_balance));
      setOwnerType(account.context as "pf" | "pj");
      setOwnerCompanyId(account.company_id);
      setAgency(a.agency ?? "");
      setAccountNumber(a.account_number ?? "");
    } else {
      setName("");
      setAccountType("corrente");
      setInitialBalance("");
      setCurrentBalance("");
      setOriginalCurrentBalance(0);
      setOwnerType(contextType);
      setOwnerCompanyId(contextType === "pj" ? selectedCompanyId : null);
      setBankSlug(null);
      setAgency("");
      setAccountNumber("");
    }
  }, [open, account, contextType, selectedCompanyId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const balance = parseCurrencyToNumber(initialBalance);

    const validated = validateWithToast(
      accountSchema,
      { name, account_type: accountType, initial_balance: balance },
      toast.error,
    );
    if (!validated) return;

    setSaving(true);
    const showBankFields = BANK_TYPES.includes(accountType);
    const agencyValue = showBankFields ? agency.trim() || null : null;
    const accountNumberValue = showBankFields ? accountNumber.trim() || null : null;

    if (isEdit && account) {
      const newCurrent = parseCurrencyToNumber(currentBalance);
      const balanceAdjusted = Math.abs(newCurrent - originalCurrentBalance) > 0.005;
      const { error } = await supabase
        .from("accounts")
        .update({
          name: name.trim(),
          account_type: accountType,
          initial_balance: balance,
          current_balance: newCurrent,
          context: ownerType,
          company_id: ownerType === "pj" ? ownerCompanyId : null,
          bank_slug: bankSlug,
          agency: agencyValue,
          account_number: accountNumberValue,
        } as never)
        .eq("id", account.id);
      if (error) toast.error("Erro ao atualizar conta");
      else {
        await supabase.rpc("insert_audit_log", {
          _action: "account_updated",
          _entity_type: "account",
          _entity_id: account.id,
          _details: { target_name: name.trim(), balance_adjusted: balanceAdjusted },
        });
        toast.success("Conta atualizada");
        onSaved();
        onOpenChange(false);
      }
    } else {
      const { data: inserted, error } = await supabase
        .from("accounts")
        .insert({
          user_id: user.id,
          name: name.trim(),
          account_type: accountType,
          initial_balance: balance,
          current_balance: balance,
          context: ownerType,
          company_id: ownerType === "pj" ? ownerCompanyId : null,
          bank_slug: bankSlug,
          agency: agencyValue,
          account_number: accountNumberValue,
        } as never)
        .select("id")
        .single();
      if (error || !inserted) toast.error("Erro ao criar conta");
      else {
        await supabase.rpc("insert_audit_log", {
          _action: "account_created",
          _entity_type: "account",
          _entity_id: inserted.id,
          _details: { target_name: name.trim() },
        });
        toast.success("Conta criada");
        onSaved(inserted.id);
        onOpenChange(false);
      }
    }
    setSaving(false);
  };

  const showBankFields = BANK_TYPES.includes(accountType);



  // Etapa 2B — formulário manual (também usado no modo edição).
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Conta Bancária" : "Nova Conta Bancária"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Banco</Label>
            <BankSelect
              value={bankSlug}
              onChange={(slug, bankName) => {
                setBankSlug(slug);
                if (slug && bankName && !name.trim()) setName(bankName);
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Nome da Conta</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Nubank, Itaú..." required maxLength={100} />
          </div>

          <div className="space-y-2">
            <Label>Vinculado a</Label>
            <Select
              value={ownerType === "pf" ? "pf" : (ownerCompanyId ?? "")}
              onValueChange={(v) => {
                if (v === "pf") {
                  setOwnerType("pf");
                  setOwnerCompanyId(null);
                } else {
                  setOwnerType("pj");
                  setOwnerCompanyId(v);
                }
              }}
            >
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pf">Pessoa Física (Pessoal)</SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.trade_name || c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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

          {showBankFields && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="agency">Agência</Label>
                <Input
                  id="agency"
                  value={agency}
                  onChange={(e) => setAgency(e.target.value)}
                  placeholder="0001"
                  maxLength={20}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="account_number">Conta</Label>
                <Input
                  id="account_number"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="12345-6"
                  maxLength={30}
                />
              </div>
            </div>
          )}

          {!isEdit ? (
            <div className="space-y-2">
              <Label>Saldo Inicial</Label>
              <CurrencyInput value={initialBalance} onValueChange={setInitialBalance} placeholder="0,00" />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Saldo Inicial</Label>
                  <CurrencyInput value={initialBalance} onValueChange={setInitialBalance} placeholder="0,00" />
                </div>
                <div className="space-y-2">
                  <Label>Saldo Atual</Label>
                  <CurrencyInput value={currentBalance} onValueChange={setCurrentBalance} placeholder="0,00" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                O saldo atual normalmente é calculado pelos lançamentos. Altere apenas para ajustes manuais.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            {!isEdit && contextType === "pj" && (
              <Button type="button" variant="ghost" onClick={() => setStep("choose")}>
                Voltar
              </Button>
            )}
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
