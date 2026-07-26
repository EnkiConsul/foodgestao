import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { MODULE_LABEL, useActiveModule } from "@/hooks/useActiveModule";

export function MoreHeader() {
  const navigate = useNavigate();
  const activeModule = useActiveModule();
  const { contextType, selectedCompanyId, companies } = useCompanyContext();

  const company = companies.find((c) => c.id === selectedCompanyId);
  const primary =
    contextType === "pj" && company
      ? (company.trade_name || company.name)
      : "360°FOOD";
  const secondary = MODULE_LABEL[activeModule];

  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3 bg-background/95 backdrop-blur border-b">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground truncate">
          {secondary}
        </p>
        <h1 className="text-base font-semibold truncate">{primary}</h1>
      </div>
      <button
        type="button"
        onClick={() => navigate("/dp/notificacoes")}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border bg-card active:scale-95 transition"
        aria-label="Notificações"
      >
        <Bell className="h-5 w-5" />
      </button>
    </header>
  );
}
