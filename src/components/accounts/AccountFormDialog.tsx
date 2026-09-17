import { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CurrencyInput, formatCurrency, parseCurrencyToNumber } from "@/components/ui/currency-input";
import { toast } from "sonner";
import { BankSelect } from "./BankSelect";
import { accountSchema, validateWithToast } from "@/lib/validations";
import {
  assertCopyTargets,
  buildAccountRows,
  classifySaveFailure,
  describeSaveFailure,
  describeSaveResult,
  resolvePrimaryCreatedId,
  AccountTargetsError,
  type AccountCopyTarget,
} from "@/lib/accounts/accountCopyTargets";
import type { Database } from "@/integrations/supabase/types";

type AccountType = Database["public"]["Enums"]["account_type"];
type Account = Database["public"]["Tables"]["accounts"]["Row"];

const accountTypeLabels: Record<AccountType, string> = {
  corrente: "Conta Corrente",
  poupanca: "Poupança",
  investimento: "Investimento",
  cartao_credito: "Cartão de Crédito",
  dinheiro: "Dinheiro",
  emprestimo_concedido: "Empréstimo Concedido",
  emprestimo_tomado: "Empréstimo Tomado",
  outro: "Outro",
};

const BANK_TYPES: AccountType[] = ["corrente", "poupanca"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (newId?: string) => void;
  account?: Account | null;
}

/**
 * Ações explícitas e mutuamente exclusivas:
 * - "edit": atualiza SOMENTE os dados cadastrais da conta aberta;
 * - "copy": cria SOMENTE novas contas independentes em outras empresas.
 * Cada envio faz uma única mutação — nunca update + insert, nunca delete.
 */
type EditMode = "edit" | "copy";

export function AccountFormDialog({ open, onOpenChange, onSaved, account }: Props) {
  const { user } = useAuth();
  const { contextType, selectedCompanyId, companies } = useCompanyContext();
  const isEdit = !!account;

  const [mode, setMode] = useState<EditMode>("edit");
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("corrente");
  /** saldo inicial da conta PESSOAL (PF) — único campo escalar */
  const [personalBalance, setPersonalBalance] = useState("");
  const [ownerType, setOwnerType] = useState<"pf" | "pj">("pj");
  /** empresas onde a conta será CRIADA (cada uma com registro e saldo próprios) */
  const [targetCompanyIds, setTargetCompanyIds] = useState<string[]>([]);
  /**
   * Saldo inicial por empresa — usado para TODAS as contas PJ, mesmo com uma só
   * empresa selecionada. Valores permanecem guardados ao desmarcar/remarcar.
   */
  const [balanceByCompany, setBalanceByCompany] = useState<Record<string, string>>({});
  const [bankSlug, setBankSlug] = useState<string | null>(null);
  const [agency, setAgency] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [isAccounting, setIsAccounting] = useState<"contabil" | "nao_contabil">("contabil");
  const [saving, setSaving] = useState(false);
  /** trava síncrona contra envio duplicado (clique duplo / Enter repetido) */
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    submittingRef.current = false;
    setSaving(false);
    setMode("edit");
    setTargetCompanyIds([]);
    setBalanceByCompany({});
    if (account) {
      const a = account as Account & {
        bank_slug?: string | null;
        agency?: string | null;
        account_number?: string | null;
      };
      setBankSlug(a.bank_slug ?? null);
      setName(account.name);
      setAccountType(account.account_type);
      setPersonalBalance(formatCurrency(String(Math.round(account.initial_balance * 100))));
      setOwnerType(account.context as "pf" | "pj");
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
      setPersonalBalance("");
      setOwnerType(contextType);
      setTargetCompanyIds(contextType === "pj" && selectedCompanyId ? [selectedCompanyId] : []);
      setBankSlug(null);
      setAgency("");
      setAccountNumber("");
      setIsAccounting("contabil");
    }
  }, [open, account, contextType, selectedCompanyId]);

  /** empresas oferecidas: no modo cópia, exclui a empresa da própria conta */
  const selectableCompanies = useMemo(
    () => companies.filter((c) => !(isEdit && account?.company_id === c.id)),
    [companies, isEdit, account?.company_id],
  );
  const currentCompanyName = useMemo(() => {
    const c = companies.find((x) => x.id === account?.company_id);
    return c ? c.trade_name || c.name : null;
  }, [companies, account?.company_id]);

  const toggleCompany = (companyId: string, checked: boolean) => {
    // Preserva o saldo já digitado: só a seleção muda, balanceByCompany fica intacto.
    setTargetCompanyIds((prev) =>
      checked ? (prev.includes(companyId) ? prev : [...prev, companyId]) : prev.filter((id) => id !== companyId),
    );
  };

  const isCopyMode = isEdit && mode === "copy";
  const isPersonal = ownerType === "pf" && !isEdit;
  /** contas PJ sempre usam saldo por empresa */
  const usesPerCompanyBalance = !isPersonal && (!isEdit || isCopyMode);

  const companyLabel = (id: string) => {
    const c = companies.find((x) => x.id === id);
    return c?.trade_name || c?.name || "Empresa";
  };

  const buildTargets = (): AccountCopyTarget[] => {
    if (isPersonal) {
      // PF: contexto pessoal decide company_id = null, sem usar seleção de empresa.
      return [{ companyId: null, initialBalance: parseCurrencyToNumber(personalBalance) }];
    }
    return targetCompanyIds.map((companyId) => ({
      companyId,
      initialBalance: parseCurrencyToNumber(balanceByCompany[companyId] ?? "") || 0,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (submittingRef.current) return;

    const targets = isEdit && !isCopyMode ? [] : buildTargets();

    const validated = validateWithToast(
      accountSchema,
      {
        name,
        account_type: accountType,
        initial_balance: isPersonal
          ? parseCurrencyToNumber(personalBalance)
          : (targets[0]?.initialBalance ?? 0),
      },
      toast.error,
    );
    if (!validated) return;

    const showBank = BANK_TYPES.includes(accountType);
    const agencyValue = showBank ? agency.trim() || null : null;
    const accountNumberValue = showBank ? accountNumber.trim() || null : null;

    if (!(isEdit && !isCopyMode)) {
      try {
        assertCopyTargets(targets, {
          requireAtLeastOne: true,
          currentCompanyId: account?.company_id ?? null,
        });
      } catch (err) {
        if (err instanceof AccountTargetsError) return toast.error(err.message);
        throw err;
      }
    }

    submittingRef.current = true;
    setSaving(true);
    try {
      if (isEdit && !isCopyMode && account) {
        // AÇÃO 1 — somente atualizar dados cadastrais. Empresa, id, saldo e histórico intactos.
        const { data, error } = await supabase
          .from("accounts")
          .update({
            name: name.trim(),
            account_type: accountType,
            bank_slug: bankSlug,
            agency: agencyValue,
            account_number: accountNumberValue,
            is_accounting: isAccounting === "contabil",
          } as never)
          .eq("id", account.id)
          .select("id");
        if (error) {
          toast.error(describeSaveFailure(classifySaveFailure(error), "update"));
          return;
        }
        // RLS pode responder sem erro e sem nenhuma linha alterada.
        if (!data || data.length === 0) {
          toast.error(describeSaveFailure("no_rows", "update"));
          return;
        }
        await supabase.rpc("insert_audit_log", {
          _action: "account_updated",
          _entity_type: "account",
          _entity_id: account.id,
          _details: { target_name: name.trim() },
        });
        toast.success(describeSaveResult(0, true));
        onSaved();
        onOpenChange(false);
        return;
      }

      // AÇÃO 2 — somente criar contas novas, em um único lote.
      const rows = buildAccountRows(
        {
          name,
          accountType,
          bankSlug,
          agency: agencyValue,
          accountNumber: accountNumberValue,
          isAccounting: isAccounting === "contabil",
        },
        targets,
        user.id,
      );
      const { data, error } = await supabase
        .from("accounts")
        .insert(rows as never)
        .select("id, company_id");
      if (error) {
        toast.error(describeSaveFailure(classifySaveFailure(error), "insert"));
        return;
      }
      const created = (data ?? []) as Array<{ id: string; company_id: string | null }>;
      if (created.length === 0) {
        toast.error(describeSaveFailure("no_rows", "insert"));
        return;
      }

      for (const row of created) {
        await supabase.rpc("insert_audit_log", {
          _action: "account_created",
          _entity_type: "account",
          _entity_id: row.id,
          _details: { target_name: name.trim() },
        });
      }

      toast.success(describeSaveResult(created.length, false));
      // Importação só pode receber conta do contexto ativo; PF passa null pelo contexto.
      onSaved(resolvePrimaryCreatedId(created, isPersonal ? null : selectedCompanyId ?? null));
      onOpenChange(false);
    } catch (err) {
      const kind = classifySaveFailure(err);
      toast.error(
        describeSaveFailure(kind === "unknown" ? "network" : kind, isEdit && !isCopyMode ? "update" : "insert"),
      );
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  };

  const showBankFields = BANK_TYPES.includes(accountType);

  const title = !isEdit
    ? "Nova conta financeira"
    : isCopyMode
      ? "Criar em outras empresas"
      : "Editar conta financeira";

  const description = !isEdit
    ? "Cadastre a conta manualmente. Você poderá importar o extrato logo em seguida."
    : isCopyMode
      ? "Os dados preenchidos aqui valem SOMENTE para as novas contas. A conta original permanece intacta, com o mesmo saldo e histórico."
      : "Ajuste os dados cadastrais desta conta. O saldo e o histórico não são alterados aqui.";

  const submitLabel = saving ? "Salvando..." : isCopyMode ? "Criar cópias" : isEdit ? "Salvar" : "Criar conta";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Seção 1 — Identificação */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Identificação</h3>
            <div className="space-y-2">
              <Label>Banco/Outras Contas Financeiras</Label>
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
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Conta Nubank PJ, Itaú Empresas..." required maxLength={100} />
            </div>
          </section>

          {/* Seção 2 — Vínculo e tipo */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Vínculo e tipo</h3>
            {isEdit && !isCopyMode && (
              <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                <p>
                  Esta conta pertence a <strong>{currentCompanyName ?? "esta empresa"}</strong> e continua
                  com o mesmo saldo e histórico.
                </p>
                {selectableCompanies.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setMode("copy")}
                    disabled={saving}
                  >
                    Criar em outras empresas
                  </Button>
                )}
              </div>
            )}
            {isCopyMode && (
              <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3 text-xs text-muted-foreground">
                <p>
                  Você está criando contas novas. Nada será alterado na conta de{" "}
                  <strong>{currentCompanyName ?? "esta empresa"}</strong>.
                </p>
                <Button type="button" variant="ghost" size="sm" onClick={() => setMode("edit")} disabled={saving}>
                  Voltar para edição
                </Button>
              </div>
            )}
            {isPersonal && (
              <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                Esta conta será criada como <strong>Pessoal</strong>, sem vínculo com empresa.
              </div>
            )}
            {!isPersonal && (!isEdit || isCopyMode) && selectableCompanies.length > 0 && (
              <div className="space-y-2">
                <Label>{isCopyMode ? "Criar em outras empresas" : "Empresas"}</Label>
                <div className="space-y-2 rounded-md border p-3">
                  {selectableCompanies.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={targetCompanyIds.includes(c.id)}
                        onCheckedChange={(v) => toggleCompany(c.id, v === true)}
                        aria-label={c.trade_name || c.name}
                      />
                      <span>{c.trade_name || c.name}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Será criada uma conta independente em cada empresa selecionada, com saldo próprio e
                  lançamentos próprios. Nenhum lançamento e nenhuma conexão bancária é copiado.
                </p>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            {isPersonal && (
              <div className="space-y-2">
                <Label htmlFor="saldo-pessoal">Saldo inicial</Label>
                <CurrencyInput
                  id="saldo-pessoal"
                  value={personalBalance}
                  onValueChange={setPersonalBalance}
                  placeholder="0,00"
                />
                <p className="text-xs text-muted-foreground">
                  Informe o saldo atual do banco. A partir dele, o sistema calcula os movimentos.
                </p>
              </div>
            )}
            {usesPerCompanyBalance && (
              <div className="space-y-3">
                {targetCompanyIds.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Selecione as empresas para informar o saldo inicial de cada conta.
                  </p>
                )}
                {targetCompanyIds.map((id) => (
                  <div key={id} className="space-y-2">
                    <Label htmlFor={`saldo-${id}`}>Saldo inicial — {companyLabel(id)}</Label>
                    <CurrencyInput
                      id={`saldo-${id}`}
                      value={balanceByCompany[id] ?? ""}
                      onValueChange={(v) => setBalanceByCompany((prev) => ({ ...prev, [id]: v }))}
                      placeholder="0,00"
                    />
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  Cada conta tem saldo próprio. Deixe em branco para iniciar com saldo próprio zero.
                </p>
              </div>
            )}
            {isEdit && !isCopyMode && (
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
              {submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
