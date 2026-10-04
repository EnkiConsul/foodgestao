import { ArrowLeftRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBR, parseYMD } from "@/lib/dp/folga-rules";
import {
  STATUS_SUBST, useCancelarSubstituicao, useDpSubstituicoes, useResponderConviteColega,
} from "@/hooks/useDpSubstituicoes";

/** Convites recebidos de colegas e pedidos de passar plantão feitos pelo próprio colaborador. */
export function MeusPlantoesTrocaCard({ colaboradorId }: { colaboradorId: string | null }) {
  const lista = useDpSubstituicoes();
  const responder = useResponderConviteColega();
  const cancelar = useCancelarSubstituicao();
  if (!colaboradorId) return null;
  const todos = lista.data ?? [];
  const convites = todos.filter((s) => s.colega_id === colaboradorId && s.status === "aguardando_colega");
  const meus = todos.filter((s) => s.solicitante_id === colaboradorId).slice(0, 10);
  if (convites.length === 0 && meus.length === 0) return null;

  const dia = (s: (typeof todos)[number]) =>
    s.convocacao ? `${formatBR(parseYMD(s.convocacao.data))} · ${String(s.convocacao.entrada).slice(0, 5)}–${String(s.convocacao.saida).slice(0, 5)}` : "";

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-black">
          <ArrowLeftRight className="size-4 text-primary" /> Trocas de plantão
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {convites.map((s) => (
          <div key={s.id} className="space-y-2 rounded-xl border border-primary/40 bg-primary/5 p-3">
            <p><strong>{s.solicitante?.nome}</strong> quer passar o plantão de {dia(s)} para você.</p>
            {s.motivo ? <p className="text-xs text-muted-foreground">Motivo: {s.motivo}</p> : null}
            <div className="flex gap-2">
              <Button size="sm" disabled={responder.isPending} onClick={() => responder.mutate({ id: s.id, aceitar: true })}>
                Assumir plantão
              </Button>
              <Button size="sm" variant="outline" disabled={responder.isPending} onClick={() => responder.mutate({ id: s.id, aceitar: false })}>
                Recusar
              </Button>
            </div>
          </div>
        ))}
        {meus.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
            <div className="min-w-0">
              <p className="font-medium">{dia(s)}</p>
              <p className="text-xs text-muted-foreground">
                Para {s.tipo === "colega" ? s.colega?.nome : `${s.terceiro_nome} (folguista)`}
                {s.decisao_motivo ? ` · ${s.decisao_motivo}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={s.status === "aprovada" ? "default" : "outline"} className="text-[10px]">
                {STATUS_SUBST[s.status]}
              </Badge>
              {(s.status === "aguardando_colega" || s.status === "pendente_aprovacao") && (
                <Button size="sm" variant="ghost" disabled={cancelar.isPending} onClick={() => cancelar.mutate(s.id)}>
                  Cancelar
                </Button>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
