import { useState } from "react";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { DpContentCard } from "@/components/dp/DpPage";
import { DpErrorState } from "@/components/dp/DpErrorState";
import { useDpFeriasSolicitacoes, type FeriasSolicitacao } from "@/hooks/useDpFeriasSolicitacoes";
import { useDpFeriasConfig } from "@/hooks/useDpFeriasConfig";

const fmt = (iso: string) => format(parseISO(iso), "dd/MM/yyyy", { locale: ptBR });

/** Pedidos de férias do colaborador, com aprovação e recusa pelo gestor. */
export function FeriasSolicitacoesPanel() {
  const { solicitacoes, isLoading, isError, refetch, aprovar, recusar } = useDpFeriasSolicitacoes();
  const { config } = useDpFeriasConfig();

  const [aprovando, setAprovando] = useState<FeriasSolicitacao | null>(null);
  const [recusando, setRecusando] = useState<FeriasSolicitacao | null>(null);
  const [justificativa, setJustificativa] = useState("");
  const [motivo, setMotivo] = useState("");

  const antecedencia = (s: FeriasSolicitacao) =>
    differenceInCalendarDays(parseISO(s.data_inicio), new Date());
  const emCimaDaHora = (s: FeriasSolicitacao) => antecedencia(s) < config.avisoAntecedenciaDias;

  if (isError) {
    return (
      <DpContentCard contentClassName="p-4">
        <DpErrorState onRetry={refetch} />
      </DpContentCard>
    );
  }

  return (
    <>
      <DpContentCard>
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Carregando…</div>
        ) : solicitacoes.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            Nenhum pedido de férias aguardando aprovação.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {solicitacoes.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0 space-y-1">
                  <p className="truncate font-semibold">{s.colaborador_nome ?? "Colaborador"}</p>
                  <p className="text-sm text-muted-foreground">
                    {fmt(s.data_inicio)} a {fmt(s.data_fim)} · {s.dias} dias
                    {s.dias_abono > 0 && ` + ${s.dias_abono} de abono`}
                    {s.adiantar_13 && " · 13º adiantado"}
                  </p>
                  {s.observacao && (
                    <p className="text-sm text-muted-foreground">“{s.observacao}”</p>
                  )}
                  {emCimaDaHora(s) && (
                    <Badge className="border-amber-400/60 bg-amber-500/10 text-amber-700" variant="outline">
                      Em cima da hora · {antecedencia(s)} dia(s) de antecedência
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => { setJustificativa(""); setAprovando(s); }}
                  >
                    <Check className="mr-1 size-3.5" /> Aprovar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setMotivo(""); setRecusando(s); }}
                  >
                    <X className="mr-1 size-3.5" /> Recusar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </DpContentCard>

      <Dialog open={!!aprovando} onOpenChange={(v) => { if (!v) setAprovando(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Aprovar férias</DialogTitle>
            <DialogDescription>
              {aprovando
                ? `${aprovando.colaborador_nome ?? "Colaborador"} · ${fmt(aprovando.data_inicio)} a ${fmt(aprovando.data_fim)}`
                : ""}
            </DialogDescription>
          </DialogHeader>

          {aprovando && emCimaDaHora(aprovando) && (
            <div className="space-y-2 rounded-xl border border-amber-400/60 bg-amber-500/10 p-3">
              <p className="text-sm font-medium text-amber-700">
                O aviso fica com {antecedencia(aprovando)} dia(s) de antecedência — a empresa pede{" "}
                {config.avisoAntecedenciaDias}.
              </p>
              <Label>Justificativa</Label>
              <Textarea
                rows={2}
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
                placeholder="Explique por que estas férias serão aprovadas em cima da hora."
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setAprovando(null)}>Voltar</Button>
            <Button
              disabled={
                aprovar.isPending ||
                (!!aprovando && emCimaDaHora(aprovando) && justificativa.trim().length < 3)
              }
              onClick={() =>
                aprovando &&
                aprovar.mutate(
                  { id: aprovando.id, justificativa },
                  { onSuccess: () => setAprovando(null) },
                )
              }
            >
              {aprovar.isPending ? "Aprovando…" : "Aprovar e programar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!recusando} onOpenChange={(v) => { if (!v) setRecusando(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Recusar pedido de férias</DialogTitle>
            <DialogDescription>
              {recusando
                ? `${recusando.colaborador_nome ?? "Colaborador"} · ${fmt(recusando.data_inicio)} a ${fmt(recusando.data_fim)}`
                : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label>Motivo</Label>
            <Textarea
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="O colaborador verá esta resposta."
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRecusando(null)}>Voltar</Button>
            <Button
              variant="destructive"
              disabled={recusar.isPending || motivo.trim().length < 3}
              onClick={() =>
                recusando &&
                recusar.mutate(
                  { id: recusando.id, motivo: motivo.trim() },
                  { onSuccess: () => setRecusando(null) },
                )
              }
            >
              {recusar.isPending ? "Recusando…" : "Recusar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
