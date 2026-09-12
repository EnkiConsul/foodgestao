import { ClipboardList, Settings } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useDpOcorrencias, FILTROS_PADRAO } from "@/hooks/useDpOcorrencias";
import { format } from "date-fns";

export function KpiCards() {
  const hoje = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const ocorrencias = useDpOcorrencias({ ...FILTROS_PADRAO, data: hoje });

  const cards = [
    { label: "Ocorrências hoje", value: ocorrencias.ocorrencias.length, icon: ClipboardList, to: "/dp/ocorrencias" },
    { label: "Ajustes", value: null, icon: Settings, to: "/dp/configuracoes" },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {cards.map((c) => (
        <Link key={c.label} to={c.to} className="rounded-2xl border-2 border-[hsl(var(--dp-border))] bg-card p-4 hover:border-primary/30 hover:shadow-sm transition-all">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
            <c.icon className="h-4 w-4 text-primary/60" />
          </div>
          {c.value !== null && <p className="text-2xl font-bold mt-1">{c.value}</p>}
          {c.label === "Ocorrências hoje" && <p className="text-[11px] text-muted-foreground mt-0.5">{format(new Date(), "dd/MM/yyyy")}</p>}
        </Link>
      ))}
    </div>
  );
}
