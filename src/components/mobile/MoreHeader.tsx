import { Search, X } from "lucide-react";
import { MODULE_LABEL, useActiveModule } from "@/hooks/useActiveModule";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
};

/** Header fixo do /mais — nome do módulo à esquerda e campo "Buscar" à direita.
 *  Fica 100% fixo logo abaixo da topbar global (h-12 no mobile, h-14 no desktop). */
export function MoreHeader({ query, onQueryChange }: Props) {
  const activeModule = useActiveModule();
  const moduleLabel = MODULE_LABEL[activeModule];

  return (
    <header className="fixed left-0 right-0 top-12 z-30 bg-background border-b md:hidden">
      <div className="px-4 flex items-center gap-3 h-11">
        <h1 className="text-sm font-semibold tracking-tight truncate">
          {moduleLabel}
        </h1>

        <div className="relative ml-auto w-[150px] shrink-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Buscar"
            className={cn("pl-8 h-9 rounded-lg text-sm", query ? "pr-8" : "pr-2")}
          />
          {query && (
            <button
              onClick={() => onQueryChange("")}
              className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground hover:bg-muted"
              aria-label="Limpar busca"
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
