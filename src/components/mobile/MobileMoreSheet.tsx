import { useNavigate, useLocation } from "react-router-dom";
import { LayoutGrid, LogOut } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import type { MoreGroup } from "@/config/mobileNav";
import { cn } from "@/lib/utils";
import { useState } from "react";

type Props = {
  groups: MoreGroup[];
  trigger: React.ReactNode;
};

export function MobileMoreSheet({ groups, trigger }: Props) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);

  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b">
          <SheetTitle className="text-left">Mais opções</SheetTitle>
          <Button
            variant="outline"
            className="mt-2 h-11 w-full justify-start gap-2"
            onClick={() => go("/hub")}
          >
            <LayoutGrid className="h-4 w-4" />
            Acompanhar módulos (Hub)
          </Button>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {groups.map((group) => (
            <section key={group.label}>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {group.label}
              </h3>
              <div className="rounded-xl border bg-card overflow-hidden">
                {group.items.map((item, i) => {
                  const Icon = item.icon;
                  const active = pathname === item.to || pathname.startsWith(item.to + "/");
                  return (
                    <button
                      key={item.to}
                      onClick={() => go(item.to)}
                      className={cn(
                        "w-full min-h-11 flex items-center gap-3 px-4 py-3 text-left transition-colors",
                        i > 0 && "border-t",
                        active ? "bg-primary/10 text-primary" : "hover:bg-muted/50",
                      )}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      <span className="text-sm font-medium">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}

          <button
            onClick={async () => {
              setOpen(false);
              await signOut();
            }}
            className="w-full min-h-11 flex items-center gap-3 px-4 py-3 rounded-xl border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="h-5 w-5" />
            <span className="text-sm font-medium">Sair</span>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
