import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Clock, Coffee, ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatarHoras } from "@/lib/dp/jornada-utils";
import { diasDaCompetencia, TIPO_LABEL, type EscalaItemTipo } from "@/lib/dp/escala-mes";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useDpHorarioPrevisto } from "@/hooks/useDpHorarioPrevisto";
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
  const dias = useMemo(() => diasDaCompetencia(competencia), [competencia]);
  const { proximo, hoje: previstoHoje } = useDpHorarioPrevisto(colaboradorId, competencia);
  const destaque = previstoHoje?.trabalha ? previstoHoje : proximo;

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

  const porData = useMemo(() => {
    const m = new Map<string, NonNullable<typeof escala.data>[number]>();
    for (const i of escala.data ?? []) m.set(i.data, i);
    return m;
  }, [escala.data]);

  const totais = useMemo(() => {
    const itens = escala.data ?? [];
    return {
      trabalho: itens.filter((i) => i.tipo === "trabalho").length,
      folga: itens.filter((i) => i.tipo !== "trabalho").length,
      carga: Math.round(itens.reduce((s, i) => s + Number(i.carga_prevista_horas ?? 0), 0) * 100) / 100,
    };
  }, [escala.data]);

  const hoje = hojeIso();
  const publicada = (escala.data ?? []).length > 0;

  return (
    <div className="space-y-4 p-4">
      <Helmet>
        <title>Minha Escala | 360°FOOD</title>
        <meta name="description" content="Veja seus dias de trabalho, horários e folgas da escala publicada pela sua unidade." />
      </Helmet>

      <header className="flex items-center gap-2">
        <CalendarClock className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-lg font-semibold">Minha Escala</h1>
          <p className="text-xs text-muted-foreground">Horários publicados pela sua unidade.</p>
        </div>
      </header>

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

      {escala.isLoading || me.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !publicada ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            A escala deste mês ainda não foi publicada.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
            <Card><CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Dias de trabalho</p>
              <p className="text-lg font-semibold">{totais.trabalho}</p>
            </CardContent></Card>
            <Card><CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Folgas</p>
              <p className="text-lg font-semibold">{totais.folga}</p>
            </CardContent></Card>
            <Card><CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Carga</p>
              <p className="text-lg font-semibold">{formatarHoras(totais.carga)}</p>
            </CardContent></Card>
          </div>

          <Card>
            <CardContent className="divide-y p-0">
              {dias.map((d) => {
                const item = porData.get(d);
                const trabalho = item?.tipo === "trabalho";
                return (
                  <div
                    key={d}
                    className={`flex items-center justify-between gap-3 px-4 py-2.5 ${d === hoje ? "bg-muted/60" : ""}`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium capitalize">{rotuloDia(d)}</p>
                      {item?.observacao && (
                        <p className="truncate text-xs text-muted-foreground">{item.observacao}</p>
                      )}
                    </div>
                    {!item ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : trabalho ? (
                      <div className="flex shrink-0 items-center gap-1.5 text-sm">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>
                          {item.entrada?.slice(0, 5) ?? "--:--"} às {item.saida?.slice(0, 5) ?? "--:--"}
                          {item.termina_no_dia_seguinte ? " (+1)" : ""}
                        </span>
                      </div>
                    ) : (
                      <Badge variant="outline" className="shrink-0 gap-1">
                        <Coffee className="h-3 w-3" />
                        {TIPO_LABEL[item.tipo as EscalaItemTipo]}
                      </Badge>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
