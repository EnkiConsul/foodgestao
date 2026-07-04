import * as React from "react";
import { cn } from "@/lib/utils";

interface ResponsiveTableProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Optional aria-label describing the table content */
  ariaLabel?: string;
  children: React.ReactNode;
}

/**
 * ResponsiveTable — wrapper de rolagem horizontal para tabelas em mobile.
 * - Usa `overflow-x-auto` + `-mx-4 sm:mx-0` opcional (aplicado via className)
 * - Aplica `role="region"` e permite navegação por teclado (tabIndex=0)
 * - Sombra à direita indica conteúdo adicional (via mask gradient)
 */
export function ResponsiveTable({
  ariaLabel,
  className,
  children,
  ...props
}: ResponsiveTableProps) {
  return (
    <div
      role="region"
      aria-label={ariaLabel}
      tabIndex={0}
      className={cn(
        "relative w-full overflow-x-auto overscroll-x-contain",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        // Sombra sutil nas bordas para indicar rolagem
        "[mask-image:linear-gradient(to_right,black_0,black_calc(100%-24px),transparent_100%)]",
        "sm:[mask-image:none]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
