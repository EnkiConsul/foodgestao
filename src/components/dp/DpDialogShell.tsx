import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface DpDialogShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Largura máxima no desktop. */
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  contentClassName?: string;
}

const SIZE: Record<NonNullable<DpDialogShellProps["size"]>, string> = {
  sm: "sm:max-w-md",
  md: "sm:max-w-2xl",
  lg: "sm:max-w-3xl",
  xl: "sm:max-w-5xl",
};

/**
 * Casca padrão dos diálogos do módulo Pessoas.
 * Mobile: tela cheia com cabeçalho e rodapé fixos e corpo rolável.
 * Desktop: diálogo centralizado com altura máxima.
 */
export function DpDialogShell({
  open,
  onOpenChange,
  icon: Icon,
  title,
  description,
  children,
  footer,
  size = "md",
  className,
  contentClassName,
}: DpDialogShellProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex h-[100dvh] max-w-none flex-col gap-0 overflow-hidden p-0",
          "sm:h-auto sm:max-h-[92vh] sm:rounded-lg",
          SIZE[size],
          className,
        )}
      >
        <DialogHeader className="border-b p-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            {Icon && <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />}
            <span className="min-w-0 truncate">{title}</span>
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className={cn("flex-1 overflow-y-auto p-4", contentClassName)}>{children}</div>

        {footer && (
          <DialogFooter className="flex-row gap-2 border-t p-4">{footer}</DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
