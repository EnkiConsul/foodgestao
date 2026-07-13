import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { useContabeisPending } from "@/hooks/useContabeisReport";
import { brl } from "@/lib/format-contabil";

interface Props {
  from: string;
  to: string;
}

export function PendingClassificationPanel({ from, to }: Props) {
  const { data = [], isLoading } = useContabeisPending(from, to);

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-warning" />
          Pendências de Classificação
          <Badge variant="secondary" className="ml-2">
            {data.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {isLoading && <p className="text-muted-foreground">Carregando…</p>}
        {!isLoading && data.length === 0 && (
          <p className="text-muted-foreground py-6 text-center">
            Nenhuma pendência — todas as transações estão classificadas em uma conta contábil.
          </p>
        )}
        {data.length > 0 && (
          <div className="rounded-md border">
            <div className="grid grid-cols-[90px_1fr_140px_120px] gap-2 px-2 py-2 bg-muted/60 text-xs font-medium text-muted-foreground border-b">
              <span>Data</span>
              <span>Descrição</span>
              <span>Motivo</span>
              <span className="text-right">Valor</span>
            </div>
            {data.map((r) => (
              <div
                key={r.transaction_id}
                className="grid grid-cols-[90px_1fr_140px_120px] gap-2 px-2 py-2 border-b border-border/40"
              >
                <span className="text-muted-foreground tabular-nums text-xs">
                  {format(new Date(r.data), "dd/MM/yyyy")}
                </span>
                <span className="truncate">{r.descricao}</span>
                <Badge variant="outline" className="text-[10px] w-fit">
                  {r.motivo}
                </Badge>
                <span className="text-right tabular-nums">{brl(Number(r.valor))}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
