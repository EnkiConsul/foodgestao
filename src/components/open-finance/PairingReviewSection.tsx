import { AlertTriangle, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePairingReview, useResolvePairingReview } from "@/hooks/useOpenFinance";

function fmtBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
function fmtDate(iso: string) {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
  } catch {
    return iso;
  }
}

export function PairingReviewSection({ companyId }: { companyId: string }) {
  const { data, isLoading } = usePairingReview(companyId);
  const resolve = useResolvePairingReview();

  if (isLoading || !data || data.length === 0) return null;

  return (
    <Card className="border-amber-500/40">
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          <CardTitle className="text-base">Transferências para revisar</CardTitle>
        </div>
        <Badge variant="outline">{data.length}</Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Estes lançamentos pareciam transferências entre contas, mas o par não chegou dentro da janela de 5 dias.
          Confirme se deve manter como lançamento normal ou marcar como transferência sem par (fora dos resultados).
        </p>
        <div className="divide-y">
          {data.map((row) => (
            <div key={row.id} className="py-2 flex flex-wrap items-center gap-2 justify-between">
              <div className="min-w-0 flex-1">
                <div className="text-sm truncate">{row.description}</div>
                <div className="text-xs text-muted-foreground">
                  {fmtDate(row.transaction_date)} · {fmtBRL(row.amount)} ·{" "}
                  <span className="capitalize">{row.transaction_type}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => resolve.mutate({ transaction_id: row.id, action: "keep" })}
                  disabled={resolve.isPending}
                >
                  <Check className="w-3 h-3 mr-1" /> Manter no resultado
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => resolve.mutate({ transaction_id: row.id, action: "exclude" })}
                  disabled={resolve.isPending}
                >
                  <X className="w-3 h-3 mr-1" /> É transferência
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
