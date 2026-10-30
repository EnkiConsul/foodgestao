import { useState } from "react";
import { format, parseISO } from "date-fns";
import { Link2, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { rotuloPrazo, type CandidatoPontuado } from "@/lib/conciliacao/baixaExistente";

interface Props {
  candidatos: CandidatoPontuado[];
  busy: boolean;
  formatValor: (v: number) => string;
  onBaixar: (transactionId: string) => void;
}

function detalhe(c: CandidatoPontuado) {
  const partes: string[] = [];
  if (c.installment_number && c.installment_total) partes.push(`Parcela ${c.installment_number}/${c.installment_total}`);
  else if (c.is_recurring || c.parent_transaction_id) partes.push("Recorrente");
  const venc = c.due_date ?? c.transaction_date;
  if (venc) partes.push(`venc. ${format(parseISO(venc), "dd/MM/yyyy")}`);
  partes.push(rotuloPrazo(c.diasDiferenca));
  return partes.join(" · ");
}

export function SugestaoBaixa({ candidatos, busy, formatValor, onBaixar }: Props) {
  const [aberto, setAberto] = useState(false);
  if (candidatos.length === 0) return null;
  const [melhor, ...outros] = candidatos;
  const lista = aberto ? candidatos : [melhor];

  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-2 text-xs space-y-2">
      <div className="flex items-center gap-1.5 font-medium text-foreground">
        <Link2 className="h-3.5 w-3.5 text-primary" />
        Já existe um lançamento pendente com este valor
      </div>
      {lista.map((c) => (
        <div key={c.transaction_id} className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-foreground">
              {c.description || "Sem descrição"}
              {c.contact_name ? <span className="text-muted-foreground"> · {c.contact_name}</span> : null}
              <span className="text-muted-foreground"> · {formatValor(c.amount - c.amount_paid)}</span>
            </div>
            <div className="text-muted-foreground">{detalhe(c)}</div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn("text-[10px]", c.confianca === "alta" ? "border-primary text-primary" : "text-muted-foreground")}>
              {c.confianca === "alta" ? "Muito provável" : c.confianca === "media" ? "Provável" : "Possível"}
            </Badge>
            <Button size="sm" className="h-7 px-2 text-xs" disabled={busy} onClick={() => onBaixar(c.transaction_id)}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Dar baixa neste"}
            </Button>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground">
        <span>Se não for o mesmo, use "Confirmar" para criar um lançamento novo.</span>
        {outros.length > 0 && (
          <button type="button" className="inline-flex items-center gap-1 text-primary hover:underline" onClick={() => setAberto((v) => !v)}>
            {aberto ? <>Ocultar outros <ChevronUp className="h-3 w-3" /></> : <>Ver outros ({outros.length}) <ChevronDown className="h-3 w-3" /></>}
          </button>
        )}
      </div>
    </div>
  );
}
