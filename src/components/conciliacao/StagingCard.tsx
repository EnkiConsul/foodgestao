import { format, parseISO } from "date-fns";
import { AlertTriangle, Check, Loader2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ReactNode } from "react";

interface AccountOpt {
  id: string;
  name: string;
}

export interface StagingCardRow {
  id: string;
  pluggy_account_id: string;
  date: string;
  description: string | null;
  amount: number;
  status: "pending" | "confirmed" | "ignored" | "duplicate";
  matched_transaction_id?: string | null;
}

interface StagingCardProps {
  row: StagingCardRow;
  accounts: AccountOpt[];
  accountValue: string;
  onAccountChange: (value: string) => void;
  kind: "auto" | "transfer";
  onKindChange: (value: "auto" | "transfer") => void;
  counterpart: string;
  onCounterpartChange: (value: string) => void;
  category: string;
  onCategoryChange: (value: string) => void;
  /** Itens de categoria já renderizados (mesma árvore de /categorias). */
  suggestedCategoryItems: ReactNode;
  oppositeCategoryItems: ReactNode;
  /** true quando a categoria escolhida é do tipo oposto ao valor (estorno). */
  isReversal: boolean;
  selected: boolean;
  onSelectedChange: (value: boolean) => void;
  busy: boolean;
  isTransferBadge: boolean;
  maskBRL: (value: number) => string;
  onAction: (action: "confirm" | "ignore") => void;
}

/** Versão mobile de uma linha da fila de conciliação (mesma lógica da tabela). */
export function StagingCard({
  row,
  accounts,
  accountValue,
  onAccountChange,
  kind,
  onKindChange,
  counterpart,
  onCounterpartChange,
  category,
  onCategoryChange,
  suggestedCategoryItems,
  oppositeCategoryItems,
  isReversal,
  selected,
  onSelectedChange,
  busy,
  isTransferBadge,
  maskBRL,
  onAction,
}: StagingCardProps) {
  const isEntrada = row.amount >= 0;
  const disabled = row.status !== "pending";

  return (
    <Card>
      <CardContent className="space-y-3 p-3">
        <div className="flex items-start gap-2">
          <Checkbox
            className="mt-1"
            checked={selected}
            disabled={disabled}
            onCheckedChange={(v) => onSelectedChange(Boolean(v))}
            aria-label="Selecionar lançamento"
          />
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-medium">{row.description ?? "-"}</p>
            <p className="text-xs text-muted-foreground">{format(parseISO(row.date), "dd/MM/yyyy")}</p>
          </div>
          <p className={`shrink-0 text-sm font-bold ${isEntrada ? "text-success" : "text-destructive"}`}>
            {maskBRL(row.amount)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {row.status === "pending" && <Badge variant="outline">Pendente</Badge>}
          {row.status === "confirmed" && (
            <Badge className="bg-success/15 text-success border-success/30">Confirmado</Badge>
          )}
          {row.status === "ignored" && <Badge variant="secondary">Ignorado</Badge>}
          {row.status === "duplicate" && (
            <Badge className="bg-warning/15 text-warning border-warning/30">
              <AlertTriangle className="mr-1 h-3 w-3" />
              Duplicado
            </Badge>
          )}
          {isTransferBadge && (
            <Badge variant="secondary" className="text-[10px]">
              Transferência
            </Badge>
          )}
        </div>

        <div className="space-y-2">
          <div>
            <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Conta destino</label>
            <Select value={accountValue} onValueChange={onAccountChange} disabled={disabled}>
              <SelectTrigger className="h-9 w-full text-xs">
                <SelectValue placeholder="Selecionar…" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Tipo</label>
            <Select
              value={kind}
              onValueChange={(v) => onKindChange(v as "auto" | "transfer")}
              disabled={disabled}
            >
              <SelectTrigger className="h-9 w-full text-xs" aria-label="Tipo do lançamento">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{isEntrada ? "Entrada" : "Saída"}</SelectItem>
                <SelectItem value="transfer">Transferência entre contas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {kind === "transfer" ? (
            <div>
              <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {isEntrada ? "Conta de origem" : "Conta de destino"}
              </label>
              <Select value={counterpart} onValueChange={onCounterpartChange} disabled={disabled}>
                <SelectTrigger className="h-9 w-full text-xs">
                  <SelectValue placeholder={isEntrada ? "Conta de origem…" : "Conta de destino…"} />
                </SelectTrigger>
                <SelectContent>
                  {accounts
                    .filter((a) => a.id !== accountValue)
                    .map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {isEntrada ? "Dinheiro recebido desta conta" : "Dinheiro enviado para esta conta"} — sem
                receita/despesa
              </p>
            </div>
          ) : (
            <div>
              <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Categoria</label>
              <Select value={category} onValueChange={onCategoryChange} disabled={disabled}>
                <SelectTrigger className="h-9 w-full text-xs">
                  <SelectValue placeholder="Sem categoria" />
                </SelectTrigger>
                <SelectContent className="max-h-[60vh]">
                  <SelectGroup>
                    <SelectLabel className="sticky top-0 z-10 border-b bg-popover text-[10px] uppercase tracking-wide text-muted-foreground">
                      Sugeridas ({isEntrada ? "entradas" : "saídas"})
                    </SelectLabel>
                    {suggestedCategoryItems}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel className="sticky top-0 z-10 border-y bg-popover text-[10px] uppercase tracking-wide text-warning">
                      Outras categorias — {isEntrada ? "saídas" : "entradas"} (estorno)
                    </SelectLabel>
                    {oppositeCategoryItems}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {isReversal && (
                <p className="mt-1 flex items-center gap-1 text-[10px] text-warning">
                  <AlertTriangle className="h-3 w-3" /> Estorno: categoria de tipo oposto ao valor
                </p>
              )}
            </div>
          )}
        </div>

        {row.status === "pending" && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => onAction("ignore")}>
              <X className="mr-1 h-4 w-4" /> Ignorar
            </Button>
            <Button size="sm" disabled={busy} onClick={() => onAction("confirm")}>
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Check className="mr-1 h-4 w-4" /> Confirmar
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
