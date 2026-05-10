import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
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
}

const ITEM_HEIGHT = 36;
const MAX_VISIBLE_ITEMS = 8;

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
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const parentRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = normalize(search.trim());
    if (!q) return options;
    return options.filter((o) =>
      normalize(`${o.label} ${o.keywords ?? ""}`).includes(q)
    );
  }, [options, search]);

  // Reset state on open/close
  useEffect(() => {
    if (open) {
      setSearch("");
      const idx = options.findIndex((o) => o.value === value);
      setActiveIndex(idx >= 0 ? idx : 0);
      // focus input next tick (Popover mounts content)
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [search]);

  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 6,
  });

  // Keep active item visible
  useEffect(() => {
    if (open && filtered.length > 0) {
      rowVirtualizer.scrollToIndex(activeIndex, { align: "auto" });
    }
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

  const listHeight = Math.min(filtered.length, MAX_VISIBLE_ITEMS) * ITEM_HEIGHT;

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
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
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
            ref={parentRef}
            className="overflow-auto"
            style={{ height: listHeight, maxHeight: MAX_VISIBLE_ITEMS * ITEM_HEIGHT }}
          >
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                position: "relative",
                width: "100%",
              }}
            >
              {rowVirtualizer.getVirtualItems().map((vRow) => {
                const opt = filtered[vRow.index];
                const isActive = vRow.index === activeIndex;
                const isSelected = opt.value === value;
                return (
                  <div
                    key={opt.value}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setActiveIndex(vRow.index)}
                    onMouseDown={(e) => {
                      // mouse down so we don't lose input focus before click triggers
                      e.preventDefault();
                      handleSelect(vRow.index);
                    }}
                    className={cn(
                      "absolute left-0 top-0 flex w-full cursor-pointer items-center px-2 text-sm",
                      isActive && "bg-accent text-accent-foreground",
                      (opt.depth ?? 0) === 1 && "pl-6",
                      (opt.depth ?? 0) >= 2 && "pl-10",
                    )}
                    style={{
                      height: `${vRow.size}px`,
                      transform: `translateY(${vRow.start}px)`,
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4 shrink-0",
                        isSelected ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="truncate">{opt.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
