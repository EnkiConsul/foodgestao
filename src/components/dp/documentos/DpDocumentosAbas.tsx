import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { FileUp, ListChecks, NotebookPen, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import { DpSectionSelect } from "@/components/dp/DpSectionSelect";

const ABAS = [
  { to: "/dp/documentos", label: "Importar", icon: FileUp, end: true },
  { to: "/dp/documentos/historico", label: "Histórico", icon: ListChecks, end: false },
  { to: "/dp/documentos/recibos", label: "Recibos", icon: Receipt, end: false },
  { to: "/dp/documentos/atas", label: "Atas", icon: NotebookPen, end: false },
];

/** Abas de Documentos: seletor de seção no celular, faixa de abas no computador. */
export function DpDocumentosAbas() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const ativa =
    [...ABAS].sort((a, b) => b.to.length - a.to.length).find((a) => (a.end ? pathname === a.to : pathname.startsWith(a.to)))?.to ?? ABAS[0].to;
  return (
    <>
      <div className="md:hidden">
        <DpSectionSelect
          sections={ABAS.map((a) => ({ value: a.to, label: a.label }))}
          value={ativa}
          onValueChange={(v) => navigate(v)}
          title="Seções de Documentos"
        />
      </div>
      <nav aria-label="Abas de Documentos" className="hidden md:block">
        <div className="inline-flex h-10 items-center gap-1 rounded-md bg-muted p-1 text-muted-foreground">
          {ABAS.map((a) => (
            <NavLink
              key={a.to}
              to={a.to}
              end={a.end}
              className={({ isActive }) =>
                cn(
                  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all",
                  isActive ? "bg-background text-foreground shadow-sm" : "hover:text-foreground",
                )
              }
            >
              <a.icon className="h-4 w-4" />
              {a.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  );
}
