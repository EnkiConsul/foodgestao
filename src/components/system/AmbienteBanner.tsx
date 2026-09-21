import { FlaskConical } from "lucide-react";
import { isHomologacao } from "@/lib/env/appEnv";

/**
 * Tarja permanente de homologação. Não aparece no build de produção.
 */
export function AmbienteBanner() {
  if (!isHomologacao()) return null;

  return (
    <div
      role="status"
      aria-label="Ambiente de homologação"
      className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 bg-destructive px-3 py-1 text-center text-xs font-semibold uppercase tracking-wide text-destructive-foreground shadow-md"
    >
      <FlaskConical className="h-3.5 w-3.5" aria-hidden />
      Ambiente de homologação — dados de teste, integrações externas desligadas
    </div>
  );
}
