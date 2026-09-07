import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Rodapé de formulário do módulo Pessoas.
 * Fica fixo no rodapé do contêiner, respeita a barra do sistema (safe area)
 * e mantém "Salvar" visível mesmo com o teclado aberto.
 */
export function DpFormFooter({
  children,
  className,
  /** Conteúdo informativo à esquerda (ex.: pendências do formulário). */
  info,
}: {
  children: ReactNode;
  className?: string;
  info?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-10 shrink-0 border-t border-border bg-background/95 p-3 backdrop-blur",
        "pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4 sm:pb-4",
        className,
      )}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {info && <div className="min-w-0 text-xs text-muted-foreground">{info}</div>}
        <div className="flex items-center gap-2 sm:justify-end [&>*]:min-h-11 [&>*]:flex-1 sm:[&>*]:flex-none">
          {children}
        </div>
      </div>
    </div>
  );
}
