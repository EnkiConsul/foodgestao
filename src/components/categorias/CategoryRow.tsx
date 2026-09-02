import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { TableCell, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronRight, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { Draggable } from "@hello-pangea/dnd";
import type { Category, TreeNode } from "@/lib/categories/tree";
import { CATEGORY_INDENT_STEP, categoryGuideLevels } from "@/lib/categories/display";
import { CategoryTypeBadge } from "@/components/categorias/CategoryTypeBadge";

interface Props {
  cat: TreeNode;
  index: number;
  isSelected: boolean;
  isCollapsed: boolean;
  onToggleSelect: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onEdit: (cat: Category) => void;
  onAddChild: (cat: Category) => void;
  onDelete: (id: string) => void;
  onToggleActive: (cat: TreeNode, active: boolean) => void;
  companyMap: Map<string, string>;
  catCompanyMap: Map<string, string[]>;
}

export function CategoryRow({
  cat,
  index,
  isSelected,
  isCollapsed,
  onToggleSelect,
  onToggleCollapse,
  onEdit,
  onAddChild,
  onDelete,
  onToggleActive,
  companyMap,
  catCompanyMap,
}: Props) {
  const isGroup = cat.depth === 0;
  const guides = categoryGuideLevels(cat.depth);
  const isActive = (cat as any).is_active !== false;


  return (
    <Draggable key={cat.id} draggableId={cat.id} index={index}>
      {(provided, snapshot) => (
        <TableRow
          ref={provided.innerRef}
          {...provided.draggableProps}
          data-state={isSelected ? "selected" : undefined}
          className={`group ${snapshot.isDragging ? "bg-muted shadow-md" : ""} ${isGroup ? "bg-muted/30" : ""} ${isActive ? "" : "opacity-60"}`}
        >
          <TableCell className="py-1.5 px-2 md:px-4">
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onToggleSelect(cat.id)}
              aria-label={`Selecionar categoria ${cat.name}`}
            />
          </TableCell>
          <TableCell className="hidden md:table-cell py-1.5 px-1">
            <div
              {...provided.dragHandleProps}
              aria-label={`Reordenar ${cat.name}`}
              className="flex items-center justify-center rounded cursor-grab active:cursor-grabbing text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-opacity"
            >
              <GripVertical className="h-4 w-4" aria-hidden />
            </div>
          </TableCell>
          <TableCell className="py-1.5 min-w-0">
            <div className="flex min-w-0 items-stretch">
              {guides.map((g) => (
                <span
                  key={g}
                  aria-hidden
                  className="shrink-0 border-l border-border/60"
                  style={{ width: CATEGORY_INDENT_STEP }}
                />
              ))}
              <div className="flex min-w-0 flex-1 items-center gap-1">
                {cat.hasChildren ? (
                  <button
                    type="button"
                    onClick={() => onToggleCollapse(cat.id)}
                    aria-label={isCollapsed ? `Expandir ${cat.name}` : `Recolher ${cat.name}`}
                    aria-expanded={!isCollapsed}
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <ChevronRight
                      aria-hidden
                      className={`h-3.5 w-3.5 transition-transform ${isCollapsed ? "" : "rotate-90"}`}
                    />
                  </button>
                ) : (
                  <span className="w-[22px]" />
                )}
                <div
                  aria-hidden
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: cat.color ?? "hsl(var(--primary))" }}
                />
                <span className="w-1 shrink-0" />
                {cat.hasChildren ? (
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-hidden
                    onClick={() => onToggleCollapse(cat.id)}
                    className={`text-left text-sm truncate hover:underline ${isGroup ? "font-semibold uppercase tracking-wide" : ""}`}
                  >
                    {isGroup ? cat.name.toUpperCase() : cat.name}
                  </button>
                ) : (
                  <span className={`text-sm truncate ${isGroup ? "font-semibold uppercase tracking-wide" : ""}`}>
                    {isGroup ? cat.name.toUpperCase() : cat.name}
                  </span>
                )}
                {cat.hasChildren && <span className="sr-only">{cat.name}</span>}
                <span className="sr-only">, nível {cat.depth + 1}</span>
              </div>
            </div>
          </TableCell>

          <TableCell className="hidden md:table-cell py-1.5 text-center">
            <CategoryTypeBadge type={cat.transaction_type} />
          </TableCell>
          <TableCell className="py-1.5 hidden md:table-cell">
            <div className="flex items-center gap-1 flex-wrap">
              {(catCompanyMap.get(cat.id) || []).map((compId) => (
                <Badge key={compId} variant="outline" className="text-[10px] h-4 px-1.5">
                  {companyMap.get(compId) ?? "Empresa"}
                </Badge>
              ))}
              {!(catCompanyMap.get(cat.id) || []).length && (
                <span className="text-[10px] text-muted-foreground">Sem visibilidade</span>
              )}
            </div>
          </TableCell>
          <TableCell className="py-1.5 hidden md:table-cell text-center">
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Switch
                      checked={isActive}
                      onCheckedChange={(v) => onToggleActive(cat, v)}
                      aria-label={`${isActive ? "Bloquear" : "Permitir"} lançamentos em ${cat.name}`}
                    />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>{isActive ? "Permite lançamentos" : "Bloqueada para lançamentos"}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </TableCell>



          <TableCell className="py-1.5 text-right">
            <div className="flex justify-end gap-0.5">
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Adicionar subcategoria em ${cat.name}`}
                      className="h-8 w-8 text-muted-foreground hover:text-primary"
                      onClick={() => onAddChild(cat)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top"><p>Adicionar subcategoria</p></TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Editar ${cat.name}`}
                      className="h-8 w-8 text-muted-foreground hover:text-primary"
                      onClick={() => onEdit(cat)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top"><p>Editar</p></TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Excluir ${cat.name}`}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => onDelete(cat.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top"><p>Excluir</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </TableCell>
        </TableRow>
      )}
    </Draggable>
  );
}
