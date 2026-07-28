import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SearchableFilterSelect } from "@/components/relatorios/SearchableFilterSelect";

type Account = { id: string; name: string };
type Category = { id: string; name: string; hierarchy_index: string | null };
type PaymentMethod = { id: string; name: string };
type Contact = { id: string; name: string };

interface Props {
  accounts: Account[];
  categories: Category[];
  paymentMethods: PaymentMethod[];
  contacts: Contact[];
  filterAccountId: string;
  filterCategoryId: string;
  filterPaymentMethodId: string;
  filterContactId: string;
  filterStatus: string;
  activeFilterCount: number;
  onAccountChange: (v: string) => void;
  onCategoryChange: (v: string) => void;
  onPaymentMethodChange: (v: string) => void;
  onContactChange: (v: string) => void;
  onStatusChange: (v: string) => void;
  onClear: () => void;
}

export function RelatoriosFiltersPanel({
  accounts,
  categories,
  paymentMethods,
  contacts,
  filterAccountId,
  filterCategoryId,
  filterPaymentMethodId,
  filterContactId,
  filterStatus,
  activeFilterCount,
  onAccountChange,
  onCategoryChange,
  onPaymentMethodChange,
  onContactChange,
  onStatusChange,
  onClear,
}: Props) {
  const filtersScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const scrollFilters = (direction: "left" | "right") => {
    const el = filtersScrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction === "left" ? -240 : 240, behavior: "smooth" });
  };

  useEffect(() => {
    const el = filtersScrollRef.current;
    if (!el) return;
    const update = () => {
      setCanScrollLeft(el.scrollLeft > 0);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    };
    update();
    const onScroll = () => update();
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, [accounts, categories, paymentMethods, contacts]);

  const sortedCategories = categories
    .slice()
    .sort((a, b) => {
      const partsA = (a.hierarchy_index || "").split(".").map(Number);
      const partsB = (b.hierarchy_index || "").split(".").map(Number);
      for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        const na = partsA[i] ?? 0;
        const nb = partsB[i] ?? 0;
        if (na !== nb) return na - nb;
      }
      return partsA.length - partsB.length;
    })
    .map((cat) => ({
      id: cat.id,
      name: cat.name,
    }));

  return (
    <Card className="shadow-sm">
      <CardContent className="pt-4 pb-2">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className={cn("h-7 w-7 shrink-0", !canScrollLeft && "invisible")}
            onClick={() => scrollFilters("left")}
            aria-label="Rolar filtros para a esquerda"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div
            ref={filtersScrollRef}
            className="flex flex-nowrap items-end gap-4 overflow-x-auto pb-2 flex-1 snap-x snap-mandatory scroll-smooth"
          >
            <div className="space-y-1.5 min-w-[220px] snap-start shrink-0">
              <label className="text-xs font-medium text-muted-foreground">Conta Bancária</label>
              <SearchableFilterSelect
                value={filterAccountId}
                onChange={onAccountChange}
                options={accounts.map((a) => ({ id: a.id, name: a.name }))}
                allLabel="Todas as contas"
                searchPlaceholder="Buscar conta..."
                emptyLabel="Nenhuma conta encontrada"
              />
            </div>
            <div className="space-y-1.5 min-w-[220px] snap-start shrink-0">
              <label className="text-xs font-medium text-muted-foreground">Categoria</label>
              <SearchableFilterSelect
                value={filterCategoryId}
                onChange={onCategoryChange}
                options={sortedCategories}
                allLabel="Todas as categorias"
                searchPlaceholder="Buscar categoria..."
                emptyLabel="Nenhuma categoria encontrada"
              />
            </div>
            <div className="space-y-1.5 min-w-[220px] snap-start shrink-0">
              <label className="text-xs font-medium text-muted-foreground">Forma de Pagamento</label>
              <SearchableFilterSelect
                value={filterPaymentMethodId}
                onChange={onPaymentMethodChange}
                options={paymentMethods.map((pm) => ({ id: pm.id, name: pm.name }))}
                allLabel="Todas as formas"
                searchPlaceholder="Buscar forma de pagamento..."
                emptyLabel="Nenhuma forma encontrada"
              />
            </div>
            <div className="space-y-1.5 min-w-[220px] snap-start shrink-0">
              <label className="text-xs font-medium text-muted-foreground">Cliente/Fornecedor</label>
              <SearchableFilterSelect
                value={filterContactId}
                onChange={onContactChange}
                options={contacts.map((c) => ({ id: c.id, name: c.name }))}
                allLabel="Todos"
                searchPlaceholder="Buscar contato..."
                emptyLabel="Nenhum contato encontrado"
              />
            </div>
            <div className="space-y-1.5 min-w-[160px] snap-start shrink-0">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select value={filterStatus} onValueChange={onStatusChange}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos (exceto cancelados)</SelectItem>
                  <SelectItem value="confirmado">Confirmado</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-muted-foreground"
                onClick={onClear}
              >
                <X className="h-3.5 w-3.5" /> Limpar filtros
              </Button>
            )}
          </div>
          <Button
            variant="outline"
            size="icon"
            className={cn("h-7 w-7 shrink-0", !canScrollRight && "invisible")}
            onClick={() => scrollFilters("right")}
            aria-label="Rolar filtros para a direita"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
