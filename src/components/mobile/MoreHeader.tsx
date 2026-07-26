import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { MODULE_LABEL, useActiveModule } from "@/hooks/useActiveModule";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
};

/** Header sticky do /mais — só o nome do módulo e uma lupa que expande em busca inline. */
export function MoreHeader({ query, onQueryChange }: Props) {
  const activeModule = useActiveModule();
  const moduleLabel = MODULE_LABEL[activeModule];
  const [expanded, setExpanded] = useState<boolean>(Boolean(query));
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (expanded) inputRef.current?.focus();
  }, [expanded]);

  const close = () => {
    onQueryChange("");
    setExpanded(false);
  };

  return (
    <header className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b">
      <div className="px-4 py-3 flex items-center gap-2">
        <h1
          className={cn(
            "text-xl font-semibold tracking-tight truncate flex-1 min-w-0 transition-opacity",
            expanded && "opacity-0 pointer-events-none absolute",
          )}
        >
          {moduleLabel}
        </h1>

        {expanded ? (
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Buscar"
              className="pl-9 pr-9 h-10 rounded-xl"
            />
            <button
              onClick={close}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground hover:bg-muted"
              aria-label="Fechar busca"
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label="Buscar"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted shrink-0"
          >
            <Search className="h-5 w-5" />
          </button>
        )}
      </div>
    </header>
  );
}
