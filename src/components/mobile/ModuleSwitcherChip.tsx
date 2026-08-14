import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, LayoutGrid, Check } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useActiveModule, MODULE_LABEL, type ActiveModule } from "@/hooks/useActiveModule";
import { useCompanyModules } from "@/hooks/useCompanyModules";
import { MODULES, isModuleUsable } from "@/lib/modules";

const MODULE_TO_ACTIVE: Record<string, ActiveModule> = {
  financeiro: "financeiro",
  dp: "dp",
  crm: "crm",
  rh: "rh",
  pedidos: "pedidos",
};

export function ModuleSwitcherChip() {
  const active = useActiveModule();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { getStatus } = useCompanyModules();

  // Hide on hub/admin/portal — nothing to switch there.
  if (active === "hub" || active === "admin" || active === "portal_colaborador") return null;

  const label = MODULE_LABEL[active] ?? "Módulo";

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 h-9 text-sm font-medium min-w-0 max-w-[34vw] hover:bg-muted/50 transition-colors"
          aria-label="Trocar de módulo"
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="text-left">Trocar de módulo</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-2">
          {MODULES.filter(
            (mod) => !mod.parent && mod.available && isModuleUsable(getStatus(mod.slug)),
          ).map((mod) => {

            const activeSlug = MODULE_TO_ACTIVE[mod.slug];
            const usable = true;
            const isActive = activeSlug === active;
            const Icon = mod.icon;
            return (
              <button
                key={mod.slug}
                disabled={!usable}
                onClick={() => {
                  setOpen(false);
                  navigate(mod.entryRoute);
                }}
                className={cn(
                  "w-full min-h-14 flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                  isActive ? "border-primary bg-primary/10" : "hover:bg-muted/50",
                  !usable && "opacity-50 cursor-not-allowed",
                )}
              >
                <Icon className="h-5 w-5 shrink-0 text-primary" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{mod.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {usable ? mod.description : "Não contratado"}
                  </div>
                </div>
                {isActive && <Check className="h-4 w-4 text-primary shrink-0" />}
              </button>
            );
          })}
        </div>

        <Button
          variant="outline"
          className="mt-4 h-11 w-full justify-start gap-2"
          onClick={() => {
            setOpen(false);
            navigate("/hub");
          }}
        >
          <LayoutGrid className="h-4 w-4" />
          Conhecer outros módulos
        </Button>
      </SheetContent>
    </Sheet>
  );
}
