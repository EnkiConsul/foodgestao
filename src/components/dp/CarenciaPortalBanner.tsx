import { AlertTriangle, Info } from "lucide-react";
import { usePortalAcesso } from "@/hooks/usePortalAcesso";
import { diasRestantesCarencia } from "@/lib/dp/desligamento";

/**
 * Banner exibido a colaboradores em modo de consulta.
 *
 * Dois motivos distintos, com mensagens diferentes:
 * - desligado dentro do prazo de carência (mostra a data-limite);
 * - empresa em situação comercial suspensa (aviso neutro, sem expor a
 *   pendência financeira do empregador ao colaborador).
 */
export function CarenciaPortalBanner() {
  const { somenteDocumentos, acessoAte, estado } = usePortalAcesso();
  if (!somenteDocumentos) return null;

  if (estado === "empresa_suspensa_leitura") {
    return (
      <div className="mx-3 mt-3 rounded-xl border border-border bg-muted/50 p-3 text-xs">
        <div className="flex items-start gap-2">
          <Info className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-semibold">Portal em modo de consulta</div>
            <p className="text-muted-foreground mt-0.5">
              Você continua podendo ver e baixar seus contracheques, documentos e sua ficha. Novas
              solicitações estão indisponíveis no momento. Em caso de dúvidas, procure o setor de
              pessoal.
            </p>
          </div>
        </div>
      </div>
    );
  }

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

/** Indica se o colaborador logado está em modo de consulta (somente documentos). */
export function useCarenciaPortal() {
  const { somenteDocumentos, isLoading } = usePortalAcesso();
  return { somenteLeitura: somenteDocumentos, isLoading };
}
