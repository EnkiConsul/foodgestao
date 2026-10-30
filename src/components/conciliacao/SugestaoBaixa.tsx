import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Link2, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { rotuloPrazo, type CandidatoPontuado } from "@/lib/conciliacao/baixaExistente";

interface CatOpt {
  cat: { id: string; name: string; parent_id?: string | null; is_active?: boolean | null; allow_transactions?: boolean | null };
  depth: number;
}

interface Props {
  candidatos: CandidatoPontuado[];
  busy: boolean;
  formatValor: (v: number) => string;
  onBaixar: (transactionId: string, diferencaCategoryId?: string, modoMenor?: "parcial" | "desconto") => void;
  categoriasDiferenca?: CatOpt[];
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

export function SugestaoBaixa({ candidatos, busy, formatValor, onBaixar, categoriasDiferenca = [] }: Props) {
  const [aberto, setAberto] = useState(false);
  const [catPorTx, setCatPorTx] = useState<Record<string, string>>({});
  const [modoPorTx, setModoPorTx] = useState<Record<string, "parcial" | "desconto">>({});
  const selecionaveis = useMemo(() => {
    const pais = new Set(categoriasDiferenca.map((o) => o.cat.parent_id).filter(Boolean) as string[]);
    return categoriasDiferenca.filter((o) => o.cat.is_active !== false && o.cat.allow_transactions !== false && !pais.has(o.cat.id));
  }, [categoriasDiferenca]);
  if (candidatos.length === 0) return null;
  const [melhor, ...outros] = candidatos;
  const lista = aberto ? candidatos : [melhor];
  const algumExato = candidatos.some((c) => Math.abs(c.diferenca) < 0.005);

  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-2 text-xs space-y-2">
      <div className="flex items-center gap-1.5 font-medium text-foreground">
        <Link2 className="h-3.5 w-3.5 text-primary" />
        {algumExato ? "Já existe um lançamento pendente com este valor" : "Pode ser um lançamento pendente já cadastrado"}
      </div>
      {lista.map((c) => {
        const acrescimo = c.diferenca >= 0.005;
        const desconto = c.diferenca <= -0.005;
        const cat = catPorTx[c.transaction_id];
        const modo = modoPorTx[c.transaction_id];
        return (
          <div key={c.transaction_id} className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-foreground">
                  {c.description || "Sem descrição"}
                  {c.contact_name ? <span className="text-muted-foreground"> · {c.contact_name}</span> : null}
                  <span className="text-muted-foreground"> · previsto {formatValor(c.amount - c.amount_paid)}</span>
                </div>
                <div className="text-muted-foreground">{detalhe(c)}</div>
                {acrescimo && (
                  <div className="text-foreground">Pago {formatValor(c.diferenca)} a mais (juros/acréscimo). A diferença vira um lançamento separado.</div>
                )}
                {desconto && (
                  <div className="text-foreground">Pago {formatValor(-c.diferenca)} a menos. Escolha abaixo se é pagamento parcial ou desconto.</div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={cn("text-[10px]", c.confianca === "alta" ? "border-primary text-primary" : "text-muted-foreground")}>
                  {c.confianca === "alta" ? "Muito provável" : c.confianca === "media" ? "Provável" : "Possível"}
                </Badge>
                <Button
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={busy || (acrescimo && !cat) || (desconto && !modo)}
                  onClick={() => onBaixar(c.transaction_id, acrescimo ? cat : undefined, desconto ? modo : undefined)}
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Dar baixa neste"}
                </Button>
              </div>
            </div>
            {acrescimo && (
              <Select value={cat ?? ""} onValueChange={(v) => setCatPorTx((p) => ({ ...p, [c.transaction_id]: v }))}>
                <SelectTrigger className="h-8 text-xs sm:max-w-xs" aria-label="Categoria da diferença">
                  <SelectValue placeholder="Categoria da diferença (ex.: Juros, Multa)" />
                </SelectTrigger>
                <SelectContent>
                  {selecionaveis.map((o) => (
                    <SelectItem key={o.cat.id} value={o.cat.id}>{o.cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {desconto && (
              <div role="radiogroup" aria-label="Como tratar o valor pago a menos" className="grid gap-1.5 sm:grid-cols-2">
                {([
                  ["parcial", "Pagamento parcial", `Fica ${formatValor(-c.diferenca)} pendente para pagar depois`],
                  ["desconto", "Quitar com desconto", `Conta encerrada; ${formatValor(-c.diferenca)} de desconto`],
                ] as const).map(([v, titulo, texto]) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={modo === v}
                    onClick={() => setModoPorTx((p) => ({ ...p, [c.transaction_id]: v }))}
                    className={cn("rounded-md border bg-background p-2 text-left", modo === v ? "border-primary ring-1 ring-primary" : "border-border")}
                  >
                    <div className="font-medium text-foreground">{titulo}</div>
                    <div className="text-muted-foreground">{texto}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
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
