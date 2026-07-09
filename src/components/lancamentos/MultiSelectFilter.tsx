import { useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export interface MultiOption {
  id: string;
  name: string;
}

interface MultiSelectFilterProps {
  value: string[];
  onChange: (value: string[]) => void;
  options: MultiOption[];
  allLabel?: string;
  itemLabelSingular?: string;
  itemLabelPlural?: string;
  searchPlaceholder?: string;
  triggerClassName?: string;
}

export function MultiSelectFilter({
  value,
  onChange,
  options,
  allLabel = "Todas",
  itemLabelSingular = "selecionada",
  itemLabelPlural = "selecionadas",
  searchPlaceholder = "Buscar...",
  triggerClassName,
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const q = search.trim().toLowerCase();
  const filtered = q ? options.filter((o) => o.name?.toLowerCase().includes(q)) : options;

  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else onChange([...value, id]);
  };

  const label = (() => {
    if (value.length === 0) return allLabel;
    if (value.length === 1) {
      const sel = options.find((o) => o.id === value[0]);
      return sel?.name ?? `1 ${itemLabelSingular}`;
    }
    return `${value.length} ${itemLabelPlural}`;
  })();

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className={cn("mt-0.5 h-6 w-full justify-between font-normal text-[11px] px-2", triggerClassName)}
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="h-3 w-3 opacity-50 shrink-0 ml-1" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[240px]" align="start">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-7 pl-6 text-xs"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-60 overflow-y-auto py-1">
          <button
            type="button"
            onClick={() => {
              onChange([]);
            }}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-accent text-left"
          >
            <Check className={cn("h-3 w-3", value.length === 0 ? "opacity-100" : "opacity-0")} />
            {allLabel}
          </button>
          {filtered.map((o) => {
            const checked = value.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => toggle(o.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-accent text-left"
              >
                <Checkbox checked={checked} className="h-3.5 w-3.5" />
                <span className="truncate">{o.name}</span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-3">Nenhum item</p>
          )}
        </div>
        {value.length > 0 && (
          <div className="p-1.5 border-t">
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-6 text-[11px]"
              onClick={() => onChange([])}
            >
              Limpar seleção
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
