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
import { resolveFavorites } from "@/components/dp/favoritablePages";
import { cn } from "@/lib/utils";

export type Atalho = { icon: LucideIcon; label: string; to: string };

/**
 * Grid de atalhos favoritos.
 *
 * Sem `items`: monta-se dinamicamente a partir de `prefs.extras.favoritos_paginas`
 * (URLs escolhidas via ⭐ no header, inclusive rotas dinâmicas). A ordem é persistida
 * em `prefs.favoritos` — agora armazenando as URLs, não os labels, para suportar
 * rotas dinâmicas com labels iguais.
 *
 * Com `items` (legado): usa a lista passada como fixa.
 */
export function AtalhosFavoritos({ items }: { items?: Atalho[] } = {}) {
  const { prefs, favoritePages, save } = useDpUserPrefs();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const source: Atalho[] = useMemo(() => {
    if (items && items.length > 0) return items;
    return resolveFavorites(favoritePages).map((p) => ({
      icon: p.icon,
      label: p.label,
      to: p.route,
    }));
  }, [items, favoritePages]);

  const ordered = useMemo(() => {
    const map = new Map(source.map((i) => [i.to, i]));
    const chosen = prefs.favoritos.map((key) => map.get(key)).filter(Boolean) as Atalho[];
    const rest = source.filter((i) => !prefs.favoritos.includes(i.to));
    return [...chosen, ...rest];
  }, [source, prefs.favoritos]);

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = ordered.findIndex((i) => i.to === active.id);
    const newIdx = ordered.findIndex((i) => i.to === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(ordered, oldIdx, newIdx);
    save({ favoritos: next.map((i) => i.to) });
  };

  return (
    <div className="rounded-2xl border-2 border-[hsl(var(--dp-border))] bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Star className="h-5 w-5 text-primary fill-primary" />
        <h2 className="text-lg font-semibold">Atalhos Favoritos</h2>
        {ordered.length > 0 && (
          <span className="text-xs text-muted-foreground">(arraste para reordenar)</span>
        )}
      </div>
      {ordered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
          <Star className="h-8 w-8 opacity-40" />
          <p className="text-sm max-w-sm">
            Clique na <Star className="inline h-4 w-4 -mt-0.5 text-primary" /> no topo de qualquer
            página do DP para adicioná-la aqui como atalho.
          </p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ordered.map((i) => i.to)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {ordered.map((it) => (
                <SortableAtalho key={it.to} item={it} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

function SortableAtalho({ item }: { item: Atalho }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.to });
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
      <Link
        to={item.to}
        title={item.to}
        className="flex flex-col items-center justify-center gap-2 h-full w-full"
      >
        <item.icon className="h-6 w-6 text-primary" />
        <span className="text-sm font-medium text-center line-clamp-2">{item.label}</span>
      </Link>
    </div>
  );
}

