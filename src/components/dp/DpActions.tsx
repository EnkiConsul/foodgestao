import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { MoreHorizontal, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Ação de tela/linha do módulo Pessoas.
 * O mesmo descritor é usado para renderizar botão (desktop) ou item de menu (mobile),
 * garantindo paridade funcional: a ação muda de lugar, nunca desaparece.
 */
export interface DpAction {
  key: string;
  label: string;
  icon?: LucideIcon;
  onSelect?: () => void;
  /** Rota interna — renderiza como link. */
  to?: string;
  variant?: "default" | "outline" | "ghost" | "secondary" | "destructive";
  /** Ação principal: fica sempre visível (largura cheia no mobile). */
  primary?: boolean;
  /** Mantém visível no mobile como botão de ícone (use com parcimônia). */
  keepVisible?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  hidden?: boolean;
  /** Insere um separador antes do item no menu. */
  separatorBefore?: boolean;
}

function ActionButton({ action, iconOnly, className }: { action: DpAction; iconOnly?: boolean; className?: string }) {
  const Icon = action.icon;
  const content = (
    <>
      {Icon && <Icon className={cn("h-4 w-4", !iconOnly && "mr-1.5")} aria-hidden="true" />}
      {!iconOnly && <span className="truncate">{action.label}</span>}
    </>
  );
  const cls = cn(
    "min-h-11 rounded-full",
    iconOnly ? "min-w-11 px-0" : "px-4",
    action.destructive && "text-destructive",
    className,
  );
  if (action.to) {
    return (
      <Button
        variant={action.variant ?? "outline"}
        className={cls}
        disabled={action.disabled}
        asChild
        aria-label={iconOnly ? action.label : undefined}
        title={iconOnly ? action.label : undefined}
      >
        <Link to={action.to}>{content}</Link>
      </Button>
    );
  }
  return (
    <Button
      variant={action.variant ?? "outline"}
      className={cls}
      onClick={action.onSelect}
      disabled={action.disabled}
      aria-label={iconOnly ? action.label : undefined}
      title={iconOnly ? action.label : undefined}
    >
      {content}
    </Button>
  );
}

function ActionMenuItem({ action }: { action: DpAction }) {
  const Icon = action.icon;
  const inner = (
    <>
      {Icon && <Icon className={cn("mr-2 h-4 w-4", action.destructive && "text-destructive")} aria-hidden="true" />}
      {action.label}
    </>
  );
  if (action.to) {
    return (
      <DropdownMenuItem asChild disabled={action.disabled} className="min-h-11">
        <Link to={action.to}>{inner}</Link>
      </DropdownMenuItem>
    );
  }
  return (
    <DropdownMenuItem
      disabled={action.disabled}
      onSelect={() => action.onSelect?.()}
      className={cn("min-h-11", action.destructive && "text-destructive focus:text-destructive")}
    >
      {inner}
    </DropdownMenuItem>
  );
}

export function DpActionsMenu({
  actions,
  align = "end",
  label = "Mais ações",
  vertical,
  className,
}: {
  actions: DpAction[];
  align?: "start" | "end";
  label?: string;
  vertical?: boolean;
  className?: string;
}) {
  const items = actions.filter((a) => !a.hidden);
  if (items.length === 0) return null;
  const MoreIcon = vertical ? MoreVertical : MoreHorizontal;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn("min-h-11 min-w-11 shrink-0 rounded-full px-0", className)}
          aria-label={label}
          title={label}
        >
          <MoreIcon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-60">
        {items.map((a) => (
          <div key={a.key}>
            {a.separatorBefore && <DropdownMenuSeparator />}
            <ActionMenuItem action={a} />
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Barra de ações padrão do módulo Pessoas.
 * Mobile: ação principal em largura cheia + menu "Mais" com as demais.
 * Desktop: todas as ações como botões lado a lado.
 */
export function DpActions({
  actions,
  extra,
  className,
}: {
  actions: DpAction[];
  /** Controles avulsos (ex.: salvar larguras) — só aparecem no desktop. */
  extra?: ReactNode;
  className?: string;
}) {
  const visible = actions.filter((a) => !a.hidden);
  if (visible.length === 0 && !extra) return null;

  const primary = visible.find((a) => a.primary) ?? visible[0];
  const others = visible.filter((a) => a !== primary);
  const inline = others.filter((a) => a.keepVisible);
  const menu = others.filter((a) => !a.keepVisible);

  return (
    <div className={cn("w-full min-w-0 sm:w-auto", className)}>
      {/* Mobile: principal + Mais */}
      <div className="flex w-full items-center gap-2 sm:hidden">
        {primary && (
          <ActionButton
            action={{ ...primary, variant: primary.variant ?? "default" }}
            className="min-w-0 flex-1 font-semibold"
          />
        )}
        {inline.map((a) => (
          <ActionButton key={a.key} action={a} iconOnly />
        ))}
        {menu.length > 0 && <DpActionsMenu actions={menu} vertical />}
      </div>

      {/* Desktop */}
      <div className="hidden shrink-0 flex-wrap items-center justify-end gap-2 sm:flex">
        {extra}
        {others.map((a) => (
          <ActionButton key={a.key} action={a} />
        ))}
        {primary && (
          <ActionButton
            action={{ ...primary, variant: primary.variant ?? "default" }}
            className="font-semibold"
          />
        )}
      </div>
    </div>
  );
}
