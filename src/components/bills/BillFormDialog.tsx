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
import { billSchema, validateWithToast } from "@/lib/validations";
import { Calendar } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type BillType = "receita" | "despesa";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function BillFormDialog({ open, onOpenChange, onCreated }: Props) {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();
  const [type, setType] = useState<BillType>("despesa");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(new Date().toISOString().split("T")[0]);
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [saving, setSaving] = useState(false);

  const [accounts, setAccounts] = useState<Tables<"accounts">[]>([]);
  const [categories, setCategories] = useState<Tables<"categories">[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<Tables<"payment_methods">[]>([]);
  const [categoryCompanyIds, setCategoryCompanyIds] = useState<Map<string, string[]>>(new Map());

  useEffect(() => {
    if (!user || !open) return;
    const load = async () => {
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
    load();
  }, [user, open]);

  const filteredCategories = categories.filter((c) => {
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
    setDueDate(new Date().toISOString().split("T")[0]);
    setAccountId(accounts[0]?.id ?? "");
    setCategoryId("");
    setNotes("");
    setPaymentMethodId("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const numAmount = parseCurrencyToNumber(amount);
    const validated = validateWithToast(billSchema, {
      description, amount: numAmount, bill_type: type, due_date: dueDate,
      account_id: accountId || null, category_id: categoryId || null,
      notes: notes || null, payment_method_id: paymentMethodId || null,
    }, toast.error);
    if (!validated) return;

    setSaving(true);
    const { error } = await supabase.from("bills").insert({
      user_id: user.id,
      bill_type: type,
      description: description.trim(),
      amount: numAmount,
      due_date: dueDate,
      account_id: accountId || null,
      category_id: categoryId || null,
      notes: notes.trim() || null,
      payment_method_id: paymentMethodId || null,
      context: contextType,
      company_id: contextType === "pj" ? selectedCompanyId : null,
    });

    if (error) {
      toast.error("Erro ao salvar", { description: error.message });
    } else {
      toast.success("Conta criada!");
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
          <DialogTitle>Nova Conta</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Tabs value={type} onValueChange={(v) => setType(v as BillType)}>
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="despesa" className="data-[state=active]:bg-destructive data-[state=active]:text-destructive-foreground">
                A Pagar
              </TabsTrigger>
              <TabsTrigger value="receita" className="data-[state=active]:bg-success data-[state=active]:text-success-foreground">
                A Receber
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="space-y-2">
            <Label>Valor</Label>
            <CurrencyInput value={amount} onValueChange={setAmount} placeholder="0,00" />
          </div>

          <div className="space-y-2">
            <Label>Descrição</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Aluguel, Fatura..." maxLength={200} />
          </div>

          <div className="space-y-2">
            <Label>Vencimento</Label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="pl-10" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Conta (opcional)</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Categoria (opcional)</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {filteredCategories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Forma de pagamento (opcional)</Label>
            <Select value={paymentMethodId} onValueChange={setPaymentMethodId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {paymentMethods.map((pm) => (
                  <SelectItem key={pm.id} value={pm.id}>{pm.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Observações (opcional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anotações..." rows={2} maxLength={500} />
          </div>

          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? "Salvando..." : "Salvar Conta"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
