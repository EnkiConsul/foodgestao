import { forwardRef } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  value: string;
  onValueChange: (value: string) => void;
}

/**
 * Formata uma string bruta em moeda BR (pt-BR) preservando sinal negativo opcional.
 * Aceita entrada com apenas dígitos e um `-` opcional no início.
 */
function formatCurrency(value: string): string {
  const negative = value.trim().startsWith("-");
  const digits = value.replace(/\D/g, "");
  if (!digits) return negative ? "-" : "";
  const cents = parseInt(digits, 10);
  const formatted = (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return negative ? `-${formatted}` : formatted;
}

function parseCurrencyToNumber(formatted: string): number {
  if (!formatted) return 0;
  const negative = formatted.trim().startsWith("-");
  const cleaned = formatted.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "");
  const n = parseFloat(cleaned) || 0;
  return negative ? -n : n;
}

const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onValueChange, className, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const rawInput = e.target.value;
      const negative = rawInput.trim().startsWith("-");
      const digitsOnly = rawInput.replace(/\D/g, "");
      const withSign = negative ? `-${digitsOnly}` : digitsOnly;
      onValueChange(formatCurrency(withSign));
    };

    const toggleSign = () => {
      if (!value) {
        onValueChange("-");
        return;
      }
      if (value.trim().startsWith("-")) {
        onValueChange(value.replace(/^-/, ""));
      } else {
        onValueChange(`-${value}`);
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "-") {
        e.preventDefault();
        toggleSign();
      }
      props.onKeyDown?.(e);
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      e.target.select();
      props.onFocus?.(e);
    };

    return (
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">
          R$
        </span>
        <Input
          ref={ref}
          type="text"
          inputMode="numeric"
          value={value}
          onChange={handleChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          className={cn("pl-10 text-right", className)}
          maxLength={20}
          {...props}
        />
      </div>
    );
  }
);

CurrencyInput.displayName = "CurrencyInput";

export { CurrencyInput, formatCurrency, parseCurrencyToNumber };
