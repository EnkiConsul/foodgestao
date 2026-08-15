import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ContactSelectContent } from "@/components/conciliacao/ContactSelectContent";

interface Opt { id: string; name: string }
interface ContactOpt { id: string; name: string; type: string | null; document: string | null }

export interface DividirStagingRow {
  id: string;
  date: string;
  description: string | null;
  amount: number;
}

interface SplitDraft {
  key: string;
  description: string;
  amountText: string;
  categoryId: string;
  paymentMethodId: string;
  contactId: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: DividirStagingRow | null;
  /** conta financeira de destino já resolvida na linha */
  accountId: string | null;
  /** opções de categoria já filtradas pela direção do lançamento */
  categoryOptions: React.ReactNode;
  paymentMethods: Opt[];
  contacts: ContactOpt[];
  onDone: () => void;
}

const NONE = "__none__";

const newSplit = (description = "", amountText = ""): SplitDraft => ({
  key: Math.random().toString(36).slice(2),
  description,
  amountText,
  categoryId: NONE,
  paymentMethodId: NONE,
  contactId: NONE,
});

const parseAmount = (text: string) => {
  const normalized = text.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
};

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function DividirLancamentoDialog({
  open,
  onOpenChange,
  row,
  accountId,
  categoryOptions,
  paymentMethods,
  contacts,
  onDone,
}: Props) {
  const total = Math.abs(Number(row?.amount ?? 0));
  const [splits, setSplits] = useState<SplitDraft[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !row) return;
    const base = (row.description ?? "").trim() || "Lançamento";
    setSplits([newSplit(base, total ? total.toFixed(2).replace(".", ",") : ""), newSplit(base, "")]);
  }, [open, row?.id]);

  const somaAtual = useMemo(
    () => splits.reduce((acc, s) => acc + (Number.isNaN(parseAmount(s.amountText)) ? 0 : Math.abs(parseAmount(s.amountText))), 0),
    [splits],
  );
  const diferenca = Number((total - somaAtual).toFixed(2));
  const podeSalvar =
    !!row &&
    !!accountId &&
    splits.length >= 2 &&
    splits.every((s) => s.description.trim().length > 0 && !Number.isNaN(parseAmount(s.amountText)) && Math.abs(parseAmount(s.amountText)) > 0) &&
    Math.abs(diferenca) < 0.005;

  const update = (key: string, patch: Partial<SplitDraft>) =>
    setSplits((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  const submit = async () => {
    if (!row || !accountId) return;
    setSaving(true);
    try {
      const payload = splits.map((s) => ({
        description: s.description.trim(),
        amount: Math.abs(parseAmount(s.amountText)),
        category_id: s.categoryId === NONE ? null : s.categoryId,
        payment_method_id: s.paymentMethodId === NONE ? null : s.paymentMethodId,
        contact_id: s.contactId === NONE ? null : s.contactId,
      }));
      const { error } = await supabase.rpc("pluggy_confirm_staging_split", {
        p_staging_id: row.id,
        p_account_id: accountId,
        p_splits: payload,
      });
      if (error) {
        toast.error("Não foi possível dividir o lançamento", { description: error.message });
        return;
      }
      toast.success(`Lançamento dividido em ${payload.length} registros`);
      onOpenChange(false);
      onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dividir Lançamento</DialogTitle>
          <DialogDescription>
            {row
              ? `${(row.description ?? "").trim() || "Sem descrição"} — ${fmt(total)} do banco. A soma das partes deve ser igual a esse valor.`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {splits.map((s, i) => (
            <div key={s.key} className="rounded-lg border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Parte {i + 1}
                </span>
                {splits.length > 2 && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => setSplits((prev) => prev.filter((x) => x.key !== s.key))}
                    aria-label={`Remover parte ${i + 1}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              <div className="grid gap-2 sm:grid-cols-[1fr_140px]">
                <div>
                  <Label className="text-xs">Descrição</Label>
                  <Input
                    value={s.description}
                    onChange={(e) => update(s.key, { description: e.target.value })}
                    placeholder="Descrição do lançamento"
                  />
                </div>
                <div>
                  <Label className="text-xs">Valor</Label>
                  <Input
                    inputMode="decimal"
                    value={s.amountText}
                    onChange={(e) => update(s.key, { amountText: e.target.value })}
                    placeholder="0,00"
                    className="tabular-nums"
                  />
                </div>
              </div>

              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <div>
                  <Label className="text-xs">Categoria</Label>
                  <Select value={s.categoryId} onValueChange={(v) => update(s.key, { categoryId: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                    <SelectContent className="max-h-[320px]">
                      <SelectItem value={NONE}>Sem categoria</SelectItem>
                      {categoryOptions}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Forma de pagamento</Label>
                  <Select value={s.paymentMethodId} onValueChange={(v) => update(s.key, { paymentMethodId: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                    <SelectContent className="max-h-[320px]">
                      <SelectItem value={NONE}>Não informar</SelectItem>
                      {paymentMethods.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Cliente / Fornecedor</Label>
                  <Select value={s.contactId} onValueChange={(v) => update(s.key, { contactId: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                    <ContactSelectContent contacts={contacts} className="max-h-[320px]" />
                  </Select>
                </div>
              </div>
            </div>
          ))}

          <Button type="button" variant="outline" size="sm" onClick={() => setSplits((prev) => [...prev, newSplit()])}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Adicionar parte
          </Button>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 p-3 text-sm">
            <span className="text-muted-foreground">Valor do banco: <strong className="tabular-nums">{fmt(total)}</strong></span>
            <span className="text-muted-foreground">Soma das partes: <strong className="tabular-nums">{fmt(somaAtual)}</strong></span>
            <span className={Math.abs(diferenca) < 0.005 ? "text-success" : "text-warning"}>
              {Math.abs(diferenca) < 0.005 ? "Valores conferem" : `Diferença: ${fmt(diferenca)}`}
            </span>
          </div>

          {!accountId && (
            <p className="text-sm text-warning">Selecione a conta financeira de destino antes de dividir.</p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" onClick={submit} disabled={!podeSalvar || saving}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Confirmar divisão
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
