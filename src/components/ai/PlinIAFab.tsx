import { Sparkles } from "lucide-react";
import { openPlinIA } from "@/components/ai/plin-ia-controller";
import { cn } from "@/lib/utils";

export function PlinIAFab() {
  return (
    <button
      type="button"
      onClick={() => openPlinIA()}
      className={cn(
        "fixed bottom-24 right-4 md:bottom-6 md:right-6 z-40",
        "h-14 w-14 rounded-full shadow-lg shadow-primary/40",
        "bg-gradient-to-br from-primary to-[#6366f1] text-primary-foreground",
        "flex items-center justify-center transition-transform hover:scale-105 hover:rotate-12",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
      )}
      aria-label="Abrir Plin IA"
      title="Pergunte ao Plin IA"
    >
      <Sparkles className="h-6 w-6" />
      <span className="sr-only">Pergunte ao Plin IA</span>
      <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-success ring-2 ring-background animate-pulse" />
    </button>
  );
}
