import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { DpContentCard } from "@/components/dp/DpPage";
import { useDpFerias, type FeriasGozo } from "@/hooks/useDpFerias";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";

const fmt = (iso: string) => format(parseISO(iso), "dd/MM/yyyy", { locale: ptBR });

const GOZO_LABEL: Record<string, string> = {
  planejado: "Aguardando aprovação",
  aprovado: "Programada",
  em_gozo: "Em férias",
  concluido: "Concluída",
  cancelado: "Cancelada",
};

const GOZO_TONE: Record<string, string> = {
  planejado: "bg-amber-500/15 text-amber-600",
  aprovado: "bg-sky-500/15 text-sky-600",
  em_gozo: "bg-primary/15 text-primary",
  concluido: "bg-muted text-muted-foreground",
  cancelado: "bg-destructive/15 text-destructive",
};

type Props = {
  /** Situações exibidas neste painel. */
  status: FeriasGozo["status"][];
  vazio: string;
};

/** Lista de férias por situação (solicitações, programadas, em férias, histórico). */
export function FeriasGozosPanel({ status, vazio }: Props) {
  const { gozos, gozosLoading, periodos } = useDpFerias("todos");
  const { data: colaboradores = [] } = useDpColaboradores();

  const nomes = useMemo(
    () => new Map(colaboradores.map((c: any) => [c.id, c.nome as string])),
    [colaboradores],
  );
  const periodoPorId = useMemo(() => new Map(periodos.map((p) => [p.id, p])), [periodos]);

  const lista = useMemo(
    () =>
      gozos
        .filter((g) => status.includes(g.status))
        .sort((a, b) => b.data_inicio.localeCompare(a.data_inicio)),
    [gozos, status],
  );

  return (
    <DpContentCard>
      {gozosLoading ? (
        <div className="p-8 text-center text-muted-foreground">Carregando…</div>
      ) : lista.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground">{vazio}</div>
      ) : (
        <div className="divide-y divide-border">
          {lista.map((g) => {
            const periodo = periodoPorId.get(g.periodo_id);
            return (
              <div key={g.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {nomes.get(g.colaborador_id) ?? periodo?.colaborador_nome ?? "Colaborador"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {fmt(g.data_inicio)} a {fmt(g.data_fim)} · {g.dias} dias
                    {g.dias_abono > 0 && ` + ${g.dias_abono} de abono`}
                    {g.adiantar_13 && " · 13º adiantado"}
                  </p>
                  {periodo && (
                    <p className="text-xs text-muted-foreground">
                      Período aquisitivo {fmt(periodo.inicio_aquisitivo)} a {fmt(periodo.fim_aquisitivo)}
                    </p>
                  )}
                </div>
                <Badge className={GOZO_TONE[g.status]}>{GOZO_LABEL[g.status] ?? g.status}</Badge>
              </div>
            );
          })}
        </div>
      )}
    </DpContentCard>
  );
}
