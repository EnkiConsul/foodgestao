import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  /** Período do TOTP em segundos. Padrão 30. */
  period?: number;
}

/**
 * Contador sincronizado com a janela TOTP (alinhado ao Unix time).
 * Mostra quantos segundos faltam até o código atual expirar.
 */
export function TotpCountdown({ className, period = 30 }: Props) {
  const calcRemaining = () => period - (Math.floor(Date.now() / 1000) % period);
  const [remaining, setRemaining] = useState(calcRemaining);

  useEffect(() => {
    const id = setInterval(() => setRemaining(calcRemaining()), 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const pct = (remaining / period) * 100;
  const urgent = remaining <= 5;
  const circumference = 2 * Math.PI * 9; // r = 9
  const dash = (pct / 100) * circumference;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border bg-muted/40 px-2.5 py-1 text-xs",
        urgent && "border-destructive/50 bg-destructive/10",
        className,
      )}
      aria-live="polite"
      title="Tempo restante até o código expirar"
    >
      <svg width="22" height="22" viewBox="0 0 22 22" className="shrink-0">
        <circle cx="11" cy="11" r="9" fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="2" />
        <circle
          cx="11"
          cy="11"
          r="9"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - dash}
          transform="rotate(-90 11 11)"
          className={cn("transition-all duration-200", urgent ? "text-destructive" : "text-primary")}
        />
      </svg>
      <span className={cn("tabular-nums font-medium", urgent && "text-destructive")}>
        {remaining}s
      </span>
      <span className="text-muted-foreground hidden sm:inline">
        {urgent ? "novo código em instantes" : "validade do código"}
      </span>
    </div>
  );
}
