import { ReactNode } from "react";
import { Info } from "lucide-react";
import { Button, ButtonProps } from "@/components/ui/button";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * Mapa curto pt-BR para status usados em listas do DP.
 * Fallback: retorna o próprio valor (com primeira letra maiúscula).
 */
export const STATUS_SHORT_PT: Record<string, string> = {
  // Lotes / documentos
  processing: "Processando",
  ready: "Pronto",
  imported: "Importado",
  partially_imported: "Parcial",
  failed: "Falhou",
  // Aprovações
  pendente: "Pendente",
  aprovada: "Aprovada",
  aprovado: "Aprovado",
  recusada: "Recusada",
  recusado: "Recusado",
  cancelada: "Cancelada",
};

export function statusLabel(status?: string | null): string {
  if (!status) return "—";
  return STATUS_SHORT_PT[status] ?? status.charAt(0).toUpperCase() + status.slice(1);
}

/**
 * Botão que renderiza somente o ícone no mobile e ícone + label no desktop.
 * `children` deve conter o ícone; use `label` para o texto.
 */
export interface MobileActionButtonProps extends Omit<ButtonProps, "children"> {
  icon: ReactNode;
  label: string;
  /** Se true, esconde a legenda também no desktop (raro). */
  iconOnly?: boolean;
}

export function MobileActionButton({
  icon, label, iconOnly, className, ...rest
}: MobileActionButtonProps) {
  return (
    <Button
      {...rest}
      aria-label={label}
      title={label}
      className={cn(
        "min-h-9 min-w-9 h-9 w-9 md:w-auto md:px-3",
        className,
      )}
    >
      {icon}
      {!iconOnly && <span className="hidden md:inline ml-1">{label}</span>}
    </Button>
  );
}

/**
 * Trigger padrão "Detalhes" só-ícone para abrir o pop-out no mobile.
 */
export function DetailsIconButton({
  onClick, className,
}: { onClick: (e: React.MouseEvent) => void; className?: string }) {
  return (
    <Button
      size="icon"
      variant="ghost"
      aria-label="Detalhes"
      title="Detalhes"
      onClick={(e) => { e.stopPropagation(); onClick(e); }}
      className={cn("h-9 w-9 md:hidden", className)}
    >
      <Info className="h-4 w-4" />
    </Button>
  );
}

/**
 * Sheet padrão para exibir os detalhes completos de um card no mobile.
 */
export interface MobileDetailsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** Pares chave/valor exibidos em stack. */
  meta?: { label: string; value: ReactNode }[];
  /** Conteúdo livre extra (ex.: motivo, arquivo). */
  children?: ReactNode;
  /** Botões de ação — replicam os mesmos do card. */
  footer?: ReactNode;
}

export function MobileDetailsSheet({
  open, onOpenChange, title, description, meta, children, footer,
}: MobileDetailsSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="text-left">
          <SheetTitle className="pr-6 break-words">{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="space-y-3 py-3">
          {meta && meta.length > 0 && (
            <dl className="grid grid-cols-1 gap-2 text-sm">
              {meta.map((m, i) => (
                <div
                  key={i}
                  className="flex items-start justify-between gap-3 border-b border-border/60 pb-2 last:border-0 last:pb-0"
                >
                  <dt className="text-muted-foreground shrink-0">{m.label}</dt>
                  <dd className="text-right font-medium break-words">{m.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {children}
        </div>
        {footer && (
          <SheetFooter className="gap-2 flex-col sm:flex-row">
            {footer}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
