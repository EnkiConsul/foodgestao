import { ClipboardList, Bell, Plane, Settings } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useDpPendencias } from "@/hooks/useDpPendencias";
import { useDpUserPrefs } from "@/hooks/useDpUserPrefs";
import { useDpOcorrencias, FILTROS_PADRAO } from "@/hooks/useDpOcorrencias";
import { useDpFerias } from "@/hooks/useDpFerias";
import { contarAbertas } from "@/lib/dp/pendencias";
import { addDays, format } from "date-fns";

export function KpiCards() {
  const pend = useDpPendencias();
  const { prefs } = useDpUserPrefs();
  const hoje = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const ocorrencias = useDpOcorrencias({ ...FILTROS_PADRAO, data: hoje });
  const { periodos } = useDpFerias("all");
  const vencendo = periodos.filter((p) => p.limite_concessivo && new Date(p.limite_concessivo) <= addDays(new Date(), 60));

  // Fonte única: pendência aberta = não adiada (mema regra do card da Home).
  const pendentesAbertas = useMemo(
    () => contarAbertas(pend.data ?? [], prefs.pendencias_adiadas),
    [pend.data, prefs.pendencias_adiadas],
  );

  const cards = [
    { label: "Ocorrências hoje", value: ocorrencias.ocorrencias.length, icon: ClipboardList, to: "/dp/ocorrencias" },
    { label: "Pendências abertas", value: pendentesAbertas, icon: Bell, to: "/dp/cadastros/pendencias" },
    { label: "Férias vencendo", value: vencendo.length, icon: Plane, to: "/dp/ferias?tab=periodos" },
    { label: "Ajustes", value: null, icon: Settings, to: "/dp/cadastros" },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <Link key={c.label} to={c.to} className="rounded-2xl border-2 border-[hsl(var(--dp-border))] bg-card p-4 hover:border-primary/30 hover:shadow-sm transition-all">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
            <c.icon className="h-4 w-4 text-primary/60" />
          </div>
          {c.value !== null && <p className="text-2xl font-bold mt-1">{c.value}</p>}
          {c.label === "Férias vencendo" && vencendo.length > 0 && (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Próximo: {format(new Date(vencendo[0].limite_concessivo), "dd/MM/yyyy")}
            </p>
          )}
          {c.label === "Ocorrências hoje" && <p className="text-[11px] text-muted-foreground mt-0.5">{format(new Date(), "dd/MM/yyyy")}</p>}
        </Link>
      ))}
    </div>
  );
}
