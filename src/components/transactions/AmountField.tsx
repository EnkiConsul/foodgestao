import { useRef, useState } from "react";
import { RotateCcw } from "lucide-react";

import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { cn } from "@/lib/utils";
import { AmountCalculator } from "@/components/transactions/AmountCalculator";
import {
  evaluateExpression,
  formatResultForCurrencyInput,
  normalizeExpression,
} from "@/lib/calc-expression";

interface Props {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
}

const OPERATOR_KEYS = new Set(["+", "*", "/", "x", "X", "%", "(", ")", "="]);

/**
 * Campo Valor do lançamento com calculadora opcional:
 * aceita expressão digitada ("12,50*3+8") e oferece um teclado em popover.
 */
export function AmountField({ value, onValueChange, placeholder }: Props) {
  const [expr, setExpr] = useState<string | null>(null);
  const [resolved, setResolved] = useState<{ expression: string; result: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const exprRef = useRef<HTMLInputElement>(null);

  const applyResult = (val: number, expression: string) => {
    onValueChange(formatResultForCurrencyInput(val));
    setResolved({ expression, result: formatResultForCurrencyInput(val) });
    setError(null);
  };

  const commitExpression = () => {
    const raw = (expr ?? "").trim();
    if (!raw) {
      setExpr(null);
      setError(null);
      return;
    }
    const res = evaluateExpression(raw);
    if (!res.ok || (res.value ?? 0) < 0) {
      setError(res.ok ? "O valor não pode ser negativo." : "Expressão inválida.");
      return;
    }
    applyResult(res.value!, normalizeExpression(raw));
    setExpr(null);
  };

  const startExpression = (seed: string) => {
    setError(null);
    setExpr(seed);
    requestAnimationFrame(() => {
      exprRef.current?.focus();
      const el = exprRef.current;
      if (el) el.setSelectionRange(el.value.length, el.value.length);
    });
  };

  return (
    <div className="space-y-1.5">
      <div className="relative">
        {expr !== null ? (
          <>
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
              =
            </span>
            <Input
              ref={exprRef}
              value={expr}
              inputMode="text"
              autoComplete="off"
              aria-label="Expressão de cálculo"
              onChange={(e) => {
                setExpr(e.target.value);
                setError(null);
              }}
              onBlur={commitExpression}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitExpression();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setExpr(null);
                  setError(null);
                }
              }}
              className={cn("pl-8 pr-10 text-right", error && "border-destructive focus-visible:ring-destructive")}
              placeholder="Ex: 12,50*3+8"
            />
          </>
        ) : (
          <CurrencyInput
            value={value}
            onValueChange={(v) => {
              setResolved(null);
              onValueChange(v);
            }}
            placeholder={placeholder}
            className="pr-10"
            onKeyDown={(e) => {
              if (OPERATOR_KEYS.has(e.key)) {
                e.preventDefault();
                const seed = value ? `${value}${e.key === "=" ? "" : e.key === "x" || e.key === "X" ? "*" : e.key}` : e.key === "=" ? "" : e.key;
                startExpression(seed);
              }
            }}
          />
        )}
        <AmountCalculator initial={expr ?? value} onResult={applyResult} />
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {!error && expr !== null && (
        <p className="text-xs text-muted-foreground">
          Digite uma conta e pressione Enter (ex: 12,50*3+8). Esc cancela.
        </p>
      )}

      {!error && expr === null && resolved && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">
            {resolved.expression} = {resolved.result}
          </span>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-primary hover:underline"
            onClick={() => startExpression(resolved.expression.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/\s/g, ""))}
          >
            <RotateCcw className="h-3 w-3" />
            Ajustar conta
          </button>
        </div>
      )}
    </div>
  );
}
