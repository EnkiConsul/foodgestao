import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, RotateCcw, Building2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { toTitleCase } from "@/lib/titleCase";
import { DP_ADMIN_NAV, DP_PORTAL_NAV, type DpNavSurface } from "@/config/dpNavigation";
import {
  applyMenuLayout,
  extractLayout,
  type DpMenuLayout,
  type DpMenuSurfaceKey,
} from "@/lib/dp/menuLayout";
import { useDpMenuLayout } from "@/hooks/useDpMenuLayout";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  surface?: DpMenuSurfaceKey;
};

function baseSurface(surface: DpMenuSurfaceKey): DpNavSurface {
  return surface === "portal" ? DP_PORTAL_NAV : DP_ADMIN_NAV;
}

function SortableRow({
  id,
  label,
  nested,
  badge,
}: {
  id: string;
  label: string;
  nested?: boolean;
  badge?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 rounded-lg border bg-background px-2 py-2 text-sm",
        nested ? "ml-4 border-dashed text-foreground/80" : "font-medium",
        isDragging && "opacity-70 shadow-md",
      )}
    >
      <button
        type="button"
        className="cursor-grab rounded p-1 text-muted-foreground hover:bg-muted"
        aria-label={`Mover ${label}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="min-w-0 flex-1 truncate">{toTitleCase(label)}</span>
      {badge && (
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          {badge}
        </span>
      )}
    </div>
  );
}

export function OrganizarMenuDialog({ open, onOpenChange, surface = "dp" }: Props) {
  const {
    layout,
    salvar,
    saving,
    restaurarPadrao,
    canSetCompanyDefault,
    definirPadraoDaEmpresa,
    savingCompanyDefault,
  } = useDpMenuLayout(surface);

  const base = baseSurface(surface);
  const resolved = useMemo(() => applyMenuLayout(base, layout), [base, layout]);
  const [draft, setDraft] = useState<DpMenuLayout>(() => extractLayout(resolved));

  useEffect(() => {
    if (open) setDraft(extractLayout(applyMenuLayout(base, layout)));
  }, [open, base, layout]);

  const groupsById = useMemo(
    () => new Map(base.groups.map((g) => [g.id, g])),
    [base.groups],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleGroupDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setDraft((d) => {
      const from = d.groups.indexOf(String(active.id));
      const to = d.groups.indexOf(String(over.id));
      if (from < 0 || to < 0) return d;
      return { ...d, groups: arrayMove(d.groups, from, to) };
    });
  };

  const handleItemDragEnd = (groupId: string) => (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setDraft((d) => {
      const list = d.items[groupId] ?? [];
      const from = list.indexOf(String(active.id));
      const to = list.indexOf(String(over.id));
      if (from < 0 || to < 0) return d;
      return { ...d, items: { ...d.items, [groupId]: arrayMove(list, from, to) } };
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Organizar menu</DialogTitle>
          <DialogDescription>
            Arraste pela alça para mudar a ordem dos grupos e dos itens. Início e
            Configurações permanecem fixos.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[55vh] pr-3">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleGroupDragEnd}>
            <SortableContext items={draft.groups} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {draft.groups.map((groupId) => {
                  const group = groupsById.get(groupId);
                  if (!group) return null;
                  const items = draft.items[groupId] ?? group.items.map((i) => i.to);
                  const itemByRoute = new Map(group.items.map((i) => [i.to, i]));
                  return (
                    <div key={groupId} className="space-y-1">
                      <SortableRow id={groupId} label={group.label} />
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleItemDragEnd(groupId)}
                      >
                        <SortableContext items={items} strategy={verticalListSortingStrategy}>
                          <div className="space-y-1">
                            {items.map((route) => {
                              const item = itemByRoute.get(route);
                              if (!item) return null;
                              return (
                                <SortableRow
                                  key={route}
                                  id={route}
                                  label={item.label}
                                  badge={item.badge}
                                  nested
                                />
                              );
                            })}
                          </div>
                        </SortableContext>
                      </DndContext>
                    </div>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        </ScrollArea>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                restaurarPadrao();
                onOpenChange(false);
              }}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Restaurar padrão
            </Button>
            {canSetCompanyDefault && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={savingCompanyDefault}
                onClick={() => definirPadraoDaEmpresa(draft)}
              >
                <Building2 className="mr-2 h-4 w-4" />
                Definir como padrão da empresa
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={saving}
              onClick={() => {
                salvar(draft);
                onOpenChange(false);
              }}
            >
              Salvar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
