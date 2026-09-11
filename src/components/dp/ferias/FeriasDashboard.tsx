import { useMemo } from "react";
import { Link } from "react-router-dom";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, CalendarClock, CheckCircle2, Palmtree, Inbox, Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DpContentCard } from "@/components/dp/DpPage";
import {
  NIVEL_VENCIMENTO_META,
  RISCO_DOBRA_META,
  nivelVencimentoPeriodo,
  periodosComAcumulo,
  riscoAcumuloPorColaborador,
  textoPrazo,
} from "@/lib/dp/ferias-direito";
import { useDpFeriasConfig } from "@/hooks/useDpFeriasConfig";
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
  const hojeISO = format(hoje, "yyyy-MM-dd");
  const { config: feriasConfig } = useDpFeriasConfig();
  const politica = feriasConfig.sinalizacaoCicloEncerrado;

  const { kpis, atencoes, riscoPorColab } = useMemo(() => {
    // Sócio não tem férias legais: fica fora de saldo, prazo e indicadores.
    const comSaldo = periodos.filter(
      (p) =>
        !p.controle_externo &&
        !p.socio &&
        (p.dias_saldo ?? 0) > 0 &&
        p.status !== "em_aquisicao" &&
        p.status !== "concluido",
    );
    const dias = (p: FeriasPeriodo) => differenceInCalendarDays(parseISO(p.limite_concessivo), hoje);

    const idsAcumulo = periodosComAcumulo(periodos as any[]);
    const nivelDe = (p: FeriasPeriodo) =>
      nivelVencimentoPeriodo({
        fimAquisitivo: p.fim_aquisitivo,
        limiteConcessivo: p.limite_concessivo,
        diasSaldo: p.dias_saldo,
        hojeISO,
        politica,
        socio: p.socio,
        acumulo: idsAcumulo.has(p.id),
      });

    const riscos = riscoAcumuloPorColaborador(periodos as any[], hojeISO);
    const emRisco = (id: string) => riscos.get(id)?.emRisco === true;

    const lista = comSaldo
      .map((p) => ({ periodo: p, restantes: dias(p), nivel: nivelDe(p), risco: emRisco(p.colaborador_id) }))
      .filter((x) => x.risco || x.nivel !== "normal")
      // risco de dobra sempre no topo, depois o prazo mais curto
      .sort((a, b) => Number(b.risco) - Number(a.risco) || a.restantes - b.restantes)
      .slice(0, 8);

    return {
      kpis: {
        programar: comSaldo.length,
        vencendo: comSaldo.filter((p) => {
          const n = nivelDe(p);
          return n === "vencido" || n === "atencao" || n === "marcacao_atrasada";
        }).length,
        aguardando: gozos.filter((g) => g.status === "planejado").length,
        programadas: gozos.filter((g) => g.status === "aprovado").length,
        emFerias: gozos.filter((g) => g.status === "em_gozo").length,
        risco: [...riscos.values()].filter((r) => r.emRisco).length,
      },
      atencoes: lista,
      riscoPorColab: riscos,
    };
  }, [periodos, gozos, hojeISO, politica]);

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

      {kpis.risco > 0 && (
        <Link
          to="/dp/ferias?aba=planejamento&risco=1"
          className="flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 transition-colors hover:bg-destructive/15"
        >
          <Scale className="size-5 shrink-0 text-destructive" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-destructive">
              {kpis.risco} pessoa(s) com risco de pagamento em dobro
            </p>
            <p className="text-xs text-muted-foreground">
              Têm dois períodos de férias em aberto. Pela lei, as férias precisam sair nos 12 meses
              seguintes ao fim do ano trabalhado — passando disso, o pagamento é em dobro. Conceda
              sempre o período mais antigo primeiro.
            </p>
          </div>
          <span className="text-xs font-medium text-destructive underline">Ver quem está em risco</span>
        </Link>
      )}

      {atencoes.length > 0 && (
        <DpContentCard>
          <div className="border-b border-border px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Atenções</p>
          </div>
          <div className="divide-y divide-border">
            {atencoes.map(({ periodo, restantes, nivel, risco }) => {
              const meta = NIVEL_VENCIMENTO_META[nivel];
              const detalhe = descricaoColaborador?.(periodo.colaborador_id);
              const abertos = riscoPorColab.get(periodo.colaborador_id)?.periodosAbertos.length ?? 0;
              return (
                <div key={periodo.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{periodo.colaborador_nome ?? "Colaborador"}</p>
                    {detalhe && <p className="text-xs text-muted-foreground">{detalhe}</p>}
                    <p className="text-sm text-muted-foreground">
                      {periodo.dias_saldo ?? 0} dias disponíveis · prazo até {fmt(periodo.limite_concessivo)}
                    </p>
                    {risco && (
                      <p className="text-xs font-medium text-destructive">
                        {abertos} períodos em aberto — risco de pagar férias em dobro.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {risco && <Badge className={RISCO_DOBRA_META.tone}>{RISCO_DOBRA_META.label}</Badge>}
                    {nivel !== "normal" && <Badge className={meta.tone}>{meta.label}</Badge>}
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
