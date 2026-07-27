import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput, formatCurrency, parseCurrencyToNumber } from "@/components/ui/currency-input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Account = Database["public"]["Tables"]["accounts"]["Row"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: Account | null;
  onAdjusted?: () => void;
}

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export function AdjustAccountBalanceDialog({ open, onOpenChange, account, onAdjusted }: Props) {
  const [target, setTarget] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [idem, setIdem] = useState<string>("");

  useEffect(() => {
    if (!open || !account) return;
    setTarget(formatCurrency(String(Math.round(Number(account.current_balance) * 100))));
    setDate(new Date().toISOString().slice(0, 10));
    setNote("");
    setIdem(crypto.randomUUID());
  }, [open, account]);

  const current = Number(account?.current_balance ?? 0);
  const targetNum = useMemo(() => parseCurrencyToNumber(target), [target]);
  const delta = useMemo(() => targetNum - current, [targetNum, current]);

  const handleSubmit = async () => {
    if (!account) return;
    if (!note.trim()) {
      toast.error("Informe uma justificativa para o ajuste.");
      return;
    }
    if (Math.abs(delta) < 0.005) {
      toast.error("O saldo alvo é igual ao saldo atual.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("adjust_account_balance", {
      _account_id: account.id,
      _target_balance: targetNum,
      _adjust_date: date,
      _note: note.trim(),
      _idempotency_key: idem,
    } as never);
    setSaving(false);
    if (error) {
      toast.error(error.message || "Erro ao ajustar saldo");
      return;
    }
    toast.success("Saldo ajustado com sucesso");
    onAdjusted?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajustar saldo</DialogTitle>
          <DialogDescription>
            {account ? `Conta: ${account.name}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md bg-muted/40 border p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Saldo atual</span>
              <span className="font-medium">{brl(current)}</span>
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-muted-foreground">Diferença (delta)</span>
              <span className={`font-semibold ${delta > 0 ? "text-success" : delta < 0 ? "text-destructive" : ""}`}>
                {brl(delta)}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Saldo alvo</Label>
            <CurrencyInput value={target} onValueChange={setTarget} placeholder="0,00" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="adj-date">Data do ajuste</Label>
            <Input id="adj-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="adj-note">Justificativa (obrigatória)</Label>
            <Textarea
              id="adj-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex.: divergência de saldo entre extrato bancário e sistema em 27/07."
              rows={3}
              maxLength={500}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            O ajuste gera um lançamento auditável marcado como <strong>ajuste de saldo</strong>. Ele
            não entra na DRE operacional, mas mantém o histórico da conta consistente.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving || !note.trim() || Math.abs(delta) < 0.005}>
            {saving ? "Ajustando..." : "Confirmar ajuste"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
