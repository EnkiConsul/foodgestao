import { NavLink } from "react-router-dom";
import { FileUp, ListChecks, NotebookPen, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";

const ABAS = [
  { to: "/dp/documentos", label: "Importar", icon: FileUp, end: true },
  { to: "/dp/documentos/historico", label: "Histórico", icon: ListChecks, end: false },
  { to: "/dp/documentos/recibos", label: "Recibos", icon: Receipt, end: false },
  { to: "/dp/documentos/atas", label: "Atas", icon: NotebookPen, end: false },
];

/** Atalhos entre as abas de Documentos do gestor (Importar, Histórico e Recibos). */
export function DpDocumentosAbas() {
  return (
    <nav aria-label="Abas de Documentos" className="-mx-3 overflow-x-auto px-3 md:mx-0 md:px-0">
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
  );
}
