import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTransactionFormLookups } from "@/hooks/useTransactionFormLookups";
import { formatarBRL } from "@/lib/dp/folha";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  total: number;
  competencia: string;
  dataPagamentoSugerida?: string | null;
  isPending: boolean;
  onConfirm: (params: { accountId: string | null; categoryId: string | null; dataPagamento: string }) => void;
}

/** Fase 14 — escolhe conta, categoria e vencimento da despesa consolidada da folha. */
export function FolhaDespesaDialog({
  open, onOpenChange, total, competencia, dataPagamentoSugerida, isPending, onConfirm,
}: Props) {
  const { accounts, categories } = useTransactionFormLookups(open);
  const [accountId, setAccountId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");

  const vencimentoPadrao = useMemo(() => {
    if (dataPagamentoSugerida) return dataPagamentoSugerida;
    const base = new Date(`${competencia}-01T12:00:00`);
    base.setMonth(base.getMonth() + 1);
    base.setDate(5);
    return base.toISOString().slice(0, 10);
  }, [competencia, dataPagamentoSugerida]);

  const [dataPagamento, setDataPagamento] = useState(vencimentoPadrao);
  useEffect(() => setDataPagamento(vencimentoPadrao), [vencimentoPadrao]);

  const categoriasDespesa = (categories as Array<{ id: string; name: string; type?: string }>).filter(
    (c) => !c.type || c.type === "saida",
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Gerar Despesa no Financeiro</DialogTitle>
          <DialogDescription>
            Cria uma conta a pagar de {formatarBRL(total)} referente à folha de {competencia}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="folha-conta">Conta financeira (opcional)</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger id="folha-conta"><SelectValue placeholder="Selecionar conta" /></SelectTrigger>
              <SelectContent>
                {(accounts as Array<{ id: string; name: string }>).map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="folha-categoria">Categoria (opcional)</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="folha-categoria"><SelectValue placeholder="Selecionar categoria" /></SelectTrigger>
              <SelectContent>
                {categoriasDespesa.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="folha-vencimento">Vencimento</Label>
            <Input
              id="folha-vencimento"
              type="date"
              value={dataPagamento}
              onChange={(e) => setDataPagamento(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={isPending || !dataPagamento}
            onClick={() => onConfirm({ accountId: accountId || null, categoryId: categoryId || null, dataPagamento })}
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Gerar Despesa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
