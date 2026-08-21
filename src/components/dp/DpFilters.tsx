import { type ReactNode, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/** Campo de filtro com rótulo padronizado (sem caixa alta forçada). */
export function DpFilterField({
  label, children, className,
}: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

interface DpFiltersProps {
  /** Campo de busca opcional — fica sempre visível, inclusive no mobile. */
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  };
  /** Campos de filtro: grade no desktop, empilhados na folha do mobile. */
  children?: ReactNode;
  /** Quantidade de filtros ativos — exibida no botão "Filtros". */
  activeCount?: number;
  /** Ação de limpar filtros (mostrada na folha do mobile). */
  onClear?: () => void;
  columns?: 2 | 3 | 4;
  className?: string;
}

/**
 * Barra de filtros padrão do módulo Pessoas.
 * No mobile mostra apenas busca + botão "Filtros" (com contador) que abre uma folha
 * inferior; no desktop mantém o card de filtros em grade.
 */
export function DpFilters({
  search,
  children,
  activeCount = 0,
  onClear,
  columns = 4,
  className,
}: DpFiltersProps) {
  const [open, setOpen] = useState(false);
  const hasFields = Boolean(children);

  const searchInput = search && (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={search.value}
        onChange={(e) => search.onChange(e.target.value)}
        placeholder={search.placeholder ?? "Buscar..."}
        className={cn("pl-9", search.value && "pr-9")}
      />
      {search.value && (
        <button
          type="button"
          onClick={() => search.onChange("")}
          aria-label="Limpar busca"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );

  return (
    <div className={cn("dp-filters", className)}>
      {/* Mobile */}
      <div className="flex items-center gap-2 md:hidden">
        {searchInput && <div className="min-w-0 flex-1">{searchInput}</div>}
        {hasFields && (
          <Button
            type="button"
            variant="outline"
            className={cn("h-10 shrink-0 gap-1.5 px-3", !searchInput && "w-full")}
            onClick={() => setOpen(true)}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filtros
            {activeCount > 0 && (
              <Badge className="ml-0.5 h-5 min-w-5 justify-center px-1 text-[11px]">{activeCount}</Badge>
            )}
          </Button>
        )}
      </div>

      {/* Desktop */}
      <Card className="hidden md:block">
        <CardContent className="p-4 md:p-5">
          <div
            className={cn(
              "grid gap-4",
              columns === 2 && "md:grid-cols-2",
              columns === 3 && "md:grid-cols-3",
              columns === 4 && "md:grid-cols-2 lg:grid-cols-4",
            )}
          >
            {searchInput && <DpFilterField label="Buscar">{searchInput}</DpFilterField>}
            {children}
          </div>
        </CardContent>
      </Card>

      {hasFields && (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl md:hidden">
            <SheetHeader className="text-left">
              <SheetTitle>Filtros</SheetTitle>
            </SheetHeader>
            <div className="grid gap-3 py-3">{children}</div>
            <SheetFooter className="flex-row gap-2">
              {onClear && (
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => { onClear(); setOpen(false); }}
                >
                  Limpar
                </Button>
              )}
              <Button className="flex-1" onClick={() => setOpen(false)}>Ver resultados</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
