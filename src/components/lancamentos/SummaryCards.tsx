import { Card, CardContent } from "@/components/ui/card";
import { amountColorClass } from "@/lib/transaction-sign";

type Totals = {
  receitas: number;
  despesas: number;
  aPagar: number;
  aReceber: number;
  atrasadas: number;
};

type Props = {
  totals: Totals;
  formatBRL: (v: number) => string;
};

export function SummaryCards({ totals, formatBRL }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <Card className="shadow-sm">
        <CardContent className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Entradas</p>
          <p className={`text-sm font-bold ${amountColorClass(totals.receitas)}`}>
            {formatBRL(totals.receitas)}
          </p>
        </CardContent>
      </Card>
      <Card className="shadow-sm">
        <CardContent className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Saídas</p>
          <p className={`text-sm font-bold ${amountColorClass(-totals.despesas)}`}>
            {formatBRL(totals.despesas)}
          </p>
        </CardContent>
      </Card>
      <Card className="shadow-sm">
        <CardContent className="p-3 text-center">
          <p className="text-xs text-muted-foreground">A Pagar</p>
          <p className="text-sm font-bold text-destructive">{formatBRL(totals.aPagar)}</p>
        </CardContent>
      </Card>
      <Card className="shadow-sm">
        <CardContent className="p-3 text-center">
          <p className="text-xs text-muted-foreground">A Receber</p>
          <p className="text-sm font-bold text-success">{formatBRL(totals.aReceber)}</p>
        </CardContent>
      </Card>
      <Card className="shadow-sm col-span-2 md:col-span-1">
        <CardContent className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Atrasadas</p>
          <p className={`text-sm font-bold ${totals.atrasadas > 0 ? "text-destructive" : "text-muted-foreground"}`}>
            {totals.atrasadas}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
