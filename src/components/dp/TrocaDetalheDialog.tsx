import { format } from "date-fns";
import { ArrowLeftRight, Ban, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DpDialogShell } from "@/components/dp/DpDialogShell";
import { dataComDiaSemana, metaStatusTroca } from "@/lib/dp/troca-apresentacao";
import type { DpTrocaRow } from "@/hooks/useDpTrocas";
import { acoesGestorTroca, textoDecisaoGestor } from "@/lib/dp/troca-acoes";
import { cn } from "@/lib/utils";

function dataHora(iso: string | null) {
  return iso ? format(new Date(iso), "dd/MM/yyyy HH:mm") : null;
}

function PessoaBloco({
  papel,
  pessoa,
}: {
  papel: string;
  pessoa: DpTrocaRow["solicitante"];
}) {
  return (
    <div className="space-y-1 rounded-xl border border-border/60 bg-muted/30 p-3">
      <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        {papel}
      </div>
      <div className="font-bold">{pessoa?.nome ?? "Aguardando..."}</div>
      <div className="text-xs text-muted-foreground">Cargo: {pessoa?.cargo?.nome ?? "—"}</div>
      <div className="text-xs text-muted-foreground">Unidade: {pessoa?.unidade?.nome ?? "—"}</div>
      <div className="text-xs text-muted-foreground">Matrícula: {pessoa?.matricula ?? "—"}</div>
    </div>
  );
}

function Linha({ titulo, quando, texto }: { titulo: string; quando: string | null; texto?: string | null }) {
  return (
    <li className="border-l-2 border-border pl-3">
      <div className="text-sm font-semibold">{titulo}</div>
      {quando && <div className="text-xs text-muted-foreground">{quando}</div>}
      {texto && <div className="mt-0.5 text-xs text-muted-foreground">"{texto}"</div>}
    </li>
  );
}

interface TrocaDetalheDialogProps {
  troca: DpTrocaRow | null;
  onOpenChange: (open: boolean) => void;
  onAprovar: (id: string) => void;
  onRecusar: (id: string) => void;
  onCancelar: (id: string) => void;
}

/** Detalhes completos de uma troca de folga, com as ações do gestor no rodapé. */
export function TrocaDetalheDialog({
  troca,
  onOpenChange,
  onAprovar,
  onRecusar,
  onCancelar,
}: TrocaDetalheDialogProps) {
  if (!troca) return null;

  const meta = metaStatusTroca(troca.status);
  const acoes = acoesGestorTroca(troca.status, troca.modo);
  const decisao = textoDecisaoGestor(troca.gestor_resposta);
  const modoTexto =
    troca.modo === "direta"
      ? "Nesta unidade a troca é direta: vale o aceite do colega."
      : troca.modo === "proibida"
        ? "Nesta unidade a troca de folga está desativada."
        : "Nesta unidade a troca precisa da aprovação do gestor.";

  return (
    <DpDialogShell
      open={!!troca}
      onOpenChange={onOpenChange}
      icon={ArrowLeftRight}
      title="Detalhes da troca"
      description={modoTexto}
      footer={
        acoes.aprovar || acoes.recusar || acoes.cancelar ? (
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
            {acoes.aprovar && (
              <Button className="min-h-11" onClick={() => onAprovar(troca.id)}>
                <Check className="mr-1 h-4 w-4" /> Aprovar troca
              </Button>
            )}
            {acoes.recusar && (
              <Button variant="outline" className="min-h-11" onClick={() => onRecusar(troca.id)}>
                <X className="mr-1 h-4 w-4" /> Recusar troca
              </Button>
            )}
            {acoes.cancelar && (
              <Button variant="outline" className="min-h-11" onClick={() => onCancelar(troca.id)}>
                <Ban className="mr-1 h-4 w-4" /> Cancelar troca
              </Button>
            )}
          </div>
        ) : undefined
      }
    >
      <div className="space-y-4">
        <Badge className={cn("border", meta.className)}>{meta.label}</Badge>

        <div className="grid gap-3 sm:grid-cols-2">
          <PessoaBloco papel="Solicitante" pessoa={troca.solicitante} />
          <PessoaBloco papel="Colega" pessoa={troca.destino} />
        </div>

        <div className="space-y-2 rounded-xl border border-border/60 p-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Folgas envolvidas
          </div>
          <div className="text-sm">
            <b>{dataComDiaSemana(troca.data_original, true)}</b> — hoje é folga de{" "}
            {troca.solicitante?.nome ?? "—"}; depois da troca passa para{" "}
            {troca.destino?.nome ?? "—"}.
          </div>
          <div className="text-sm">
            <b>{dataComDiaSemana(troca.data_proposta, true)}</b> — hoje é folga de{" "}
            {troca.destino?.nome ?? "—"}; depois da troca passa para{" "}
            {troca.solicitante?.nome ?? "—"}.
          </div>
        </div>

        {troca.motivo && (
          <div className="space-y-1 rounded-xl border border-border/60 p-3">
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Motivo do pedido
            </div>
            <p className="whitespace-pre-wrap text-sm">{troca.motivo}</p>
          </div>
        )}

        <div className="space-y-2">
          <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Histórico
          </div>
          <ul className="space-y-2">
            <Linha titulo="Pedido enviado" quando={dataHora(troca.created_at)} />
            {troca.colega_resposta && (
              <Linha
                titulo="Resposta do colega"
                quando={dataHora(troca.colega_respondido_em)}
                texto={troca.colega_resposta}
              />
            )}
            {(decisao || troca.gestor_respondido_em) && (
              <Linha
                titulo={
                  troca.status === "expirada"
                    ? "Solicitação expirada"
                    : troca.status === "cancelada"
                      ? "Cancelada pelo gestor"
                      : troca.status === "recusada"
                        ? "Recusada pelo gestor"
                        : "Decisão do gestor"
                }
                quando={dataHora(troca.gestor_respondido_em)}
                texto={decisao}
              />
            )}
          </ul>
        </div>
      </div>
    </DpDialogShell>
  );
}
