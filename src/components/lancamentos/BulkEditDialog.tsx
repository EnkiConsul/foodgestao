import { useEffect, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface BulkEditDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  count: number;
  accounts: { id: string; name: string }[];
  paymentMethods: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  onApply: (updates: Record<string, any>) => Promise<void>;
}

export function BulkEditDialog({
  open, onOpenChange, count, accounts, paymentMethods, categories, onApply,
}: BulkEditDialogProps) {
  const [changeCategory, setChangeCategory] = useState(false);
  const [categoryId, setCategoryId] = useState<string>("");
  const [changeAccount, setChangeAccount] = useState(false);
  const [accountId, setAccountId] = useState<string>("");
  const [changePaymentMethod, setChangePaymentMethod] = useState(false);
  const [paymentMethodId, setPaymentMethodId] = useState<string>("");
  const [changeStatus, setChangeStatus] = useState(false);
  const [statusVal, setStatusVal] = useState<"confirmado" | "pendente" | "cancelado">("confirmado");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setChangeCategory(false); setCategoryId("");
      setChangeAccount(false); setAccountId("");
      setChangePaymentMethod(false); setPaymentMethodId("");
      setChangeStatus(false); setStatusVal("confirmado");
    }
  }, [open]);

  const handleSubmit = async () => {
    const updates: Record<string, any> = {};
    if (changeCategory && categoryId) updates.category_id = categoryId;
    if (changeAccount && accountId) updates.account_id = accountId;
    if (changePaymentMethod) updates.payment_method_id = paymentMethodId || null;
    if (changeStatus) {
      updates.status = statusVal;
      if (statusVal === "confirmado") {
        updates.payment_date = format(new Date(), "yyyy-MM-dd");
        updates.bill_status = "pago";
      } else if (statusVal === "pendente") {
        updates.amount_paid = 0;
        updates.payment_date = null;
        updates.bill_status = null;
      } else {
        updates.amount_paid = 0;
        updates.payment_date = null;
        updates.bill_status = null;
      }
    }

    if (Object.keys(updates).length === 0) {
      toast.error("Selecione ao menos um campo para alterar");
      return;
    }
    setSubmitting(true);
    await onApply(updates);
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar {count} lançamento(s)</DialogTitle>
          <DialogDescription>
            Marque os campos que deseja alterar. Apenas os campos marcados serão aplicados.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Categoria */}
          <div className="flex items-start gap-2">
            <Checkbox id="bulk-cat" checked={changeCategory} onCheckedChange={(v) => setChangeCategory(!!v)} className="mt-2" />
            <div className="flex-1">
              <Label htmlFor="bulk-cat" className="text-sm cursor-pointer">Categoria</Label>
              <Select value={categoryId} onValueChange={setCategoryId} disabled={!changeCategory}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar categoria" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Conta */}
          <div className="flex items-start gap-2">
            <Checkbox id="bulk-acc" checked={changeAccount} onCheckedChange={(v) => setChangeAccount(!!v)} className="mt-2" />
            <div className="flex-1">
              <Label htmlFor="bulk-acc" className="text-sm cursor-pointer">Conta financeira</Label>
              <Select value={accountId} onValueChange={setAccountId} disabled={!changeAccount}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar conta" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Forma de pagamento */}
          <div className="flex items-start gap-2">
            <Checkbox id="bulk-pm" checked={changePaymentMethod} onCheckedChange={(v) => setChangePaymentMethod(!!v)} className="mt-2" />
            <div className="flex-1">
              <Label htmlFor="bulk-pm" className="text-sm cursor-pointer">Forma de pagamento</Label>
              <Select value={paymentMethodId} onValueChange={setPaymentMethodId} disabled={!changePaymentMethod}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar (ou nenhum)" /></SelectTrigger>
                <SelectContent>
                  {paymentMethods.map((pm) => <SelectItem key={pm.id} value={pm.id}>{pm.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Status */}
          <div className="flex items-start gap-2">
            <Checkbox id="bulk-st" checked={changeStatus} onCheckedChange={(v) => setChangeStatus(!!v)} className="mt-2" />
            <div className="flex-1">
              <Label htmlFor="bulk-st" className="text-sm cursor-pointer">Status</Label>
              <Select value={statusVal} onValueChange={(v) => setStatusVal(v as any)} disabled={!changeStatus}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="confirmado">Pago</SelectItem>
                  <SelectItem value="pendente">A vencer / Pendente</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={submitting}>Aplicar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
