import { AlertTriangle, ArrowLeftRight, Ban, Building2, Check, MessageSquare, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TextoExpansivel } from "@/components/dp/TextoExpansivel";
import type { DpTrocaRow } from "@/hooks/useDpTrocas";
import { acoesGestorTroca } from "@/lib/dp/troca-acoes";
import { dataComDiaSemana, metaStatusTroca, trocaInconsistente } from "@/lib/dp/troca-apresentacao";
import { cn } from "@/lib/utils";


/** Nome + cargo de um colaborador envolvido na troca. */
function Pessoa({
  papel,
  pessoa,
}: {
  papel: string;
  pessoa: DpTrocaRow["solicitante"];
}) {
  return (
    <div className="min-w-0 space-y-0.5">
      <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        {papel}
      </div>
      <div className="truncate font-bold">{pessoa?.nome ?? "Aguardando..."}</div>
      <div className="truncate text-xs text-muted-foreground">
        {pessoa?.cargo?.nome ?? "Sem cargo"}
      </div>
    </div>
  );
}

interface TrocaCardProps {
  troca: DpTrocaRow;
  onOpen: () => void;
  onAprovar: () => void;
  onRecusar: () => void;
  onCancelar: () => void;
}

/**
 * Cartão da lista de trocas: resumo clicável (abre os detalhes) com as ações
 * do gestor disponíveis direto no cartão.
 */
export function TrocaCard({ troca, onOpen, onAprovar, onRecusar, onCancelar }: TrocaCardProps) {
  const meta = metaStatusTroca(troca.status);
  const acoes = acoesGestorTroca(troca.status, troca.modo);
  const unidade = troca.destino?.unidade?.nome ?? troca.solicitante?.unidade?.nome ?? null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="cursor-pointer space-y-3 rounded-2xl border border-border bg-card p-4 text-left transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge className={cn("border", meta.className)}>{meta.label}</Badge>
        {unidade && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Building2 className="size-3.5" /> {unidade}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <Pessoa papel="Solicitante" pessoa={troca.solicitante} />
        <ArrowLeftRight className="hidden size-4 shrink-0 text-muted-foreground sm:block" />
        <Pessoa papel="Colega" pessoa={troca.destino} />
      </div>

      {inconsistente ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Registro inconsistente: este pedido ficou salvo com a mesma data (ou a mesma pessoa)
            nos dois lados e não representa uma troca real.
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/40 px-3 py-2 text-sm">
          <span className="font-semibold text-primary">{dataComDiaSemana(troca.data_original)}</span>
          <ArrowLeftRight className="size-3.5 text-muted-foreground" />
          <span className="font-semibold text-primary">{dataComDiaSemana(troca.data_proposta)}</span>
        </div>
      )}


      {troca.motivo && (
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <MessageSquare className="mt-0.5 size-3.5 shrink-0" />
          <div className="min-w-0">
            <TextoExpansivel texto={troca.motivo} />
          </div>
        </div>
      )}

      {(acoes.aprovar || acoes.recusar || acoes.cancelar) && (
        <div
          className="grid grid-cols-1 gap-2 pt-1 sm:flex sm:flex-wrap sm:items-center"
          onClick={(e) => e.stopPropagation()}
        >
          {acoes.aprovar && (
            <Button size="sm" className="min-h-11 w-full sm:w-auto" onClick={onAprovar}>
              <Check className="mr-1 h-4 w-4" /> Aprovar troca
            </Button>
          )}
          {acoes.recusar && (
            <Button size="sm" variant="outline" className="min-h-11 w-full sm:w-auto" onClick={onRecusar}>
              <X className="mr-1 h-4 w-4" /> Recusar troca
            </Button>
          )}
          {acoes.cancelar && (
            <Button size="sm" variant="outline" className="min-h-11 w-full sm:w-auto" onClick={onCancelar}>
              <Ban className="mr-1 h-4 w-4" /> Cancelar troca
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
