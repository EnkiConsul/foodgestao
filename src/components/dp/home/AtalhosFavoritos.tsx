import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type Atalho = { icon: LucideIcon; label: string; to: string };

export function AtalhosFavoritos({ items }: { items: Atalho[] }) {
  return (
    <div className="rounded-2xl border-2 border-[hsl(var(--dp-border))] bg-white p-5">
      <div className="flex items-center gap-2 mb-4">
        <Star className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Atalhos Favoritos</h2>
        <span className="text-xs text-muted-foreground">(acesso rápido)</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {items.map((it) => (
          <Link
            key={it.to}
            to={it.to}
            className="flex flex-col items-center justify-center gap-2 aspect-square rounded-2xl border-2 border-dashed border-[hsl(var(--dp-border))] hover:border-primary hover:bg-accent transition-colors p-4"
          >
            <it.icon className="h-6 w-6 text-primary" />
            <span className="text-sm font-medium text-center">{it.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
