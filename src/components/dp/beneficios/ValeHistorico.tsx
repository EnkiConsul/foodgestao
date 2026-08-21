import { History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DpContentCard } from "@/components/dp/DpPage";
import { DpErrorState } from "@/components/dp/DpErrorState";
import { useDpValeHistorico } from "@/hooks/useDpValeApuracoes";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const competenciaLabel = (iso: string) => {
  const [ano, mes] = iso.slice(0, 7).split("-");
  return `${mes}/${ano}`;
};

/** Ciclos de vales já fechados, para conferência e auditoria. */
export function ValeHistorico() {
  const { grupos, isLoading, isError, refetch } = useDpValeHistorico();

  if (isError) return <DpErrorState onRetry={refetch} />;

  return (
    <DpContentCard>
      {isLoading ? (
        <p className="p-6 text-center text-sm text-muted-foreground">Carregando…</p>
      ) : grupos.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">
          Nenhum ciclo fechado ainda. Feche o cálculo mensal para alimentar o histórico e o mês seguinte.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {grupos.map((g) => (
            <div
              key={`${g.competencia}-${g.tipo}`}
              className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-4"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <History className="size-4 text-primary" aria-hidden="true" />
                  {competenciaLabel(g.competencia)}
                  <Badge variant="secondary" className="text-[11px]">
                    {g.tipo === "va" ? "Vale-alimentação" : "Vale-transporte"}
                  </Badge>
                </p>
                <p className="text-xs text-muted-foreground">
                  {g.colaboradores} colaborador(es) · {g.totalDias} dia(s)
                  {g.diferenca !== 0 && ` · ${g.diferenca > 0 ? "+" : ""}${g.diferenca} do ciclo anterior`}
                </p>
              </div>
              <p className="text-sm font-semibold">{brl(g.valor)}</p>
            </div>
          ))}
        </div>
      )}
    </DpContentCard>
  );
}
