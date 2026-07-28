import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, FolderTree, Trash2 } from "lucide-react";
import { BATCH_COLOR_OPTIONS, type Category } from "@/lib/categories/tree";

interface Props {
  selectedCount: number;
  categories: Category[];
  selected: Set<string>;
  batchParentId: string;
  batchSaving: boolean;
  onBatchParentChange: (v: string) => void;
  onBatchChangeParent: () => void;
  onBatchColor: (color: string) => void;
  onOpenVisibility: () => void;
  onOpenDelete: () => void;
  onClearSelection: () => void;
}

export function BatchActionBar({
  selectedCount,
  categories,
  selected,
  batchParentId,
  batchSaving,
  onBatchParentChange,
  onBatchChangeParent,
  onBatchColor,
  onOpenVisibility,
  onOpenDelete,
  onClearSelection,
}: Props) {
  return (
    <div
      role="region"
      aria-label="Ações em lote de categorias"
      className="fixed inset-x-2 bottom-20 z-40 flex flex-wrap items-center gap-3 rounded-lg border bg-background p-3 shadow-lg md:static md:inset-auto md:bottom-auto md:z-auto md:bg-muted/50 md:shadow-none"
    >
      <span className="text-sm font-medium" role="status" aria-live="polite">
        {selectedCount} selecionada(s)
      </span>
      <div className="flex items-center gap-2">

        <FolderTree className="h-4 w-4 text-muted-foreground" aria-hidden />
        <Select value={batchParentId} onValueChange={onBatchParentChange}>
          <SelectTrigger className="h-8 w-[200px] text-xs" aria-label="Categoria pai de destino">
            <SelectValue placeholder="Categoria Raiz" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Nenhuma (raiz)</SelectItem>
            {categories
              .filter((c) => !selected.has(c.id))
              .map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Button size="sm" className="h-8 text-xs" onClick={onBatchChangeParent} disabled={batchSaving}>
          {batchSaving ? "Movendo..." : "Mover"}
        </Button>
      </div>
      <div className="flex items-center gap-2 ml-auto">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
              <div aria-hidden className="h-3.5 w-3.5 rounded-full border" style={{ backgroundColor: "#3b82f6" }} />
              Cor
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3" align="end">
            <p className="text-xs font-medium mb-2">Aplicar cor a {selectedCount} categoria(s)</p>
            <div className="flex gap-2 flex-wrap max-w-[200px]">
              {BATCH_COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => onBatchColor(c)}
                  aria-label={`Aplicar cor ${c}`}
                  className="h-7 w-7 rounded-full border-2 border-transparent hover:border-foreground transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={onOpenVisibility}>
          <Eye className="h-3.5 w-3.5" />
          Visibilidade
        </Button>
        <Button variant="destructive" size="sm" className="h-8 text-xs gap-1" onClick={onOpenDelete}>
          <Trash2 className="h-3.5 w-3.5" />
          Excluir
        </Button>
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onClearSelection}>
          Limpar seleção
        </Button>
      </div>
    </div>
  );
}
