import { HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface CategoryGuidance {
  name?: string | null;
  ai_description?: string | null;
  guidance_include?: string | null;
  guidance_exclude?: string | null;
  examples?: string | null;
  keywords?: string[] | null;
}

export function hasGuidance(cat?: CategoryGuidance | null): boolean {
  if (!cat) return false;
  return Boolean(
    cat.guidance_include ||
      cat.guidance_exclude ||
      cat.examples ||
      cat.ai_description ||
      (cat.keywords && cat.keywords.length > 0),
  );
}

function GuidanceBody({ cat }: { cat: CategoryGuidance }) {
  return (
    <div className="space-y-2 text-xs">
      {cat.guidance_include && (
        <div>
          <p className="font-semibold">O que lançar aqui</p>
          <p className="text-muted-foreground">{cat.guidance_include}</p>
        </div>
      )}
      {cat.guidance_exclude && (
        <div>
          <p className="font-semibold">O que NÃO lançar aqui</p>
          <p className="text-muted-foreground">{cat.guidance_exclude}</p>
        </div>
      )}
      {cat.examples && (
        <div>
          <p className="font-semibold">Exemplos</p>
          <p className="text-muted-foreground">{cat.examples}</p>
        </div>
      )}
      {!cat.guidance_include && !cat.guidance_exclude && !cat.examples && cat.ai_description && (
        <p className="text-muted-foreground">{cat.ai_description}</p>
      )}
      {cat.keywords && cat.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {cat.keywords.slice(0, 10).map((k) => (
            <Badge key={k} variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">
              {k}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

/** Ícone de ajuda com a orientação da categoria (usado ao lado do label). */
export function CategoryGuidanceTooltip({ cat }: { cat: CategoryGuidance }) {
  if (!hasGuidance(cat)) return null;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`Orientação da categoria ${cat.name ?? ""}`}
            className="text-muted-foreground hover:text-foreground"
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs">
          <p className="mb-1 text-xs font-semibold">{cat.name}</p>
          <GuidanceBody cat={cat} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Bloco de orientação exibido abaixo do campo depois de escolher a categoria. */
export function CategoryGuidancePanel({ cat }: { cat: CategoryGuidance }) {
  if (!hasGuidance(cat)) return null;
  return (
    <div className="rounded-md border border-border bg-muted/40 p-2.5">
      <GuidanceBody cat={cat} />
    </div>
  );
}
