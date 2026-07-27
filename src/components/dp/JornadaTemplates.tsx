import { Moon, Sun, Sunrise, Sunset, Truck, Briefcase, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DpJornadaForm } from "@/hooks/useDpJornadas";
import { resumoJornadaTexto, type HorarioDia } from "@/lib/dp/jornada-utils";

export interface JornadaTemplate {
  id: string;
  nome: string;
  icone: LucideIcon;
  descricao: string;
  form: Omit<DpJornadaForm, "nome"> & { nome: string };
}

const dias = (lista: number[], entrada: string, saida: string, intervalo: number): HorarioDia[] =>
  lista.map((d) => ({ dia_semana: d, entrada, saida, intervalo_minutos: intervalo }));

export const JORNADA_TEMPLATES: JornadaTemplate[] = [
  {
    id: "6x1-manha",
    nome: "6x1 Manhã",
    icone: Sunrise,
    descricao: "Seg–Sex 08:00–17:00 · Sáb 08:00–14:00",
    form: {
      nome: "6x1 Manhã",
      descricao: null,
      tipo_escala: "6x1",
      turno: "matutino",
      ativo: true,
      observacoes: null,
      horarios: [
        ...dias([1, 2, 3, 4, 5], "08:00", "17:00", 60),
        ...dias([6], "08:00", "14:00", 30),
      ],
    },
  },
  {
    id: "6x1-tarde",
    nome: "6x1 Tarde",
    icone: Sun,
    descricao: "Seg–Sáb 14:00–22:00",
    form: {
      nome: "6x1 Tarde",
      descricao: null,
      tipo_escala: "6x1",
      turno: "vespertino",
      ativo: true,
      observacoes: null,
      horarios: dias([1, 2, 3, 4, 5, 6], "14:00", "22:00", 60),
    },
  },
  {
    id: "6x1-noite",
    nome: "6x1 Noite",
    icone: Moon,
    descricao: "Seg–Sáb 17:00–01:00 (vira o dia)",
    form: {
      nome: "6x1 Noite",
      descricao: null,
      tipo_escala: "6x1",
      turno: "noturno",
      ativo: true,
      observacoes: null,
      horarios: dias([1, 2, 3, 4, 5, 6], "17:00", "01:00", 60),
    },
  },
  {
    id: "5x2-adm",
    nome: "5x2 Administrativo",
    icone: Briefcase,
    descricao: "Seg–Sex 08:00–17:00",
    form: {
      nome: "5x2 Administrativo",
      descricao: null,
      tipo_escala: "5x2",
      turno: "matutino",
      ativo: true,
      observacoes: null,
      horarios: dias([1, 2, 3, 4, 5], "08:00", "17:00", 60),
    },
  },
  {
    id: "12x36",
    nome: "12x36",
    icone: Sunset,
    descricao: "07:00–19:00 em dias alternados",
    form: {
      nome: "12x36",
      descricao: null,
      tipo_escala: "12x36",
      turno: "misto",
      ativo: true,
      observacoes: null,
      horarios: dias([1, 3, 5], "07:00", "19:00", 60),
    },
  },
  {
    id: "delivery",
    nome: "Delivery",
    icone: Truck,
    descricao: "Ter–Dom 17:00–23:00",
    form: {
      nome: "Delivery",
      descricao: null,
      tipo_escala: "6x1",
      turno: "noturno",
      ativo: true,
      observacoes: null,
      horarios: dias([2, 3, 4, 5, 6, 0], "17:00", "23:00", 30),
    },
  },
  {
    id: "personalizada",
    nome: "Personalizada",
    icone: SlidersHorizontal,
    descricao: "Monte a semana do zero",
    form: {
      nome: "",
      descricao: null,
      tipo_escala: "personalizada",
      turno: "misto",
      ativo: true,
      observacoes: null,
      horarios: [],
    },
  },
];

interface Props {
  selecionado?: string | null;
  onSelect: (t: JornadaTemplate) => void;
}

export function JornadaTemplates({ selecionado, onSelect }: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {JORNADA_TEMPLATES.map((t) => {
        const Icone = t.icone;
        const ativo = selecionado === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t)}
            aria-pressed={ativo}
            className={cn(
              "flex min-h-[76px] w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors",
              "hover:border-primary/60 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              ativo ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-card",
            )}
          >
            <span
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg",
                ativo ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              <Icone className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-base font-semibold">{t.nome}</span>
              <span className="block truncate text-sm text-muted-foreground">
                {t.form.horarios.length ? resumoJornadaTexto(t.form.horarios) : t.descricao}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
