import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export interface DpSection {
  value: string;
  label: string;
  /** Contador opcional exibido à direita. */
  badge?: number | string;
}

/**
 * Seletor de seção do mobile — substitui abas horizontais quando são muitas.
 * Abre uma folha inferior com todas as seções (nenhuma fica escondida).
 */
export function DpSectionSelect({
  sections,
  value,
  onValueChange,
  title = "Seções",
  className,
}: {
  sections: DpSection[];
  value: string;
  onValueChange: (value: string) => void;
  title?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const atual = sections.find((s) => s.value === value) ?? sections[0];

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className={cn("min-h-11 w-full justify-between rounded-xl px-4 text-base font-semibold", className)}
      >
        <span className="truncate">{atual?.label}</span>
        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-70" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-2xl pb-[env(safe-area-inset-bottom)]">
          <SheetHeader className="text-left">
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          <div className="mt-2 space-y-1 pb-2">
            {sections.map((s) => {
              const ativo = s.value === value;
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => { onValueChange(s.value); setOpen(false); }}
                  className={cn(
                    "flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-sm",
                    ativo ? "bg-primary/10 font-semibold text-primary" : "hover:bg-muted",
                  )}
                >
                  <span className="min-w-0 truncate">{s.label}</span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                    {s.badge !== undefined && <span>{s.badge}</span>}
                    {ativo && <Check className="h-4 w-4 text-primary" />}
                  </span>
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
