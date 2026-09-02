import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronRight, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import type { Category, TreeNode } from "@/lib/categories/tree";
import { CATEGORY_INDENT_STEP, categoryGuideLevels } from "@/lib/categories/display";
import { CategoryTypeBadge } from "@/components/categorias/CategoryTypeBadge";

interface Props {
  cat: TreeNode;
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

/** Linha de categoria otimizada para toque (renderizada abaixo de md). */
export function CategoryMobileRow({
  cat,
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
  const companies = catCompanyMap.get(cat.id) || [];
  const isActive = (cat as any).is_active !== false;

  return (
    <li
      role="treeitem"
      aria-level={cat.depth + 1}
      aria-selected={isSelected}
      aria-expanded={cat.hasChildren ? !isCollapsed : undefined}
      className={`flex items-stretch gap-2 px-2 py-2 ${isGroup ? "bg-muted/40" : ""} ${isActive ? "" : "opacity-60"}`}
    >

      <div className="flex items-center pl-1">
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelect(cat.id)}
          aria-label={`Selecionar categoria ${cat.name}`}
          className="h-5 w-5"
        />
      </div>

      {guides.map((g) => (
        <span
          key={g}
          aria-hidden
          className="shrink-0 border-l border-border/60"
          style={{ width: CATEGORY_INDENT_STEP }}
        />
      ))}

      {cat.hasChildren ? (
        <button
          type="button"
          onClick={() => onToggleCollapse(cat.id)}
          aria-label={isCollapsed ? `Expandir ${cat.name}` : `Recolher ${cat.name}`}
          aria-expanded={!isCollapsed}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <ChevronRight aria-hidden className={`h-4 w-4 transition-transform ${isCollapsed ? "" : "rotate-90"}`} />
        </button>
      ) : (
        <span className="w-8 shrink-0" aria-hidden />
      )}

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 py-0.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            aria-hidden
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: cat.color ?? "hsl(var(--primary))" }}
          />
          <span className={`truncate text-sm ${isGroup ? "font-semibold uppercase tracking-wide" : ""}`}>
            {isGroup ? cat.name.toUpperCase() : cat.name}
          </span>
          <span className="sr-only">, nível {cat.depth + 1}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <CategoryTypeBadge type={cat.transaction_type} />
          {companies.map((compId) => (
            <Badge key={compId} variant="outline" className="h-4 px-1.5 text-[10px]">
              {companyMap.get(compId) ?? "Empresa"}
            </Badge>
          ))}
          {companies.length === 0 && (
            <span className="text-[10px] text-muted-foreground">Sem visibilidade</span>
          )}
          {!isActive && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">Bloqueada</Badge>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center self-center">
        <Switch
          checked={isActive}
          onCheckedChange={(v) => onToggleActive(cat, v)}
          aria-label={`${isActive ? "Bloquear" : "Permitir"} lançamentos em ${cat.name}`}
        />
      </div>




      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Ações para ${cat.name}`}
            className="h-11 w-11 shrink-0 self-center text-muted-foreground"
          >
            <MoreVertical aria-hidden className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onAddChild(cat)}>
            <Plus className="mr-2 h-4 w-4" /> Adicionar subcategoria
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onEdit(cat)}>
            <Pencil className="mr-2 h-4 w-4" /> Editar
          </DropdownMenuItem>
          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(cat.id)}>
            <Trash2 className="mr-2 h-4 w-4" /> Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
