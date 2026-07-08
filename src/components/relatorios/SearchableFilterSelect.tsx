import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface SearchableOption {
  id: string;
  name: string;
  prefix?: string;
}

interface SearchableFilterSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  allLabel?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  triggerClassName?: string;
  contentWidthClass?: string;
}

export function SearchableFilterSelect({
  value,
  onChange,
  options,
  allLabel = "Todos",
  placeholder,
  searchPlaceholder = "Buscar...",
  emptyLabel = "Nenhum item encontrado",
  triggerClassName,
  contentWidthClass = "w-[280px]",
}: SearchableFilterSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [pageSize, setPageSize] = useState(50);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const selected = options.find((o) => o.id === value);
  const q = debouncedSearch.trim().toLowerCase();
  const filtered = q
    ? options.filter((o) => o.name?.toLowerCase().includes(q) || o.prefix?.toLowerCase().includes(q))
    : options;
  const visible = filtered.slice(0, pageSize);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setSearch("");
          setDebouncedSearch("");
          setPageSize(50);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className={cn("h-9 w-full justify-between font-normal", triggerClassName)}
        >
          <span className="truncate">
            {value === "all" ? placeholder ?? allLabel : selected ? `${selected.prefix ?? ""}${selected.name}` : "—"}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 shrink-0 ml-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("p-0", contentWidthClass)} align="start">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPageSize(50);
              }}
              placeholder={searchPlaceholder}
              className="h-8 pl-7 text-sm"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          <button
            type="button"
            onClick={() => {
              onChange("all");
              setOpen(false);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent text-left"
          >
            <Check className={cn("h-3.5 w-3.5", value === "all" ? "opacity-100" : "opacity-0")} />
            {allLabel}
          </button>
          {visible.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                onChange(o.id);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent text-left"
            >
              <Check className={cn("h-3.5 w-3.5", value === o.id ? "opacity-100" : "opacity-0")} />
              <span className="truncate">
                {o.prefix ? <span className="text-muted-foreground">{o.prefix}</span> : null}
                {o.name}
              </span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">{emptyLabel}</p>
          )}
        </div>
        {filtered.length > visible.length && (
          <div className="p-2 border-t">
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-7 text-xs"
              onClick={() => setPageSize((n) => n + 50)}
            >
              Carregar mais ({filtered.length - visible.length} restantes)
            </Button>
          </div>
        )}
        <div className="px-3 py-1.5 border-t text-[10px] text-muted-foreground">
          Mostrando {Math.min(visible.length, filtered.length)} de {filtered.length}
        </div>
      </PopoverContent>
    </Popover>
  );
}
