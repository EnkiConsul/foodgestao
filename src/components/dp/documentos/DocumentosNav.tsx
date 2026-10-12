import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, BookOpen, History, Receipt, ShieldAlert } from "lucide-react";
import { NavigationCard } from "@/components/dp/NavigationCard";
import { DpSectionSelect } from "@/components/dp/DpSectionSelect";

const TELAS = [
  { to: "/dp/documentos/historico", label: "Histórico", icon: History, description: "Todos os documentos enviados à equipe." },
  { to: "/dp/documentos/recibos", label: "Recibos", icon: Receipt, description: "Emita e acompanhe recibos assinados." },
  { to: "/dp/documentos/atas", label: "Atas de Reunião", icon: BookOpen, description: "Registros de reuniões e presenças." },
  { to: "/dp/disciplinar", label: "Disciplinares", icon: ShieldAlert, description: "Advertências, suspensões e elogios." },
];

/** Cards de acesso às telas de Documentos (topo da tela principal). */
export function DocumentosCards() {
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
      {TELAS.map((t) => (
        <NavigationCard key={t.to} title={t.label} description={t.description} to={t.to} icon={t.icon} />
      ))}
    </div>
  );
}

/** Nas telas internas: voltar para Documentos e trocar de tela em 1 toque. */
export function DocumentosSubNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const atual = TELAS.find((t) => pathname.startsWith(t.to))?.to ?? TELAS[0].to;
  return (
    <div className="flex items-center gap-2">
      <Link
        to="/dp/documentos"
        className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl px-2 text-sm font-medium text-primary hover:bg-muted"
      >
        <ArrowLeft className="h-4 w-4" /> Documentos
      </Link>
      <div className="min-w-0 flex-1 md:max-w-xs">
        <DpSectionSelect
          title="Documentos"
          sections={TELAS.map((t) => ({ value: t.to, label: t.label }))}
          value={atual}
          onValueChange={(v) => navigate(v)}
        />
      </div>
    </div>
  );
}
