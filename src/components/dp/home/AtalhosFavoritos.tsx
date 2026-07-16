import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Star, GripVertical } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, rectSortingStrategy, useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDpUserPrefs } from "@/hooks/useDpUserPrefs";
import { cn } from "@/lib/utils";

export type Atalho = { icon: LucideIcon; label: string; to: string };

export function AtalhosFavoritos({ items }: { items: Atalho[] }) {
  const { prefs, save } = useDpUserPrefs();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const ordered = useMemo(() => {
    const map = new Map(items.map((i) => [i.label, i]));
    const chosen = prefs.favoritos.map((l) => map.get(l)).filter(Boolean) as Atalho[];
    const rest = items.filter((i) => !prefs.favoritos.includes(i.label));
    return [...chosen, ...rest];
  }, [items, prefs.favoritos]);

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = ordered.findIndex((i) => i.label === active.id);
    const newIdx = ordered.findIndex((i) => i.label === over.id);
    const next = arrayMove(ordered, oldIdx, newIdx);
    save({ favoritos: next.map((i) => i.label) });
  };

  return (
    <div className="rounded-2xl border-2 border-[hsl(var(--dp-border))] bg-white p-5">
      <div className="flex items-center gap-2 mb-4">
        <Star className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Atalhos Favoritos</h2>
        <span className="text-xs text-muted-foreground">(arraste para reordenar)</span>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ordered.map((i) => i.label)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {ordered.map((it) => (
              <SortableAtalho key={it.label} item={it} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableAtalho({ item }: { item: Atalho }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.label });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative flex flex-col items-center justify-center gap-2 aspect-square rounded-2xl border-2 border-dashed border-[hsl(var(--dp-border))] hover:border-primary hover:bg-accent transition-colors p-4",
        isDragging && "opacity-50 z-10",
      )}
    >
      <button
        {...attributes}
        {...listeners}
        aria-label={`Reordenar ${item.label}`}
        className="absolute top-1 right-1 p-1 text-muted-foreground/50 hover:text-foreground cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <Link to={item.to} className="flex flex-col items-center justify-center gap-2 h-full w-full">
        <item.icon className="h-6 w-6 text-primary" />
        <span className="text-sm font-medium text-center">{item.label}</span>
      </Link>
    </div>
  );
}
