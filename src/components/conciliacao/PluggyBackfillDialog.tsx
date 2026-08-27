import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
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
import { Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string | null;
  companyId: string | null;
  connectorName?: string | null;
  onDone?: () => void;
}

const hoje = () => new Date().toISOString().slice(0, 10);
const diasAtras = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

/**
 * Importação de um período específico (backfill). A importação é idempotente:
 * lançamentos já existentes não entram de novo.
 */
export function PluggyBackfillDialog({
  open,
  onOpenChange,
  itemId,
  companyId,
  connectorName,
  onDone,
}: Props) {
  const [from, setFrom] = useState(diasAtras(90));
  const [to, setTo] = useState(hoje());
  const [loading, setLoading] = useState(false);

  const importar = async () => {
    if (!itemId) return;
    if (!from || !to || from > to) {
      toast.error("Informe um período válido");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("pluggy-sync-item", {
      body: { item_id: itemId, company_id: companyId, from_date: from, to_date: to, refresh: false },
    });
    setLoading(false);
    if (error) {
      toast.error("Falha ao importar o período");
      return;
    }
    toast.success(`Período importado (${data?.transactions ?? 0} lançamentos lidos)`);
    onOpenChange(false);
    onDone?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Importar período{connectorName ? ` — ${connectorName}` : ""}</DialogTitle>
          <DialogDescription>
            Busca no banco os lançamentos do intervalo escolhido. Só entra o que ainda não foi
            importado — nada é duplicado nem alterado no que já está conciliado.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="backfill-from">De</Label>
            <Input
              id="backfill-from"
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="backfill-to">Até</Label>
            <Input
              id="backfill-to"
              type="date"
              value={to}
              max={hoje()}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={importar} disabled={loading || !itemId}>
            {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
            Importar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
