import type { ReactNode } from "react";
import { TabsList } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { DpSectionSelect, type DpSection } from "@/components/dp/DpSectionSelect";
import { HelpHint } from "@/components/ui/help-hint";
import { HELP_CONTENT, type HelpKey } from "@/content/help/helpContent";

/**
 * Barra de abas padrão do módulo Pessoas.
 * Mobile: com até 3 abas curtas mantém a faixa rolável; com mais que isso,
 * quando `sections` é informado, vira um seletor de seção (folha inferior).
 * Desktop: TabsList normal.
 *
 * Quando `help` é informado, a ajuda da seção ativa aparece ao lado das abas
 * (fora dos gatilhos, para nunca aninhar botão dentro de botão).
 */
export function DpTabsBar({
  children,
  className,
  sections,
  value,
  onValueChange,
  sectionTitle,
  help,
}: {
  children: ReactNode;
  className?: string;
  /** Seções equivalentes às abas — habilita o seletor mobile. */
  sections?: DpSection[];
  value?: string;
  onValueChange?: (value: string) => void;
  sectionTitle?: string;
  /** Ajuda por aba: valor da aba → chave de conteúdo. */
  help?: Partial<Record<string, HelpKey>>;
}) {
  const usarSeletor = Boolean(sections && sections.length > 3 && value !== undefined && onValueChange);
  const helpKey = help && value ? help[value] : undefined;
  const ajuda = helpKey ? (
    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
      <span className="hidden sm:inline">{HELP_CONTENT[helpKey].titulo}</span>
      <HelpHint helpKey={helpKey} side="bottom" align="end" />
    </span>
  ) : null;

  return (
    <>
      {usarSeletor && (
        <div className="md:hidden flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <DpSectionSelect
              sections={sections!}
              value={value!}
              onValueChange={onValueChange!}
              title={sectionTitle}
            />
          </div>
          {ajuda}
        </div>
      )}
      <div
        className={cn(
          "dp-tabsbar flex items-center gap-2 -mx-3 max-w-full overflow-x-auto px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:px-0 md:pb-0 lg:overflow-visible",
          usarSeletor && "hidden md:flex",
        )}
      >
        <TabsList className={cn("w-max lg:w-auto", className)}>{children}</TabsList>
        {ajuda}
      </div>
    </>
  );
}
