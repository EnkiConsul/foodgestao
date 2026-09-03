import { Helmet } from "react-helmet-async";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Clock, Fingerprint, CalendarClock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useMeuPonto } from "@/hooks/useDpPonto";
import { PontoAjusteDialog } from "@/components/dp/PontoAjusteDialog";
import { useMeusAjustesPonto, AJUSTE_ACAO_LABEL } from "@/hooks/useDpPontoAjustes";
import { useDpHorarioPrevisto } from "@/hooks/useDpHorarioPrevisto";
import { textoPrevisto } from "@/lib/dp/horario-previsto";
import {
  consolidarDia,
  proximaMarcacao,
  horaDaMarcacao,
  formatarDuracao,
  formatarSaldo,
  PONTO_TIPO_LABEL,
  PONTO_ORIGEM_LABEL,
  STATUS_DIA_LABEL,
  ORDEM_MARCACOES,
} from "@/lib/dp/ponto";

const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const dataExtenso = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

export default function DpMeuPonto() {
  const { user } = useAuth();
  const hoje = hojeIso();
  const competencia = hoje.slice(0, 7);

  const me = useQuery({
    queryKey: ["dp_colaborador_of", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.rpc("dp_colaborador_of", { _user_id: user!.id });
      return (data as string | null) ?? null;
    },
  });
  const colaboradorId = me.data ?? null;

  const vinculo = useQuery({
    queryKey: ["dp_colaborador_vinculo_ponto", colaboradorId],
    enabled: !!colaboradorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_colaboradores")
        .select("company_id, unidade_id")
        .eq("id", colaboradorId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { porData, isLoading, registrar } = useMeuPonto(colaboradorId, hoje, hoje);
  const { porData: previstoPorData, isLoading: loadingPrevisto } = useDpHorarioPrevisto(colaboradorId, competencia);

  const marcacoes = useMemo(() => porData.get(hoje) ?? [], [porData, hoje]);
  const previsto = previstoPorData.get(hoje) ?? null;
  const proxima = proximaMarcacao(marcacoes);

  const resumo = useMemo(
    () => consolidarDia({ data: hoje, previsto, marcacoes }),
    [hoje, previsto, marcacoes],
  );

  const bater = () => {
    if (!proxima || !vinculo.data?.company_id) return;
    registrar.mutate(
      {
        tipo: proxima,
        data: hoje,
        companyId: vinculo.data.company_id,
        unidadeId: vinculo.data.unidade_id,
      },
      {
        onSuccess: () => toast.success(`${PONTO_TIPO_LABEL[proxima]} registrada.`),
        onError: (e: unknown) => toast.error((e as Error).message ?? "Não foi possível registrar o ponto."),
      },
    );
  };

  const { ajustes } = useMeusAjustesPonto(colaboradorId);

  const carregando = isLoading || loadingPrevisto || me.isLoading;

  return (
    <div className="space-y-4 p-4 pb-24">
      <Helmet>
        <title>Meu Ponto | Aveto 360</title>
        <meta name="description" content="Registre sua entrada, intervalo e saída e acompanhe as horas do dia." />
      </Helmet>

      <header className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Fingerprint className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">Meu Ponto</h1>
          <p className="text-xs capitalize text-muted-foreground">{dataExtenso(hoje)}</p>
        </div>
      </header>

      {carregando ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <>
          <Card className="border-primary/40 bg-primary/5">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Previsto para hoje</p>
                  <p className="text-base font-semibold">
                    {previsto ? textoPrevisto(previsto) : "Sem previsão"}
                  </p>
                </div>
                <Badge variant="outline">{STATUS_DIA_LABEL[resumo.status]}</Badge>
              </div>
              <Button className="w-full" size="lg" disabled={!proxima || registrar.isPending} onClick={bater}>
                <Clock className="mr-2 h-4 w-4" />
                {proxima ? `Registrar ${PONTO_TIPO_LABEL[proxima].toLowerCase()}` : "Dia encerrado"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="divide-y p-0">
              {ORDEM_MARCACOES.map((tipo) => {
                const m = marcacoes.find((x) => x.tipo === tipo);
                return (
                  <div key={tipo} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{PONTO_TIPO_LABEL[tipo]}</p>
                      {m?.origem && m.origem !== "portal" && (
                        <p className="text-xs text-muted-foreground">{PONTO_ORIGEM_LABEL[m.origem]}</p>
                      )}
                    </div>
                    <span className={m ? "text-sm font-semibold" : "text-sm text-muted-foreground"}>
                      {m ? horaDaMarcacao(m.registrado_em) : "--:--"}
                    </span>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
            <Card><CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Trabalhado</p>
              <p className="text-lg font-semibold">{formatarDuracao(resumo.minutosTrabalhados)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Previsto</p>
              <p className="text-lg font-semibold">{formatarDuracao(resumo.minutosPrevistos)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Saldo</p>
              <p className="text-lg font-semibold">{formatarSaldo(resumo.saldoMinutos)}</p>
            </CardContent></Card>
          </div>

          {colaboradorId && vinculo.data?.company_id && (
            <PontoAjusteDialog
              colaboradorId={colaboradorId}
              companyId={vinculo.data.company_id}
              dataPadrao={hoje}
            />
          )}

          {ajustes.length > 0 && (
            <Card>
              <CardContent className="divide-y p-0">
                {ajustes.slice(0, 5).map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {new Date(`${a.data}T12:00:00`).toLocaleDateString("pt-BR")} · {PONTO_TIPO_LABEL[a.tipo]}
                      </p>
                      <p className="text-xs text-muted-foreground">{AJUSTE_ACAO_LABEL[a.acao]}</p>
                    </div>
                    <Badge variant={a.status === "aprovado" ? "default" : a.status === "recusado" ? "destructive" : "secondary"}>
                      {a.status}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {resumo.atrasoMinutos > 0 && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5" />
              Entrada {formatarDuracao(resumo.atrasoMinutos)} após o horário previsto.
            </p>
          )}
        </>
      )}
    </div>
  );
}
