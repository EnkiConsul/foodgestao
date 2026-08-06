import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  /** Rota de retorno (botão voltar). */
  backTo: string;
  backLabel?: string;
  title: string;
  subtitle?: ReactNode;
  /** Ícone opcional exibido junto ao título (desktop). */
  icon?: ReactNode;
  /** Ações à direita — use botões só-ícone no mobile. */
  actions?: ReactNode;
  /** Conteúdo extra abaixo do título (filtros, abas). */
  children?: ReactNode;
  /** Fixa o cabeçalho no topo ao rolar. Padrão: true. */
  sticky?: boolean;
  className?: string;
}

/**
 * Cabeçalho padrão das páginas do módulo Pedidos.
 * Compacto e fixo no mobile, espaçoso no desktop — mesma hierarquia em todos os dispositivos.
 */
export function OrdersPageHeader({
  backTo,
  backLabel = "Voltar",
  title,
  subtitle,
  icon,
  actions,
  children,
  sticky = true,
  className,
}: Props) {
  return (
    <header
      className={cn(
        "-mx-4 mb-4 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:mx-0 md:rounded-xl md:border md:px-4",
        sticky && "sticky top-0 z-20",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <Button asChild variant="ghost" size="icon" className="shrink-0" aria-label={backLabel}>
          <Link to={backTo}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 truncate text-lg font-bold leading-tight md:text-2xl">
            {icon && <span className="hidden shrink-0 md:inline-flex">{icon}</span>}
            <span className="truncate">{title}</span>
          </h1>
          {subtitle && (
            <p className="truncate text-[11px] text-muted-foreground md:text-sm">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </header>
  );
}

/** Faixa rolável horizontal para listas de abas/chips no mobile. */
export function ScrollRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("-mx-4 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0 md:overflow-visible", className)}>
      <div className="w-max md:w-auto">{children}</div>
    </div>
  );
}
