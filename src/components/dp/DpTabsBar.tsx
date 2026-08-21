import type { ReactNode } from "react";
import { TabsList } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/**
 * Barra de abas padrão do módulo Pessoas.
 * No mobile rola horizontalmente (sem cortar nem quebrar em duas linhas);
 * no desktop se comporta como um TabsList normal.
 */
export function DpTabsBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="dp-tabsbar -mx-3 overflow-x-auto px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:overflow-visible md:px-0 md:pb-0">
      <TabsList className={cn("w-max md:w-auto", className)}>{children}</TabsList>
    </div>
  );
}
