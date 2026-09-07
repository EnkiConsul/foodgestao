import type { ReactNode } from "react";
import { TabsList } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { DpSectionSelect, type DpSection } from "@/components/dp/DpSectionSelect";

/**
 * Barra de abas padrão do módulo Pessoas.
 * Mobile: com até 3 abas curtas mantém a faixa rolável; com mais que isso,
 * quando `sections` é informado, vira um seletor de seção (folha inferior).
 * Desktop: TabsList normal.
 */
export function DpTabsBar({
  children,
  className,
  sections,
  value,
  onValueChange,
  sectionTitle,
}: {
  children: ReactNode;
  className?: string;
  /** Seções equivalentes às abas — habilita o seletor mobile. */
  sections?: DpSection[];
  value?: string;
  onValueChange?: (value: string) => void;
  sectionTitle?: string;
}) {
  const usarSeletor = Boolean(sections && sections.length > 3 && value !== undefined && onValueChange);

  return (
    <>
      {usarSeletor && (
        <div className="md:hidden">
          <DpSectionSelect
            sections={sections!}
            value={value!}
            onValueChange={onValueChange!}
            title={sectionTitle}
          />
        </div>
      )}
      <div
        className={cn(
          "dp-tabsbar -mx-3 overflow-x-auto px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:overflow-visible md:px-0 md:pb-0",
          usarSeletor && "hidden md:block",
        )}
      >
        <TabsList className={cn("w-max md:w-auto", className)}>{children}</TabsList>
      </div>
    </>
  );
}
