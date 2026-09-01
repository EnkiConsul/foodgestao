import { useEffect, useState } from "react";
import { Calculator, Delete } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { evaluateExpression, normalizeExpression } from "@/lib/calc-expression";

interface Props {
  /** Expressão inicial (normalmente o valor atual do campo). */
  initial?: string;
  /** Chamado ao confirmar: recebe o resultado e a expressão normalizada. */
  onResult: (value: number, expression: string) => void;
  className?: string;
}

const KEYS: { label: string; value: string; variant?: "op" }[][] = [
  [
    { label: "7", value: "7" },
    { label: "8", value: "8" },
    { label: "9", value: "9" },
    { label: "÷", value: "/", variant: "op" },
  ],
  [
    { label: "4", value: "4" },
    { label: "5", value: "5" },
    { label: "6", value: "6" },
    { label: "×", value: "*", variant: "op" },
  ],
  [
    { label: "1", value: "1" },
    { label: "2", value: "2" },
    { label: "3", value: "3" },
    { label: "−", value: "-", variant: "op" },
  ],
  [
    { label: "0", value: "0" },
    { label: ",", value: "," },
    { label: "%", value: "%", variant: "op" },
    { label: "+", value: "+", variant: "op" },
  ],
  [
    { label: "(", value: "(", variant: "op" },
    { label: ")", value: ")", variant: "op" },
  ],
];

/** Calculadora opcional para o campo Valor: visor + teclado, sem alterar o formulário. */
export function AmountCalculator({ initial, onResult, className }: Props) {
  const [open, setOpen] = useState(false);
  const [expr, setExpr] = useState("");

  useEffect(() => {
    if (open) setExpr(initial && initial !== "0,00" ? initial : "");
  }, [open, initial]);

  const result = evaluateExpression(expr);
  const canUse = result.ok && (result.value ?? 0) >= 0;

  const push = (v: string) => setExpr((e) => e + v);

  const confirm = () => {
    if (!canUse) return;
    onResult(result.value!, normalizeExpression(expr));
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Abrir calculadora"
          title="Calculadora"
          className={cn("absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground", className)}
        >
          <Calculator className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[17rem] p-3"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            confirm();
          }
        }}
      >
        <div className="rounded-md border bg-muted/40 px-3 py-2">
          <div className="min-h-5 break-all text-right text-sm text-muted-foreground">
            {expr ? normalizeExpression(expr) : "0"}
          </div>
          <div
            className={cn(
              "text-right text-lg font-semibold tabular-nums",
              canUse ? "text-foreground" : "text-destructive",
            )}
          >
            {expr === ""
              ? "0,00"
              : canUse
                ? result.value!.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : "—"}
          </div>
        </div>

        {expr !== "" && !canUse && (
          <p className="mt-1 text-xs text-destructive">
            {result.ok ? "O valor não pode ser negativo." : "Expressão inválida."}
          </p>
        )}

        <div className="mt-3 space-y-1.5">
          {KEYS.map((row, i) => (
            <div key={i} className="grid grid-cols-4 gap-1.5">
              {row.map((k) => (
                <Button
                  key={k.label}
                  type="button"
                  variant={k.variant === "op" ? "secondary" : "outline"}
                  className="h-11 text-base"
                  onClick={() => push(k.value)}
                >
                  {k.label}
                </Button>
              ))}
              {i === KEYS.length - 1 && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11"
                    aria-label="Apagar último caractere"
                    onClick={() => setExpr((e) => e.slice(0, -1))}
                  >
                    <Delete className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="outline" className="h-11" onClick={() => setExpr("")}>
                    C
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>

        <Button type="button" className="mt-3 w-full" disabled={!canUse} onClick={confirm}>
          Usar valor
        </Button>
      </PopoverContent>
    </Popover>
  );
}
