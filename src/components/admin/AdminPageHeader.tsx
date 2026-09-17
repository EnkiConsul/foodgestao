import { useLocation } from "react-router-dom";

import { toTitleCase } from "@/lib/titleCase";
import { HelpHint } from "@/components/ui/help-hint";
import type { HelpKey } from "@/content/help/helpContent";
import { resolveHelpForPath } from "@/content/help/helpRoutes";

interface AdminPageHeaderProps {
  title: string;
  description?: string;
  /** Ajuda contextual do título; se omitida, usa o registro da rota atual. */
  help?: HelpKey | null;
}

export function AdminPageHeader({ title, description, help }: AdminPageHeaderProps) {
  const { pathname } = useLocation();
  const helpKey = help === null ? undefined : (help ?? resolveHelpForPath(pathname));
  return (
    <div>
      <h1 className="flex items-center gap-1 text-xl md:text-2xl font-bold tracking-tight">
        {toTitleCase(title)}
        {helpKey && <HelpHint helpKey={helpKey} size="md" side="bottom" align="start" />}
      </h1>
      {description && <p className="text-muted-foreground text-xs md:text-sm">{description}</p>}
    </div>
  );
}
