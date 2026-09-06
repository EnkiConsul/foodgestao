import { Helmet } from "react-helmet-async";
import { useState } from "react";
import { format } from "date-fns";
import { ArrowLeftRight, Ban, Calendar, User, MessageSquare, Check, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DpPage, DpPageHeader, useDpEmbedded } from "@/components/dp/DpPage";
import { RecusaDialog } from "@/components/dp/RecusaDialog";
import { useDpTrocas } from "@/hooks/useDpTrocas";
import { acoesGestorTroca, textoDecisaoGestor } from "@/lib/dp/troca-acoes";
import { cn } from "@/lib/utils";


const statusMeta: Record<string, { label: string; className: string }> = {
  pendente_colega: {
    label: "Aguardando colega",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40",
  },
  pendente_gestor: {
    label: "Aguardando gestor",
    className: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/40",
  },
  aprovada: {
    label: "Aprovada",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
  },
  recusada: {
    label: "Recusada",
    className: "bg-destructive/15 text-destructive border-destructive/40",
  },
  cancelada: {
    label: "Cancelada",
    className: "bg-muted text-muted-foreground border-border",
  },
};

export default function DpTrocas() {
  const embedded = useDpEmbedded();
  const [filtro, setFiltro] = useState<string>("todos");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [recusa, setRecusa] = useState<string | null>(null);
  const [cancelamento, setCancelamento] = useState<string | null>(null);

  const {
    rows,
    isLoading,
    responder: responderMut,
    cancelar: cancelarMut,
    remover,
  } = useDpTrocas(filtro);

  const list = { isLoading };
  const filtered = rows;

  const responder = {
    isPending: responderMut.isPending,
    mutate: (vars: { id: string; aceito: boolean; obs?: string }) =>
      responderMut.mutate(vars, { onSuccess: () => setRecusa(null) }),
  };

  const cancelar = {
    isPending: cancelarMut.isPending,
    mutate: (vars: { id: string; motivo: string }) =>
      cancelarMut.mutate(vars, { onSuccess: () => setCancelamento(null) }),
  };

  const del = {
    mutate: (id: string) => remover.mutate(id, { onSuccess: () => setConfirmDel(null) }),
  };



  return (
    <DpPage>
      {!embedded && (
        <Helmet><title>Trocas — Pessoas 360°</title></Helmet>
      )}
      <DpPageHeader
        icon={ArrowLeftRight}
        title="Histórico de Trocas Inteligentes"
        description="Acompanhe as permutas temporárias entre colaboradores."
        actions={
          <div className="flex items-center gap-2">
            <select
              className="bg-background border border-border rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
            >
              <option value="todos">Todos os Status</option>
              <option value="pendente_colega">Aguardando colega</option>
              <option value="pendente_gestor">Aguardando gestor</option>
              <option value="aprovada">Aprovadas</option>
              <option value="recusada">Recusadas</option>
              <option value="cancelada">Canceladas</option>
            </select>
          </div>
        }
      />

      <div className="grid gap-4">
        {list.isLoading ? (
          <div className="bg-card border border-border rounded-2xl p-12 text-center text-muted-foreground">
            Carregando…
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-12 text-center text-muted-foreground">
            Nenhuma troca encontrada com este filtro.
          </div>
        ) : (
          filtered.map((r) => {
            const meta = statusMeta[r.status] ?? { label: r.status, className: "bg-muted text-muted-foreground border-border" };
            const acoes = acoesGestorTroca(r.status, r.modo);
            const decisao = textoDecisaoGestor(r.gestor_resposta);
            return (
              <div key={r.id} className="bg-card border border-border rounded-2xl p-4 sm:p-5 space-y-4 hover:shadow-md transition-shadow">
                <div className="flex flex-col md:flex-row md:flex-wrap md:items-center md:justify-between gap-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 md:gap-8 flex-1 min-w-0">
                    <div className="space-y-1 min-w-0">
                      <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                        <User className="size-3" /> Solicitante
                      </div>
                      <div className="font-bold truncate">{r.solicitante?.nome ?? "—"}</div>
                    </div>

                    <div className="space-y-1 min-w-0">
                      <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                        <User className="size-3" /> Destinatário
                      </div>
                      <div className="font-bold truncate">{r.destino?.nome ?? "Aguardando..."}</div>
                    </div>

                    <div className="space-y-1 min-w-0">
                      <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                        <Calendar className="size-3" /> Data da Troca
                      </div>
                      <div className="font-bold text-primary text-sm">
                        {r.data_original ? format(new Date(r.data_original), "dd/MM/yyyy") : "—"}
                        {r.data_proposta && (
                          <span className="text-muted-foreground font-normal"> ↔ {format(new Date(r.data_proposta), "dd/MM/yyyy")}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between md:justify-end gap-3 md:gap-3 w-full md:w-auto">
                    <div className="text-left md:text-right">
                      <Badge className={cn("border", meta.className)}>{meta.label}</Badge>
                      <div className="text-[10px] text-muted-foreground mt-1">
                        Solicitada em {new Date(r.created_at).toLocaleDateString("pt-BR")}
                      </div>
                    </div>
                    <Button size="icon" variant="ghost" className="min-h-11 min-w-11" onClick={() => setConfirmDel(r.id)} title="Excluir">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {r.motivo && (
                  <div className="bg-muted/30 p-3 rounded-xl border border-border/50 flex items-start gap-2">
                    <MessageSquare className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="text-xs text-muted-foreground">
                      <span className="font-bold uppercase text-[9px] block mb-0.5">Motivo informado pelo colaborador:</span>
                      "{r.motivo}"
                    </div>
                  </div>
                )}

                {(r.colega_resposta || decisao) && (
                  <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                    {r.colega_resposta && <span><b>Colega:</b> {r.colega_resposta}</span>}
                    {decisao && (
                      <span>
                        <b>Justificativa do gestor:</b> "{decisao}"
                        {r.gestor_respondido_em && (
                          <> — {format(new Date(r.gestor_respondido_em), "dd/MM/yyyy HH:mm")}</>
                        )}
                      </span>
                    )}
                  </div>
                )}

                {(acoes.aprovar || acoes.recusar || acoes.cancelar) && (
                  <div className="grid grid-cols-1 sm:flex sm:flex-wrap sm:items-center gap-2 pt-1">
                    {acoes.aprovar && (
                      <Button size="sm" className="min-h-11 w-full sm:w-auto" onClick={() => responder.mutate({ id: r.id, aceito: true })}>
                        <Check className="h-4 w-4 mr-1" /> Aprovar troca
                      </Button>
                    )}
                    {acoes.recusar && (
                      <Button size="sm" variant="outline" className="min-h-11 w-full sm:w-auto" onClick={() => setRecusa(r.id)}>
                        <X className="h-4 w-4 mr-1" /> Recusar troca
                      </Button>
                    )}
                    {acoes.cancelar && (
                      <Button size="sm" variant="outline" className="min-h-11 w-full sm:w-auto" onClick={() => setCancelamento(r.id)}>
                        <Ban className="h-4 w-4 mr-1" /> Cancelar troca
                      </Button>
                    )}
                    {r.status === "pendente_gestor" && !acoes.aprovar && (
                      <span className="text-xs text-muted-foreground">
                        Nesta unidade a troca é direta: vale o aceite do colega.
                      </span>
                    )}
                  </div>
                )}

              </div>
            );
          })
        )}
      </div>

      <AlertDialog open={!!confirmDel} onOpenChange={(v) => !v && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta troca?</AlertDialogTitle>
            <AlertDialogDescription>
              A solicitação será removida permanentemente. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmDel && del.mutate(confirmDel)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RecusaDialog
        open={!!recusa}
        onOpenChange={(v) => !v && setRecusa(null)}
        title="Recusar troca"
        description="Informe o motivo da recusa. Ele fica registrado e visível aos dois colaboradores envolvidos."
        motivoObrigatorio
        loading={responder.isPending}
        onConfirm={(motivo) => recusa && responder.mutate({ id: recusa, aceito: false, obs: motivo })}
      />

      <RecusaDialog
        open={!!cancelamento}
        onOpenChange={(v) => !v && setCancelamento(null)}
        title="Cancelar troca aprovada"
        description="Informe o motivo do cancelamento. As folgas voltam ao estado anterior e os dois colaboradores são avisados."
        motivoObrigatorio
        loading={cancelar.isPending}
        onConfirm={(motivo) => cancelamento && cancelar.mutate({ id: cancelamento, motivo })}
      />

    </DpPage>
  );
}
