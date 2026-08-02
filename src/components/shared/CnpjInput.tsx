import { forwardRef, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Search } from "lucide-react";
import { maskCnpj, isValidCnpj } from "@/lib/cnpj";
import { useCnpjLookup, type CnpjLookupResult } from "@/hooks/useCnpjLookup";
import { notifyCnpjSuccess, notifyCnpjError } from "@/lib/cnpj-messages";
import { cn } from "@/lib/utils";

interface CnpjInputProps {
  id?: string;
  value: string;
  onChange: (masked: string) => void;
  onLookup: (data: CnpjLookupResult) => void;
  onPendingChange?: (pending: boolean) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export const CnpjInput = forwardRef<HTMLInputElement, CnpjInputProps>(function CnpjInput(
  { id, value, onChange, onLookup, onPendingChange, placeholder = "00.000.000/0000-00", disabled, className },
  ref,
) {
  const lookup = useCnpjLookup();
  const [touched, setTouched] = useState(false);
  const digits = value.replace(/\D/g, "");
  const complete = digits.length === 14;
  const validFormat = complete && isValidCnpj(digits);
  const invalidDigits = complete && !validFormat;
  const incomplete = touched && digits.length > 0 && !complete;
  const showError = invalidDigits || incomplete;
  const errorId = id ? `${id}-cnpj-error` : "cnpj-error";
  const canLookup = validFormat && !lookup.isPending && !disabled;

  useEffect(() => {
    onPendingChange?.(lookup.isPending);
  }, [lookup.isPending, onPendingChange]);

  const handleLookup = async () => {
    if (!canLookup) return;
    try {
      const data = await lookup.mutateAsync(digits);
      onLookup(data);
      notifyCnpjSuccess(data);
    } catch (e) {
      notifyCnpjError(e, { onRetry: () => { void handleLookup(); } });
    }
  };

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex gap-2">
        <Input
          ref={ref}
          id={id}
          value={value}
          onChange={(e) => onChange(maskCnpj(e.target.value))}
          onBlur={() => setTouched(true)}
          placeholder={placeholder}
          maxLength={18}
          disabled={disabled || lookup.isPending}
          inputMode="numeric"
          aria-invalid={showError}
          aria-describedby={showError ? errorId : undefined}
          className={cn(showError && "border-destructive focus-visible:ring-destructive")}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={handleLookup}
          disabled={!canLookup}
          title={validFormat ? "Buscar dados do CNPJ na Receita Federal" : "Informe um CNPJ válido para buscar"}
          aria-label="Buscar CNPJ"
        >
          {lookup.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </div>
      {showError && (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {invalidDigits
            ? "CNPJ inválido — verifique os dígitos."
            : "CNPJ incompleto — informe os 14 dígitos."}
        </p>
      )}
      {lookup.isPending && (
        <p className="text-xs text-muted-foreground">Consultando Receita Federal…</p>
      )}
    </div>
  );
});

