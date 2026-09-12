import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toTitleCase } from "@/lib/titleCase";

interface NavigationCardProps {
  title: string;
  description?: string;
  to: string;
  icon: LucideIcon;
  count?: number;
  className?: string;
}

/**
 * Card padrão para grids de módulos (hubs). Reutilizável nos hubs de
 * Cadastros, Documentos, Comunicação etc. do Pessoas 360°.
 */
export function NavigationCard({ title, description, to, icon: Icon, count, className }: NavigationCardProps) {
  return (
    <Link to={to} className="group focus:outline-none">
      <Card className={cn("dp-content-card h-full border-[hsl(var(--dp-border))] bg-card transition-colors hover:border-primary/60", className)}>
        <CardContent className="p-3 sm:p-5">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-sm sm:text-base truncate">{toTitleCase(title)}</p>
                {count !== undefined && <span className="text-lg sm:text-2xl font-bold tabular-nums">{count}</span>}
              </div>
              {description && (
                <p className="text-[11px] sm:text-xs text-muted-foreground line-clamp-1 sm:line-clamp-2">{description}</p>
              )}
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 group-hover:text-primary transition-colors ml-1" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
