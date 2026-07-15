import { forwardRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { maskCnpj, isValidCnpj } from "@/lib/cnpj";
import { useCnpjLookup, type CnpjLookupResult } from "@/hooks/useCnpjLookup";
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
  const digits = value.replace(/\D/g, "");
  const complete = digits.length === 14;
  const validFormat = complete && isValidCnpj(digits);
  const invalidFormat = digits.length > 0 && complete && !validFormat;
  const canLookup = validFormat && !lookup.isPending && !disabled;

  useEffect(() => {
    onPendingChange?.(lookup.isPending);
  }, [lookup.isPending, onPendingChange]);

  const handleLookup = async () => {
    if (!canLookup) return;
    try {
      const data = await lookup.mutateAsync(digits);
      onLookup(data);
      toast.success("CNPJ encontrado", { description: data.razao_social ?? undefined });
    } catch (e) {
      toast.error("Falha na consulta", { description: e instanceof Error ? e.message : String(e) });
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
          placeholder={placeholder}
          maxLength={18}
          disabled={disabled || lookup.isPending}
          inputMode="numeric"
          aria-invalid={invalidFormat}
          className={cn(invalidFormat && "border-destructive focus-visible:ring-destructive")}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={handleLookup}
          disabled={!canLookup}
          title="Buscar dados do CNPJ na Receita Federal"
          aria-label="Buscar CNPJ"
        >
          {lookup.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </div>
      {invalidFormat && (
        <p className="text-xs text-destructive">CNPJ inválido — verifique os dígitos.</p>
      )}
      {lookup.isPending && (
        <p className="text-xs text-muted-foreground">Consultando Receita Federal…</p>
      )}
    </div>
  );
});
