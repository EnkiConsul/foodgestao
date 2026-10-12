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

/** Título da tela que vira lista suspensa para alternar entre as telas da Rotina/Documentos. */
export function RotinaTituloMenu({ atual, children, telas = TELAS_ROTINA, rotulo = "Trocar de tela da Rotina", icon: Icon }: {
  atual: string; children: React.ReactNode;
  telas?: { to: string; label: string; icon: React.ComponentType<{ className?: string }> }[];
  rotulo?: string;
  /** Ícone da tela, desenhado dentro do botão para alinhar sempre. */
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="-ml-1.5 inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-muted px-2.5 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={rotulo}
      >
        {Icon && <Icon className="h-5 w-5 shrink-0 text-primary sm:h-7 sm:w-7" aria-hidden="true" />}
        {children}
        <ChevronDown className="h-5 w-5 shrink-0 text-primary/80 sm:h-6 sm:w-6" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        {telas.map((t) => {
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
