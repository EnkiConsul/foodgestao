import { Sparkles } from "lucide-react";
import { SidebarGroup, SidebarGroupContent } from "@/components/ui/sidebar";

export function ComingSoonMenu({ label }: { label: string }) {
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <div className="mx-2 rounded-lg border border-dashed border-sidebar-border/60 px-4 py-6 text-center">
          <Sparkles className="h-5 w-5 mx-auto text-sidebar-foreground/60 mb-2" />
          <p className="text-xs text-sidebar-foreground/70 font-medium">{label}</p>
          <p className="text-[11px] text-sidebar-foreground/80 mt-1">Em breve</p>
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
