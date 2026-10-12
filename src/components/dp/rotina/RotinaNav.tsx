import { useNavigate } from "react-router-dom";
import { BellRing, Calendar, CalendarClock, Check, ChevronDown, ClipboardList, HeartPulse, Palmtree } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export const TELAS_ROTINA = [
  { to: "/dp/rotina", label: "Calendário", icon: CalendarClock },
  { to: "/dp/folgas", label: "Folgas", icon: Calendar },
  { to: "/dp/ferias", label: "Férias", icon: Palmtree },
  { to: "/dp/ocorrencias", label: "Ocorrências", icon: ClipboardList },
  { to: "/dp/convocacoes", label: "Convocações", icon: BellRing },
  { to: "/dp/atestados", label: "Atestados e Licenças", icon: HeartPulse },
];

/** Tela da Rotina correspondente ao endereço (ou null fora do módulo). */
export function telaRotinaDoPath(pathname: string): string | null {
  const t = TELAS_ROTINA.find((t) => pathname === t.to || pathname.startsWith(`${t.to}/`));
  return t?.to ?? null;
}

/** Título da tela que vira lista suspensa para alternar entre as telas da Rotina. */
export function RotinaTituloMenu({ atual, children }: { atual: string; children: React.ReactNode }) {
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex min-h-11 items-center gap-1 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Trocar de tela da Rotina"
      >
        {children}
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground sm:h-5 sm:w-5" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        {TELAS_ROTINA.map((t) => {
          const ativo = t.to === atual;
          return (
            <DropdownMenuItem
              key={t.to}
              onSelect={() => { if (!ativo) navigate(t.to); }}
              className={cn("min-h-11 gap-2", ativo && "font-semibold text-primary")}
            >
              <t.icon className="h-4 w-4" />
              <span className="flex-1">{t.label}</span>
              {ativo && <Check className="h-4 w-4" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
