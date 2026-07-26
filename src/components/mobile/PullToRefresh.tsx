import { useRef, useState, type ReactNode } from "react";
import { Loader2, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  onRefresh: () => Promise<unknown> | void;
  children: ReactNode;
  /** Pixels de arraste para disparar refresh. */
  threshold?: number;
  className?: string;
};

/**
 * Pull-to-refresh leve (sem lib externa). Usa touch events na window
 * e só arma quando o scrollTop atual é 0.
 */
export function PullToRefresh({ onRefresh, children, threshold = 64, className }: Props) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    if (refreshing) return;
    if (window.scrollY > 4) return;
    startY.current = e.touches[0]?.clientY ?? null;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (refreshing || startY.current === null) return;
    const dy = (e.touches[0]?.clientY ?? 0) - startY.current;
    if (dy <= 0) return;
    // Damping — menos elástico após o threshold.
    const damped = dy < threshold ? dy : threshold + (dy - threshold) * 0.35;
    setPull(Math.min(damped, threshold * 1.6));
  };

  const onTouchEnd = async () => {
    if (startY.current === null) return;
    startY.current = null;
    const shouldRefresh = pull >= threshold;
    setPull(0);
    if (!shouldRefresh) return;
    try {
      setRefreshing(true);
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const progress = Math.min(1, pull / threshold);
  const showIndicator = refreshing || pull > 8;

  return (
    <div
      className={cn("relative", className)}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      {showIndicator && (
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 z-30 flex items-center justify-center h-8 w-8 rounded-full bg-card border shadow-sm"
          style={{
            top: Math.max(8, pull - 40),
            transform: `translate(-50%, 0) rotate(${progress * 180}deg)`,
            transition: refreshing || pull === 0 ? "transform 200ms ease" : "none",
          }}
        >
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : (
            <ArrowDown
              className={cn("h-4 w-4", progress >= 1 ? "text-primary" : "text-muted-foreground")}
            />
          )}
        </div>
      )}
      <div
        style={{
          transform: `translateY(${refreshing ? threshold * 0.5 : pull * 0.5}px)`,
          transition: refreshing || pull === 0 ? "transform 200ms ease" : "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}
