import { useMemo } from "react";
import { Link } from "react-router-dom";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, CalendarClock, CheckCircle2, Palmtree, Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DpContentCard } from "@/components/dp/DpPage";
import { NIVEL_VENCIMENTO_META, nivelVencimento, textoPrazo } from "@/lib/dp/ferias-direito";
import type { FeriasGozo, FeriasPeriodo } from "@/hooks/useDpFerias";

const fmt = (iso: string) => format(parseISO(iso), "dd/MM/yyyy", { locale: ptBR });

type Props = {
  periodos: FeriasPeriodo[];
  gozos: FeriasGozo[];
  /** Cargo/setor por colaborador, quando disponível, só para exibição. */
  descricaoColaborador?: (colaboradorId: string) => string | null;
};

/** Visão operacional de férias: o que precisa de ação hoje. */
export function FeriasDashboard({ periodos, gozos, descricaoColaborador }: Props) {
  const hoje = new Date();

  const { kpis, atencoes } = useMemo(() => {
    const comSaldo = periodos.filter(
      (p) => (p.dias_saldo ?? 0) > 0 && p.status !== "em_aquisicao" && p.status !== "concluido",
    );
    const dias = (p: FeriasPeriodo) => differenceInCalendarDays(parseISO(p.limite_concessivo), hoje);

    const lista = comSaldo
      .map((p) => ({ periodo: p, restantes: dias(p) }))
      .filter((x) => x.restantes <= 90)
      .sort((a, b) => a.restantes - b.restantes)
      .slice(0, 8);

    return {
      kpis: {
        programar: comSaldo.length,
        vencendo: comSaldo.filter((p) => dias(p) <= 30).length,
        aguardando: gozos.filter((g) => g.status === "planejado").length,
        programadas: gozos.filter((g) => g.status === "aprovado").length,
        emFerias: gozos.filter((g) => g.status === "em_gozo").length,
      },
      atencoes: lista,
    };
  }, [periodos, gozos, hoje]);

  const cards = [
    { label: "Precisam ser programadas", value: kpis.programar, icon: CheckCircle2, tone: "text-emerald-600" },
    { label: "Vencem em até 30 dias", value: kpis.vencendo, icon: AlertTriangle, tone: "text-destructive" },
    { label: "Aguardando aprovação", value: kpis.aguardando, icon: Inbox, tone: "text-amber-600" },
    { label: "Programadas", value: kpis.programadas, icon: CalendarClock, tone: "text-sky-600" },
    { label: "Em férias hoje", value: kpis.emFerias, icon: Palmtree, tone: "text-primary" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-border bg-card p-4">
            <c.icon className={`size-5 ${c.tone}`} aria-hidden="true" />
            <p className="mt-2 text-2xl font-bold">{c.value}</p>
            <p className="text-xs text-muted-foreground">{c.label}</p>
          </div>
        ))}
      </div>

      {atencoes.length > 0 && (
        <DpContentCard>
          <div className="border-b border-border px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Atenções</p>
          </div>
          <div className="divide-y divide-border">
            {atencoes.map(({ periodo, restantes }) => {
              const nivel = nivelVencimento(restantes);
              const meta = NIVEL_VENCIMENTO_META[nivel];
              const detalhe = descricaoColaborador?.(periodo.colaborador_id);
              return (
                <div key={periodo.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{periodo.colaborador_nome ?? "Colaborador"}</p>
                    {detalhe && <p className="text-xs text-muted-foreground">{detalhe}</p>}
                    <p className="text-sm text-muted-foreground">
                      {periodo.dias_saldo ?? 0} dias disponíveis · prazo até {fmt(periodo.limite_concessivo)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={meta.tone}>{meta.label}</Badge>
                    <span className="text-xs text-muted-foreground">{textoPrazo(restantes)}</span>
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/dp/ferias?aba=planejamento&periodo=${periodo.id}`}>Programar</Link>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </DpContentCard>
      )}
    </div>
  );
}
