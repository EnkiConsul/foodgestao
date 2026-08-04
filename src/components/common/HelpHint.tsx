import { HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface HelpHintProps {
  /** Texto curto explicando a funcionalidade. */
  text: string;
  /** Rótulo acessível; padrão: "Ajuda". */
  label?: string;
  className?: string;
}

/**
 * Ícone de interrogação com explicação curta.
 * Abre por hover/foco (desktop, via Tooltip) e por clique/toque (mobile, via Popover).
 */
export function HelpHint({ text, label = "Ajuda", className }: HelpHintProps) {
  return (
    <TooltipProvider delayDuration={150}>
      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={label}
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                  className
                )}
              >
                <HelpCircle className="h-4 w-4" />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[260px] text-xs leading-snug">
            {text}
          </TooltipContent>
        </Tooltip>
        <PopoverContent side="top" align="start" className="w-[260px] text-xs leading-snug">
          {text}
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}
