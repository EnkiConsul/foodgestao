import { SidebarTrigger } from "@/components/ui/sidebar";
import { ContextSelector } from "@/components/layout/ContextSelector";
import { DpNotificacoesBell } from "@/components/dp/DpNotificacoesBell";

export function DpHeader({ variant = "admin" }: { variant?: "admin" | "portal" }) {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-[hsl(var(--dp-border))] bg-white/80 backdrop-blur px-4">
      <SidebarTrigger />
      {variant === "admin" && <ContextSelector />}
      <div className="flex-1" />
      <DpNotificacoesBell />
    </header>
  );
}
