import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { categoryIndent } from "@/lib/categories/display";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface SearchableSelectOption {
  value: string;
  label: string;
  /** Optional indentation depth for hierarchical lists (e.g. categories). */
  depth?: number;
  /** Optional searchable text appended to label. */
  keywords?: string;
  /** Optional element rendered to the left of the label (icon, color dot, avatar). */
  leading?: ReactNode;
  /** Optional element rendered to the right of the label (badge). */
  trailing?: ReactNode;
  /** Optional secondary line below the label. */
  description?: ReactNode;
}

interface Props {
  value: string;
  onValueChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
  /** Debounce in ms applied to the search input before filtering. Default: 150. Use 0 to disable. */
  searchDebounceMs?: number;
}

const MAX_LIST_HEIGHT = 320;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder = "Selecione...",
  searchPlaceholder = "Buscar...",
  emptyText = "Nenhum item encontrado",
  className,
  disabled,
  searchDebounceMs = 150,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (searchDebounceMs <= 0) {
      setDebouncedSearch(search);
      return;
    }
    const t = setTimeout(() => setDebouncedSearch(search), searchDebounceMs);
    return () => clearTimeout(t);
  }, [search, searchDebounceMs]);

  const filtered = useMemo(() => {
    const q = normalize(debouncedSearch.trim());
    if (!q) return options;
    return options.filter((o) =>
      normalize(`${o.label} ${o.keywords ?? ""}`).includes(q),
    );
  }, [options, debouncedSearch]);

  useEffect(() => {
    if (open) {
      setSearch("");
      setDebouncedSearch("");
      const idx = options.findIndex((o) => o.value === value);
      setActiveIndex(idx >= 0 ? idx : 0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [debouncedSearch]);

  // Keep active item visible
  useEffect(() => {
    if (!open || filtered.length === 0) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open, filtered.length]);

  const handleSelect = (idx: number) => {
    const opt = filtered[idx];
    if (!opt) return;
    onValueChange(opt.value);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      handleSelect(activeIndex);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(filtered.length - 1);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal h-10",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <span className="flex items-center gap-2 min-w-0 flex-1">
            {selected?.leading}
            <span className="truncate">{selected ? selected.label : placeholder}</span>
            {selected?.trailing}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[--radix-popover-trigger-width]"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex items-center border-b px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <Input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={searchPlaceholder}
            className="h-10 border-0 px-0 focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none"
          />
          <span className="ml-2 text-[11px] text-muted-foreground shrink-0">
            {filtered.length}
          </span>
        </div>

        {filtered.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">{emptyText}</div>
        ) : (
          <div
            ref={listRef}
            className="overflow-auto py-1"
            style={{ maxHeight: MAX_LIST_HEIGHT }}
          >
            {filtered.map((opt, idx) => {
              const isActive = idx === activeIndex;
              const isSelected = opt.value === value;
              const depth = opt.depth ?? 0;
              return (
                <div
                  key={opt.value}
                  data-idx={idx}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(idx);
                  }}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2 px-2 py-2 text-sm",
                    isActive && "bg-accent text-accent-foreground",
                  )}
                  style={depth > 0 ? { paddingLeft: 8 + categoryIndent(depth) } : undefined}
                >
                  <Check
                    className={cn(
                      "h-4 w-4 shrink-0",
                      isSelected ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {opt.leading}
                  <div className="min-w-0 flex-1">
                    <div className={cn("truncate", depth === 0 && "font-semibold")}>{opt.label}</div>
                    {opt.description && (
                      <div className="truncate text-[11px] text-muted-foreground">
                        {opt.description}
                      </div>
                    )}
                  </div>
                  {opt.trailing}
                </div>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
