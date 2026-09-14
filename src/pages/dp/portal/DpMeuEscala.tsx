import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Clock, Coffee, ChevronLeft, ChevronRight, HelpCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatarHoras } from "@/lib/dp/jornada-utils";
import { TIPO_LABEL, type EscalaItemTipo } from "@/lib/dp/escala-mes";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DpEmptyState, DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { DpErrorState } from "@/components/dp/DpErrorState";
import { CardListSkeleton } from "@/components/dp/DpSkeletons";

import { useDpHorarioPrevisto } from "@/hooks/useDpHorarioPrevisto";
import { useMinhasConvocacoes } from "@/hooks/useDpConvocacoes";
import { FONTE_LABEL, textoPrevisto } from "@/lib/dp/horario-previsto";

const competenciaAtual = () => new Date().toISOString().slice(0, 7);

const somarMes = (comp: string, delta: number) => {
  const [ano, mes] = comp.split("-").map(Number);
  const d = new Date(ano, mes - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const rotuloMes = (comp: string) =>
  new Date(`${comp}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

const rotuloDia = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });

const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Um dia mostrado na tela: já confirmado ou convocação ainda respondível. */
type LinhaEscala = {
  data: string;
  situacao: "confirmado" | "aguardando";
  tipo: EscalaItemTipo | "trabalho";
  entrada: string | null;
  saida: string | null;
  termina_no_dia_seguinte: boolean;
  carga: number;
  observacao?: string | null;
  convocacaoId?: string;
};

export default function DpMeuEscala() {
  const { user } = useAuth();
  const [competencia, setCompetencia] = useState(competenciaAtual);

  const me = useQuery({
    queryKey: ["dp_colaborador_of", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.rpc("dp_colaborador_of", { _user_id: user!.id });
      return (data as string | null) ?? null;
    },
  });

  const colaboradorId = me.data ?? null;
  const { proximo, hoje: previstoHoje } = useDpHorarioPrevisto(colaboradorId, competencia);
  const destaque = previstoHoje?.trabalha ? previstoHoje : proximo;
  const { rows: ofertas, isLoading: carregandoOfertas } = useMinhasConvocacoes(colaboradorId);

  const escala = useQuery({
    queryKey: ["dp_meu_escala", colaboradorId, competencia],
    enabled: !!colaboradorId,
    queryFn: async () => {
      const { data: escalas, error: errE } = await supabase
        .from("dp_escalas")
        .select("id, status, competencia")
        .eq("competencia", competencia)
        .eq("status", "publicada");
      if (errE) throw errE;
      const ids = (escalas ?? []).map((e) => e.id);
      if (!ids.length) return [];
      const { data, error } = await supabase
        .from("dp_escala_itens")
        .select("data, tipo, entrada, saida, intervalo_minutos, termina_no_dia_seguinte, carga_prevista_horas, observacao")
        .in("escala_id", ids)
        .eq("colaborador_id", colaboradorId!)
        .order("data");
      if (error) throw error;
      return data ?? [];
    },
  });

  /**
   * Só entram na lista os dias que interessam à pessoa: dias já confirmados
   * (escala publicada ou convocação aceita) e convocações que ela ainda pode
   * responder (dentro do prazo e antes do turno começar).
   */
  const linhas = useMemo<LinhaEscala[]>(() => {
    const agora = Date.now();
    const mapa = new Map<string, LinhaEscala>();

    for (const i of escala.data ?? []) {
      mapa.set(i.data, {
        data: i.data,
        situacao: "confirmado",
        tipo: (i.tipo as EscalaItemTipo) ?? "trabalho",
        entrada: i.entrada ?? null,
        saida: i.saida ?? null,
        termina_no_dia_seguinte: !!i.termina_no_dia_seguinte,
        carga: Number(i.carga_prevista_horas ?? 0),
        observacao: i.observacao,
      });
    }

    for (const o of ofertas ?? []) {
      if (!o.data?.startsWith(competencia)) continue;
      const aceita = o.status === "aceita" || o.parcial_status === "aprovada";
      const parcial = o.parcial_status === "aprovada" || o.resposta_tipo === "parcial";
      if (aceita) {
        if (mapa.has(o.data)) continue;
        mapa.set(o.data, {
          data: o.data,
          situacao: "confirmado",
          tipo: "trabalho",
          entrada: (parcial ? o.parcial_entrada : o.entrada) ?? o.entrada ?? null,
          saida: (parcial ? o.parcial_saida : o.saida) ?? o.saida ?? null,
          termina_no_dia_seguinte: !!(parcial
            ? o.parcial_termina_no_dia_seguinte
            : o.termina_no_dia_seguinte),
          carga: Number((parcial ? o.parcial_carga_horas : o.carga_prevista_horas) ?? 0),
          observacao: o.observacao,
          convocacaoId: o.id,
        });
        continue;
      }
      if (o.status !== "pendente" || mapa.has(o.data)) continue;
      const prazoOk = !o.prazo_resposta || new Date(o.prazo_resposta).getTime() > agora;
      const naoComecou = o.inicio_previsto
        ? new Date(o.inicio_previsto).getTime() > agora
        : !o.janela_comecou;
      if (!prazoOk || !naoComecou) continue;
      mapa.set(o.data, {
        data: o.data,
        situacao: "aguardando",
        tipo: "trabalho",
        entrada: o.entrada ?? null,
        saida: o.saida ?? null,
        termina_no_dia_seguinte: !!o.termina_no_dia_seguinte,
        carga: Number(o.carga_prevista_horas ?? 0),
        observacao: o.unidade_nome,
        convocacaoId: o.id,
      });
    }

    return [...mapa.values()].sort((a, b) => (a.data < b.data ? -1 : 1));
  }, [escala.data, ofertas, competencia]);

  const totais = useMemo(() => {
    const confirmados = linhas.filter((l) => l.situacao === "confirmado");
    return {
      trabalho: confirmados.filter((l) => l.tipo === "trabalho").length,
      folga: confirmados.filter((l) => l.tipo !== "trabalho").length,
      carga: Math.round(confirmados.reduce((s, l) => s + l.carga, 0) * 100) / 100,
      aguardando: linhas.filter((l) => l.situacao === "aguardando").length,
    };
  }, [linhas]);

  const hoje = hojeIso();
  const carregando = escala.isLoading || me.isLoading || carregandoOfertas;

  return (
    <DpPage narrow>
      <Helmet>
        <title>Minha Escala | Aveto 360</title>
        <meta name="description" content="Veja seus dias confirmados de trabalho, horários e convocações que ainda pode responder." />
      </Helmet>

      <DpPageHeader icon={CalendarClock} title="Minha Escala" description="Seus dias confirmados e convites em aberto." />

      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" aria-label="Mês anterior" onClick={() => setCompetencia(somarMes(competencia, -1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="flex-1 text-center text-sm font-medium first-letter:uppercase">{rotuloMes(competencia)}</span>
        <Button variant="outline" size="icon" aria-label="Próximo mês" onClick={() => setCompetencia(somarMes(competencia, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {destaque && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                {destaque.data === hojeIso() ? "Seu turno de hoje" : `Próximo turno · ${rotuloDia(destaque.data)}`}
              </p>
              <p className="text-base font-semibold">{textoPrevisto(destaque)}</p>
            </div>
            <Badge variant="outline" className="shrink-0">{FONTE_LABEL[destaque.fonte]}</Badge>
          </CardContent>
        </Card>
      )}

      {escala.isError || me.isError ? (
        <DpErrorState onRetry={() => { me.refetch(); escala.refetch(); }} />
      ) : carregando ? (
        <CardListSkeleton rows={3} />
      ) : linhas.length === 0 ? (
        <DpEmptyState icon={CalendarClock}>Você ainda não tem dia confirmado neste mês.</DpEmptyState>

      ) : (
        <>
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
            <Card><CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Dias de trabalho</p>
              <p className="text-lg font-semibold">{totais.trabalho}</p>
            </CardContent></Card>
            <Card><CardContent className="p-3">
              <p className="text-xs text-muted-foreground">{totais.folga ? "Folgas" : "Aguardando"}</p>
              <p className="text-lg font-semibold">{totais.folga || totais.aguardando}</p>
            </CardContent></Card>
            <Card><CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Carga</p>
              <p className="text-lg font-semibold">{formatarHoras(totais.carga)}</p>
            </CardContent></Card>
          </div>

          <Card>
            <CardContent className="divide-y p-0">
              {linhas.map((l) => (
                <div
                  key={l.data}
                  className={`flex items-center justify-between gap-3 px-4 py-2.5 ${l.data === hoje ? "bg-muted/60" : ""}`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium capitalize">{rotuloDia(l.data)}</p>
                    {l.situacao === "aguardando" ? (
                      <Link to="/dp/meu/convocacoes" className="text-xs text-primary underline">
                        Aguardando sua resposta · responder
                      </Link>
                    ) : (
                      l.observacao && (
                        <p className="truncate text-xs text-muted-foreground">{l.observacao}</p>
                      )
                    )}
                  </div>
                  {l.tipo !== "trabalho" ? (
                    <Badge variant="outline" className="shrink-0 gap-1">
                      <Coffee className="h-3 w-3" />
                      {TIPO_LABEL[l.tipo as EscalaItemTipo]}
                    </Badge>
                  ) : (
                    <div className="flex shrink-0 items-center gap-1.5 text-sm">
                      {l.situacao === "aguardando" ? (
                        <HelpCircle className="h-3.5 w-3.5 text-amber-500" />
                      ) : (
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <span>
                        {l.entrada?.slice(0, 5) ?? "--:--"} às {l.saida?.slice(0, 5) ?? "--:--"}
                        {l.termina_no_dia_seguinte ? " (+1)" : ""}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </DpPage>
  );
}
