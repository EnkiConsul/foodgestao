import { useState } from "react";
import { toast } from "sonner";
import { Check, X, PencilLine } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PONTO_TIPO_LABEL, type PontoTipo } from "@/lib/dp/ponto";
import { AJUSTE_ACAO_LABEL, useDpPontoAjustes, type PontoAjusteRow } from "@/hooks/useDpPontoAjustes";

const rotuloDia = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

const statusVariant = (status: string) =>
  status === "aprovado" ? "default" : status === "recusado" ? "destructive" : "secondary";

interface Props {
  colaboradorId?: string | null;
}

export function PontoAjustesAdmin({ colaboradorId }: Props) {
  const [somentePendentes, setSomentePendentes] = useState(true);
  const { ajustes, isLoading, analisar } = useDpPontoAjustes(colaboradorId ?? null, somentePendentes);

  const decidir = (row: PontoAjusteRow, aprovar: boolean) =>
    analisar.mutate(
      { id: row.id, aprovar },
      {
        onSuccess: () => toast.success(aprovar ? "Ajuste aprovado e aplicado." : "Ajuste recusado."),
        onError: (e: unknown) => toast.error((e as Error).message ?? "Não foi possível analisar o ajuste."),
      },
    );

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <PencilLine className="h-4 w-4 text-primary" />
          Ajustes de Ponto
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={() => setSomentePendentes((v) => !v)}>
          {somentePendentes ? "Ver Histórico" : "Ver Pendentes"}
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : !ajustes.length ? (
          <p className="p-4 text-sm text-muted-foreground">
            {somentePendentes ? "Nenhum ajuste pendente." : "Nenhuma solicitação registrada."}
          </p>
        ) : (
          <ul className="divide-y">
            {ajustes.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-medium">
                    {a.dp_colaboradores?.nome ?? "Colaborador"} · {rotuloDia(a.data)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {AJUSTE_ACAO_LABEL[a.acao]} · {PONTO_TIPO_LABEL[a.tipo as PontoTipo]}
                    {a.hora_solicitada ? ` para ${a.hora_solicitada}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">Motivo: {a.motivo}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={statusVariant(a.status)}>{a.status}</Badge>
                  {a.status === "pendente" && (
                    <>
                      <Button size="sm" variant="outline" disabled={analisar.isPending} onClick={() => decidir(a, false)}>
                        <X className="h-4 w-4" />
                      </Button>
                      <Button size="sm" disabled={analisar.isPending} onClick={() => decidir(a, true)}>
                        <Check className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
