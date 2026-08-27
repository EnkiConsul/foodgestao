import { AlertTriangle, Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { OriginChange } from "@/hooks/useOriginChanges";

const brl = (v: number | null) =>
  v === null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dia = (v: string | null) => {
  if (!v) return "—";
  const [y, m, d] = v.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : v;
};

interface Props {
  changes: OriginChange[];
  resolvingId: string | null;
  onResolve: (changeId: string, accept: boolean) => void;
}

/**
 * Faixa "Revisar": o banco alterou a versão de um lançamento já conciliado.
 * Nada é aplicado sem uma escolha explícita do usuário.
 */
export function OriginChangesBanner({ changes, resolvingId, onResolve }: Props) {
  if (changes.length === 0) return null;

  return (
    <Card className="border-warning/40 bg-warning/5">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold">
              Revisar {changes.length} lançamento(s) alterado(s) no banco
            </p>
            <p className="text-xs text-muted-foreground">
              O banco mudou valor, data ou descrição depois da conciliação. Nada foi alterado
              automaticamente — escolha aceitar a nova versão ou manter a atual.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {changes.map((c) => {
            const busy = resolvingId === c.id;
            return (
              <div
                key={c.id}
                className="rounded-md border bg-background p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 text-xs space-y-1">
                  <p className="font-medium truncate">
                    {c.incoming.description || c.previous.description || "Sem descrição"}
                  </p>
                  <p className="text-muted-foreground">
                    Atual: {brl(c.previous.amount)} · {dia(c.previous.transaction_date)}
                    {"  →  "}
                    Banco: <span className="text-foreground font-medium">{brl(c.incoming.amount)}</span> ·{" "}
                    {dia(c.incoming.transaction_date)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => onResolve(c.id, false)}>
                    <X className="h-3.5 w-3.5 mr-1" /> Manter atual
                  </Button>
                  <Button size="sm" disabled={busy} onClick={() => onResolve(c.id, true)}>
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5 mr-1" />
                    )}
                    Aceitar do banco
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
