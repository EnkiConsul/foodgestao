import { useEffect, useState } from "react";
import { CheckCircle2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatFreshness,
  REASON_LABEL,
  useFreshness,
  type FreshnessKey,
} from "@/hooks/useBillingFreshness";

interface FreshnessIndicatorProps {
  freshnessKey: FreshnessKey;
  className?: string;
  /** Optional label prefix, e.g. "Faturas". */
  label?: string;
}

/**
 * Subtle indicator that pulses in green for ~6s right after a realtime
 * billing event updates the underlying data, then fades into a discreet
 * "Atualizado há Xs" timestamp so users can verify freshness at a glance.
 */
export function FreshnessIndicator({
  freshnessKey,
  className,
  label,
}: FreshnessIndicatorProps) {
  const event = useFreshness(freshnessKey);
  const [recent, setRecent] = useState(false);

  useEffect(() => {
    if (!event) return;
    setRecent(true);
    const t = setTimeout(() => setRecent(false), 6000);
    return () => clearTimeout(t);
  }, [event?.at]);

  if (!event) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
        recent
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "border-border bg-muted/40 text-muted-foreground",
        className,
      )}
      title={`${label ? label + ": " : ""}${REASON_LABEL[event.reason]}`}
      aria-live="polite"
    >
      {recent ? (
        <>
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          {label ? `${label} atualizada` : "Atualizado agora"}
        </>
      ) : (
        <>
          <RefreshCw className="h-3 w-3" />
          {formatFreshness(event.at)}
        </>
      )}
      {recent && <CheckCircle2 className="h-3 w-3" />}
    </span>
  );
}
