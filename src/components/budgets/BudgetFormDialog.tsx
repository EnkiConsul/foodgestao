import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CurrencyInput, parseCurrencyToNumber } from "@/components/ui/currency-input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { budgetSchema, validateWithToast } from "@/lib/validations";
import type { Tables } from "@/integrations/supabase/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function BudgetFormDialog({ open, onOpenChange, onCreated }: Props) {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [period, setPeriod] = useState<"mensal" | "anual">("mensal");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 7) + "-01");
  const [endDate, setEndDate] = useState("");
  const [alert70, setAlert70] = useState(true);
  const [alert90, setAlert90] = useState(true);
  const [alert100, setAlert100] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<Tables<"categories">[]>([]);

  useEffect(() => {
    if (!user || !open) return;
    if (contextType === "pj" && !selectedCompanyId) { setCategories([]); return; }
    supabase
      .rpc("get_accessible_categories", {
        _context: contextType,
        _company_id: contextType === "pj" ? selectedCompanyId! : undefined,
        _transaction_type: "saida",
      })
      .then(({ data }) => setCategories((data ?? []) as any));
  }, [user, open, contextType, selectedCompanyId]);

  useEffect(() => {
    if (!startDate) return;
    const s = new Date(startDate);
    if (period === "mensal") {
      const e = new Date(s.getFullYear(), s.getMonth() + 1, 0);
      setEndDate(e.toISOString().split("T")[0]);
    } else {
      const e = new Date(s.getFullYear(), 11, 31);
      setEndDate(e.toISOString().split("T")[0]);
    }
  }, [startDate, period]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (contextType === "pj" && !selectedCompanyId) {
      toast.error("Selecione uma empresa antes de criar o orçamento");
      return;
    }

    const numAmount = parseCurrencyToNumber(amount);

    const validated = validateWithToast(budgetSchema, {
      category_id: categoryId || "", amount: numAmount, period, start_date: startDate, end_date: endDate,
    }, toast.error);
    if (!validated) return;

    setSaving(true);
    const { error } = await supabase.from("budgets").insert({
      user_id: user.id,
      company_id: contextType === "pj" ? selectedCompanyId! : null,
      category_id: categoryId,
      amount: numAmount,
      period,
      start_date: startDate,
      end_date: endDate,
      alert_threshold_70: alert70,
      alert_threshold_90: alert90,
      alert_threshold_100: alert100,
      context: contextType,
    });

    if (error) {
      toast.error("Erro ao salvar", { description: error.message });
    } else {
      toast.success("Orçamento criado!");
      setAmount("");
      setCategoryId("");
      onOpenChange(false);
      onCreated();
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Orçamento</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Categoria</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue placeholder="Selecione a categoria" /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Valor limite</Label>
            <CurrencyInput value={amount} onValueChange={setAmount} placeholder="0,00" />
          </div>

          <div className="space-y-2">
            <Label>Período</Label>
            <Select value={period} onValueChange={(v) => setPeriod(v as "mensal" | "anual")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mensal">Mensal</SelectItem>
                <SelectItem value="anual">Anual</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Data início</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>

          <div className="space-y-3">
            <Label>Alertas de limite</Label>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={alert70} onCheckedChange={(v) => setAlert70(!!v)} />
                Alertar em 70%
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={alert90} onCheckedChange={(v) => setAlert90(!!v)} />
                Alertar em 90%
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={alert100} onCheckedChange={(v) => setAlert100(!!v)} />
                Alertar em 100%
              </label>
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? "Salvando..." : "Criar Orçamento"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
