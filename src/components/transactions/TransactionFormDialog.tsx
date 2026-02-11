import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CurrencyInput, parseCurrencyToNumber } from "@/components/ui/currency-input";
import { toast } from "sonner";
import { transactionSchema, validateWithToast } from "@/lib/validations";
import { Calendar } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type TransactionType = "receita" | "despesa" | "transferencia";

interface EditableTransaction {
  id: string;
  description: string;
  amount: number;
  transaction_type: TransactionType;
  transaction_date: string;
  account_id: string;
  destination_account_id?: string | null;
  category_id?: string | null;
  notes?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  transaction?: EditableTransaction | null;
}

export function TransactionFormDialog({ open, onOpenChange, onCreated, transaction }: Props) {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();
  const [type, setType] = useState<TransactionType>("despesa");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [accountId, setAccountId] = useState("");
  const [destinationAccountId, setDestinationAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const [accounts, setAccounts] = useState<Tables<"accounts">[]>([]);
  const [categories, setCategories] = useState<Tables<"categories">[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<Tables<"payment_methods">[]>([]);
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [categoryCompanyIds, setCategoryCompanyIds] = useState<Map<string, string[]>>(new Map());

  useEffect(() => {
    if (!user || !open) return;
    const loadData = async () => {
      const [accRes, catRes, pmRes, ccRes] = await Promise.all([
        supabase.from("accounts").select("*").eq("user_id", user.id).eq("is_active", true),
        supabase.from("categories").select("*").eq("user_id", user.id),
        supabase.from("payment_methods").select("*").eq("user_id", user.id).eq("is_active", true),
        supabase.from("category_companies").select("category_id, company_id"),
      ]);
      setAccounts(accRes.data ?? []);
      setCategories(catRes.data ?? []);
      setPaymentMethods(pmRes.data ?? []);
      if (accRes.data?.[0] && !accountId) setAccountId(accRes.data[0].id);

      const map = new Map<string, string[]>();
      (ccRes.data ?? []).forEach((cc) => {
        const list = map.get(cc.category_id) || [];
        list.push(cc.company_id);
        map.set(cc.category_id, list);
      });
      setCategoryCompanyIds(map);
    };
    loadData();
  }, [user, open]);

  // Populate form when editing
  useEffect(() => {
    if (transaction && open) {
      setType(transaction.transaction_type);
      setDescription(transaction.description);
      setAmount(transaction.amount.toFixed(2).replace(".", ","));
      setDate(transaction.transaction_date);
      setAccountId(transaction.account_id);
      setDestinationAccountId(transaction.destination_account_id ?? "");
      setCategoryId(transaction.category_id ?? "");
      setNotes(transaction.notes ?? "");
    } else if (!transaction && open) {
      resetForm();
    }
  }, [transaction, open]);

  const isEditing = !!transaction;

  const filteredCategories = categories.filter((c) => {
    if (type === "transferencia") return true;
    if (c.transaction_type !== type) return false;
    if (contextType === "pf") return (c as any).visible_pf !== false;
    if (contextType === "pj" && selectedCompanyId) {
      const companyIds = categoryCompanyIds.get(c.id) || [];
      return companyIds.includes(selectedCompanyId);
    }
    return true;
  });

  const resetForm = () => {
    setType("despesa");
    setDescription("");
    setAmount("");
    setDate(new Date().toISOString().split("T")[0]);
    setAccountId(accounts[0]?.id ?? "");
    setDestinationAccountId("");
    setCategoryId("");
    setNotes("");
    setPaymentMethodId("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const numAmount = parseCurrencyToNumber(amount);
    const validated = validateWithToast(transactionSchema, {
      description, amount: numAmount, transaction_type: type,
      transaction_date: date, account_id: accountId || "",
      destination_account_id: type === "transferencia" ? destinationAccountId || "" : null,
      category_id: categoryId || null, notes: notes || null,
      payment_method_id: paymentMethodId || null,
    }, toast.error);
    if (!validated) return;
    if (type === "transferencia" && !destinationAccountId) return toast.error("Selecione a conta de destino");

    setSaving(true);

    const payload = {
      transaction_type: type,
      description: description.trim(),
      amount: numAmount,
      transaction_date: date,
      account_id: accountId,
      destination_account_id: type === "transferencia" ? destinationAccountId : null,
      category_id: categoryId || null,
      notes: notes.trim() || null,
      payment_method_id: paymentMethodId || null,
      context: contextType,
      company_id: contextType === "pj" ? selectedCompanyId : null,
    };

    const { error } = isEditing
      ? await supabase.from("transactions").update(payload).eq("id", transaction.id)
      : await supabase.from("transactions").insert({ ...payload, user_id: user.id });

    if (error) {
      toast.error("Erro ao salvar", { description: error.message });
    } else {
      toast.success(isEditing ? "Lançamento atualizado!" : "Lançamento criado!");
      resetForm();
      onOpenChange(false);
      onCreated();
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Lançamento" : "Novo Lançamento"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type tabs */}
          <Tabs value={type} onValueChange={(v) => setType(v as TransactionType)}>
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="receita" className="data-[state=active]:bg-success data-[state=active]:text-success-foreground">
                Receita
              </TabsTrigger>
              <TabsTrigger value="despesa" className="data-[state=active]:bg-destructive data-[state=active]:text-destructive-foreground">
                Despesa
              </TabsTrigger>
              <TabsTrigger value="transferencia">
                Transferência
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Amount */}
          <div className="space-y-2">
            <Label>Valor</Label>
            <CurrencyInput value={amount} onValueChange={setAmount} placeholder="0,00" />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Supermercado, Salário..."
              maxLength={200}
            />
          </div>

          {/* Date */}
          <div className="space-y-2">
            <Label>Data</Label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Account */}
          <div className="space-y-2">
            <Label>{type === "transferencia" ? "Conta de origem" : "Conta"}</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a conta" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Destination account (transfer) */}
          {type === "transferencia" && (
            <div className="space-y-2">
              <Label>Conta de destino</Label>
              <Select value={destinationAccountId} onValueChange={setDestinationAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o destino" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.filter((a) => a.id !== accountId).map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Category */}
          {type !== "transferencia" && (
            <div className="space-y-2">
              <Label>Categoria (opcional)</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a categoria" />
                </SelectTrigger>
                <SelectContent>
                  {filteredCategories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Payment Method */}
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

          {/* Notes */}
          <div className="space-y-2">
            <Label>Observações (opcional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anotações adicionais..."
              rows={2}
              maxLength={500}
            />
          </div>

          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? "Salvando..." : isEditing ? "Atualizar Lançamento" : "Salvar Lançamento"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
