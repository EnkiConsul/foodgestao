import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TableCell, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronRight, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { Draggable } from "@hello-pangea/dnd";
import type { Category, TreeNode } from "@/lib/categories/tree";
import { categoryIndent } from "@/lib/categories/display";
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
  companyMap,
  catCompanyMap,
}: Props) {
  return (
    <Draggable key={cat.id} draggableId={cat.id} index={index}>
      {(provided, snapshot) => (
        <TableRow
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={`group ${snapshot.isDragging ? "bg-muted shadow-md" : ""}`}
        >
          <TableCell className="py-1.5 px-2 md:px-4">
            <Checkbox checked={isSelected} onCheckedChange={() => onToggleSelect(cat.id)} />
          </TableCell>
          <TableCell className="hidden md:table-cell py-1.5 px-1">
            <div
              {...provided.dragHandleProps}
              className="flex items-center justify-center cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
            >
              <GripVertical className="h-4 w-4" />
            </div>
          </TableCell>
          <TableCell className="py-1.5 min-w-0">
            <div
              className="flex min-w-0 items-center gap-1"
              style={{ paddingLeft: categoryIndent(cat.depth) }}
            >
              {cat.hasChildren ? (
                <button
                  onClick={() => onToggleCollapse(cat.id)}
                  className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                >
                  <ChevronRight className={`h-3.5 w-3.5 transition-transform ${isCollapsed ? "" : "rotate-90"}`} />
                </button>
              ) : (
                <span className="w-[18px]" />
              )}
              <div
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: cat.color ?? "hsl(var(--primary))" }}
              />
              <span className="w-1 shrink-0" />
              <span className={`text-sm truncate ${cat.depth === 0 ? "font-semibold uppercase" : ""}`}>
                {cat.depth === 0 ? cat.name.toUpperCase() : cat.name}
              </span>
            </div>
          </TableCell>
          <TableCell className="hidden md:table-cell py-1.5 text-center">
            <CategoryTypeBadge type={cat.transaction_type} />
          </TableCell>
          <TableCell className="py-1.5 hidden md:table-cell">
            <div className="flex items-center gap-1 flex-wrap">
              {(cat as any).visible_pf && (
                <Badge variant="outline" className="text-[10px] h-4 px-1.5">PF</Badge>
              )}
              {(catCompanyMap.get(cat.id) || []).map((compId) => (
                <Badge key={compId} variant="outline" className="text-[10px] h-4 px-1.5">
                  {companyMap.get(compId) ?? "Empresa"}
                </Badge>
              ))}
              {!(cat as any).visible_pf && !(catCompanyMap.get(cat.id) || []).length && (
                <span className="text-[10px] text-muted-foreground">Sem visibilidade</span>
              )}
            </div>
          </TableCell>
          <TableCell className="py-1.5 text-right">
            <div className="flex justify-end gap-0.5">
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={() => onAddChild(cat)}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top"><p>Adicionar filho</p></TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={() => onEdit(cat)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top"><p>Editar</p></TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => onDelete(cat.id)}>
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
