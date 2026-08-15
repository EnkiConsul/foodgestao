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
  const [ownerType, setOwnerType] = useState<"pf" | "pj">("pf");
  const [ownerCompanyId, setOwnerCompanyId] = useState<string | null>(null);
  const [bankSlug, setBankSlug] = useState<string | null>(null);
  const [agency, setAgency] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [isAccounting, setIsAccounting] = useState<"contabil" | "nao_contabil">("contabil");
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
      setOwnerType(account.context as "pf" | "pj");
      setOwnerCompanyId(account.company_id);
      setAgency(a.agency ?? "");
      setAccountNumber(a.account_number ?? "");
      setIsAccounting(
        (account as Account & { is_accounting?: boolean }).is_accounting === false
          ? "nao_contabil"
          : "contabil",
      );
    } else {
      setName("");
      setAccountType("corrente");
      setInitialBalance("");
      setOwnerType(contextType);
      setOwnerCompanyId(contextType === "pj" ? selectedCompanyId : null);
      setBankSlug(null);
      setAgency("");
      setAccountNumber("");
      setIsAccounting("contabil");
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
      const { error } = await supabase
        .from("accounts")
        .update({
          name: name.trim(),
          account_type: accountType,
          context: ownerType,
          company_id: ownerType === "pj" ? ownerCompanyId : null,
          bank_slug: bankSlug,
          agency: agencyValue,
          account_number: accountNumberValue,
          is_accounting: isAccounting === "contabil",
        } as never)
        .eq("id", account.id);
      if (error) toast.error("Erro ao atualizar conta");
      else {
        await supabase.rpc("insert_audit_log", {
          _action: "account_updated",
          _entity_type: "account",
          _entity_id: account.id,
          _details: { target_name: name.trim() },
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
          is_accounting: isAccounting === "contabil",
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



  // Bloco 3 — formulário manual seccionado (também usado no modo edição).
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar conta financeira" : "Nova conta financeira"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Ajuste os dados da conta. Alterações de saldo devem ser feitas apenas para acertos manuais."
              : "Cadastre a conta manualmente. Você poderá importar o extrato logo em seguida."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Seção 1 — Identificação */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Identificação</h3>
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
              <Label htmlFor="name">Nome da conta</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Nubank PJ, Itaú Pessoal..." required maxLength={100} />
            </div>
          </section>

          {/* Seção 2 — Vínculo e tipo */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Vínculo e tipo</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Vinculado a</Label>
                <Select
                  value={ownerType === "pf" ? "pf" : (ownerCompanyId ?? "")}
                  onValueChange={(v) => {
                    if (v === "pf") { setOwnerType("pf"); setOwnerCompanyId(null); }
                    else { setOwnerType("pj"); setOwnerCompanyId(v); }
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
                <Label>Tipo de conta</Label>
                <Select value={accountType} onValueChange={(v) => setAccountType(v as AccountType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(accountTypeLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Natureza Contábil</Label>
              <Select
                value={isAccounting}
                onValueChange={(v) => setIsAccounting(v as "contabil" | "nao_contabil")}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="contabil">Contábil</SelectItem>
                  <SelectItem value="nao_contabil">Não Contábil</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Contas contábeis são as que a contabilidade acompanha. Contas não contábeis (caixa
                interno, empréstimos entre sócios) ficam visíveis só para você e sua equipe.
              </p>
            </div>
          </section>

          {/* Seção 3 — Dados bancários (opcional) */}
          {showBankFields && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Dados bancários <span className="font-normal text-muted-foreground">(opcional)</span></h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="agency">Agência</Label>
                  <Input id="agency" value={agency} onChange={(e) => setAgency(e.target.value)} placeholder="0001" maxLength={20} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="account_number">Conta</Label>
                  <Input id="account_number" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="12345-6" maxLength={30} />
                </div>
              </div>
            </section>
          )}

          {/* Seção 4 — Saldo */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Saldo</h3>
            {!isEdit ? (
              <div className="space-y-2">
                <Label>Saldo inicial</Label>
                <CurrencyInput value={initialBalance} onValueChange={setInitialBalance} placeholder="0,00" />
                <p className="text-xs text-muted-foreground">
                  Informe o saldo atual do banco. A partir dele, o sistema calcula os movimentos.
                </p>
              </div>
            ) : (
              <div className="rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
                O saldo desta conta é controlado automaticamente pelo motor financeiro a partir dos lançamentos.
                Para acertar uma divergência, use <strong>Ajustar saldo</strong> na página de contas — o ajuste
                gera um lançamento auditável com justificativa.
              </div>
            )}
          </section>


          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-11 sm:h-10">Cancelar</Button>
            <Button type="submit" disabled={saving || !name.trim()} className="h-11 sm:h-10">
              {saving ? "Salvando..." : isEdit ? "Salvar" : "Criar conta"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
