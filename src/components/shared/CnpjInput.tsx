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
      if (data._stale) {
        toast.warning("Usando dados salvos", {
          description: "A Receita Federal está indisponível no momento. Os dados exibidos podem estar desatualizados.",
        });
      } else {
        toast.success("CNPJ encontrado", {
          description: data.razao_social ?? undefined,
        });
      }
    } catch (e) {
      const err = e as Error & { code?: string };
      const code = err.code;
      const messages: Record<string, { title: string; description: string; retry: boolean }> = {
        not_found: {
          title: "CNPJ não encontrado",
          description: "Verifique se o número está correto ou preencha os dados manualmente.",
          retry: false,
        },
        rate_limited: {
          title: "Muitas consultas",
          description: "Aguarde alguns segundos antes de tentar novamente.",
          retry: true,
        },
        timeout: {
          title: "Tempo esgotado",
          description: "A Receita Federal demorou para responder. Tente novamente em instantes.",
          retry: true,
        },
        network_error: {
          title: "Sem conexão",
          description: "Não foi possível contatar a Receita Federal. Verifique sua internet e tente novamente.",
          retry: true,
        },
        upstream_unavailable: {
          title: "Receita Federal indisponível",
          description: "O serviço está fora do ar temporariamente. Tente novamente em alguns minutos ou preencha manualmente.",
          retry: true,
        },
        internal_error: {
          title: "Erro na consulta",
          description: "Ocorreu um erro inesperado. Tente novamente.",
          retry: true,
        },
      };
      const info = (code && messages[code]) || {
        title: "Falha na consulta",
        description: err.message || "Não foi possível consultar o CNPJ.",
        retry: true,
      };
      toast.error(info.title, {
        description: info.description,
        action: info.retry ? { label: "Tentar novamente", onClick: () => { void handleLookup(); } } : undefined,
      });
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
