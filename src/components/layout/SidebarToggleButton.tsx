import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export function SidebarToggleButton({ className }: { className?: string }) {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("shrink-0", className)}
      onClick={toggleSidebar}
      title={collapsed ? "Expandir menu" : "Recolher menu"}
      aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
    >
      {collapsed ? (
        <ChevronsRight className="h-4 w-4" />
      ) : (
        <ChevronsLeft className="h-4 w-4" />
      )}
    </Button>
  );
}
