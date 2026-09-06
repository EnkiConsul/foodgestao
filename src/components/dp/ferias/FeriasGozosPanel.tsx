import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Ban, CheckCircle2, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DpContentCard } from "@/components/dp/DpPage";
import { useDpFerias, type FeriasGozo } from "@/hooks/useDpFerias";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { FeriasCancelarDialog } from "@/components/dp/ferias/FeriasCancelarDialog";
import { FeriasCoberturaDialog } from "@/components/dp/ferias/FeriasCoberturaDialog";

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

/** Lista de férias por situação (programadas, em férias, histórico). */
export function FeriasGozosPanel({ status, vazio }: Props) {
  const { gozos, gozosLoading, periodos, cancelarGozo } = useDpFerias("todos");
  const { data: colaboradores = [] } = useDpColaboradores();
  const [cancelando, setCancelando] = useState<(FeriasGozo & { colaborador_nome?: string | null }) | null>(null);
  const [cobertura, setCobertura] = useState<
    (FeriasGozo & { colaborador_nome?: string | null; unidade_id?: string | null; cargo_id?: string | null }) | null
  >(null);

  const nomes = useMemo(
    () => new Map(colaboradores.map((c: any) => [c.id, c.nome as string])),
    [colaboradores],
  );
  const porColaborador = useMemo(
    () => new Map((colaboradores as any[]).map((c) => [c.id, c])),
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
    <>
      <DpContentCard>
        {gozosLoading ? (
          <div className="p-8 text-center text-muted-foreground">Carregando…</div>
        ) : lista.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">{vazio}</div>
        ) : (
          <div className="divide-y divide-border">
            {lista.map((g) => {
              const periodo = periodoPorId.get(g.periodo_id);
              const nome = nomes.get(g.colaborador_id) ?? periodo?.colaborador_nome ?? "Colaborador";
              const podeCancelar = g.status === "aprovado" || g.status === "em_gozo";
              return (
                <div key={g.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{nome}</p>
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
                    {g.status === "cancelado" && g.motivo_cancelamento && (
                      <p className="text-xs text-destructive">
                        Cancelada
                        {g.cancelado_em && ` em ${fmt(g.cancelado_em.slice(0, 10))}`}: {g.motivo_cancelamento}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {g.ciente_em && (
                      <Badge variant="outline" className="text-emerald-600">
                        <CheckCircle2 className="mr-1 size-3.5" /> Ciente
                      </Badge>
                    )}
                    <Badge className={GOZO_TONE[g.status]}>{GOZO_LABEL[g.status] ?? g.status}</Badge>
                    {(g.status === "aprovado" || g.status === "em_gozo") && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          const c = porColaborador.get(g.colaborador_id);
                          setCobertura({
                            ...g,
                            colaborador_nome: nome,
                            unidade_id: c?.unidade_id ?? null,
                            cargo_id: c?.cargo_id ?? null,
                          });
                        }}
                      >
                        <ShieldAlert className="mr-1 size-3.5" /> Cobertura
                      </Button>
                    )}
                    {podeCancelar && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setCancelando({ ...g, colaborador_nome: nome })}
                      >
                        <Ban className="mr-1 size-3.5" /> Cancelar
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DpContentCard>

      <FeriasCoberturaDialog
        gozo={cobertura}
        onOpenChange={(v) => { if (!v) setCobertura(null); }}
      />

      <FeriasCancelarDialog
        gozo={cancelando}
        onOpenChange={(v) => { if (!v) setCancelando(null); }}
        saving={cancelarGozo.isPending}
        onSubmit={(motivo) =>
          cancelando &&
          cancelarGozo.mutate(
            { id: cancelando.id, motivo },
            { onSuccess: () => setCancelando(null) },
          )
        }
      />
    </>
  );
}
