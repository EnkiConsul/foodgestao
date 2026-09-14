import { AlertTriangle } from "lucide-react";
import { usePortalAcesso } from "@/hooks/usePortalAcesso";
import { diasRestantesCarencia } from "@/lib/dp/desligamento";

/** Banner exibido a colaboradores desligados durante o período de carência do portal. */
export function CarenciaPortalBanner() {
  const { somenteDocumentos, acessoAte } = usePortalAcesso();
  if (!somenteDocumentos) return null;

  const dias = diasRestantesCarencia(acessoAte) ?? 0;

  return (
    <div className="mx-3 mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div>
          <div className="font-semibold text-amber-700 dark:text-amber-400">
            Acesso encerra em {dias} {dias === 1 ? "dia" : "dias"}
          </div>
          <p className="text-muted-foreground mt-0.5">
            Seu vínculo foi encerrado. Você ainda pode consultar e baixar seus documentos até{" "}
            <strong>
              {acessoAte ? new Date(`${acessoAte}T12:00:00`).toLocaleDateString("pt-BR") : "—"}
            </strong>
            . Folgas, trocas, férias, convocações e novas solicitações estão desativadas.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Indica se o colaborador logado está em período de carência (somente documentos). */
export function useCarenciaPortal() {
  const { somenteDocumentos, isLoading } = usePortalAcesso();
  return { somenteLeitura: somenteDocumentos, isLoading };
}
