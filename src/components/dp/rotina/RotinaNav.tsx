import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, BellRing, Calendar, ClipboardList, HeartPulse, Palmtree } from "lucide-react";
import { NavigationCard } from "@/components/dp/NavigationCard";
import { DpSectionSelect } from "@/components/dp/DpSectionSelect";
import { useDpEmbedded } from "@/components/dp/DpPage";

const TELAS = [
  { to: "/dp/folgas", label: "Folgas", icon: Calendar, description: "Solicitações, trocas e regras." },
  { to: "/dp/ferias", label: "Férias", icon: Palmtree, description: "Programação e recibos." },
  { to: "/dp/ocorrencias", label: "Ocorrências", icon: ClipboardList, description: "Faltas, atrasos e coberturas." },
  { to: "/dp/convocacoes", label: "Convocações", icon: BellRing, description: "Chamados de intermitentes." },
  { to: "/dp/atestados", label: "Atestados e Licenças", icon: HeartPulse, description: "Afastamentos e licenças." },
];

/** Cards de acesso às telas da Rotina (topo do calendário). */
export function RotinaCards() {
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {TELAS.map((t) => (
        <NavigationCard key={t.to} title={t.label} description={t.description} to={t.to} icon={t.icon} />
      ))}
    </div>
  );
}

/** Nas telas internas: voltar para Rotina e trocar de tela em 1 toque. */
export function RotinaSubNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const embedded = useDpEmbedded();
  if (embedded) return null;
  const atual = TELAS.find((t) => pathname.startsWith(t.to))?.to ?? TELAS[0].to;
  return (
    <div className="flex items-center gap-2">
      <Link
        to="/dp/rotina"
        className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl px-2 text-sm font-medium text-primary hover:bg-muted"
      >
        <ArrowLeft className="h-4 w-4" /> Rotina
      </Link>
      <div className="min-w-0 flex-1 md:max-w-xs">
        <DpSectionSelect
          title="Rotina"
          sections={TELAS.map((t) => ({ value: t.to, label: t.label }))}
          value={atual}
          onValueChange={(v) => navigate(v)}
        />
      </div>
    </div>
  );
}
