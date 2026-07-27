import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { BellRing, CalendarClock, Check, Clock, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RecusaDialog } from "@/components/dp/RecusaDialog";
import { useMinhasConvocacoes } from "@/hooks/useDpConvocacoes";
import { STATUS_META, podeResponder, statusEfetivo } from "@/lib/dp/convocacoes";
import { formatarHoras } from "@/lib/dp/jornada-utils";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const rotuloData = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "long", day: "2-digit", month: "2-digit",
  });

const rotuloPrazo = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : null;

export default function DpMinhasConvocacoes() {
  const { user } = useAuth();
  const [recusa, setRecusa] = useState<string | null>(null);

  const me = useQuery({
    queryKey: ["dp_colaborador_of", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.rpc("dp_colaborador_of", { _user_id: user!.id });
      return (data as string | null) ?? null;
    },
  });

  const { rows, isLoading, responder } = useMinhasConvocacoes(me.data ?? null);

  const responderConvocacao = (id: string, aceito: boolean, motivo?: string) =>
    responder.mutate(
      { id, aceito, motivo },
      {
        onSuccess: () => {
          toast.success(aceito ? "Convocação aceita." : "Convocação recusada.");
          setRecusa(null);
        },
        onError: (e: any) => toast.error(e.message ?? "Não foi possível responder."),
      },
    );

  return (
    <div className="p-4 space-y-4 pb-24">
      <Helmet><title>Minhas Convocações — 360°FOOD</title></Helmet>

      <header className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-2xl bg-primary/10 text-primary grid place-items-center">
          <BellRing className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-semibold leading-tight">Minhas Convocações</h1>
          <p className="text-sm text-muted-foreground">Aceite ou recuse os dias oferecidos.</p>
        </div>
      </header>

      {isLoading || me.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
        </div>
      ) : !rows.length ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          Você ainda não recebeu convocações.
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {rows.map((c) => {
            const st = statusEfetivo(c as any);
            const meta = STATUS_META[st];
            const responderAgora = podeResponder(c as any);
            const prazo = rotuloPrazo(c.prazo_resposta);
            return (
              <Card key={c.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium capitalize flex items-center gap-2">
                        <CalendarClock className="h-4 w-4 text-primary" /> {rotuloData(c.data)}
                      </p>
                      <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                        <Clock className="h-4 w-4" />
                        {String(c.entrada).slice(0, 5)} → {String(c.saida).slice(0, 5)}
                        {c.termina_no_dia_seguinte ? " (+1)" : ""} ·{" "}
                        {formatarHoras(Number(c.carga_prevista_horas))}
                      </p>
                      {prazo ? (
                        <p className="text-xs text-muted-foreground mt-1">Responder até {prazo}</p>
                      ) : null}
                      {c.observacao ? <p className="text-sm mt-2">{c.observacao}</p> : null}
                    </div>
                    <Badge variant="outline" className={cn("rounded-full shrink-0", meta.className)}>
                      {meta.label}
                    </Badge>
                  </div>

                  {responderAgora ? (
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline" className="h-11 gap-2"
                        onClick={() => setRecusa(c.id)} disabled={responder.isPending}
                      >
                        <X className="h-4 w-4" /> Recusar
                      </Button>
                      <Button
                        className="h-11 gap-2"
                        onClick={() => responderConvocacao(c.id, true)} disabled={responder.isPending}
                      >
                        <Check className="h-4 w-4" /> Aceitar
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <RecusaDialog
        open={!!recusa}
        onOpenChange={(v) => !v && setRecusa(null)}
        onConfirm={(motivo) => recusa && responderConvocacao(recusa, false, motivo)}
        isPending={responder.isPending}
      />
    </div>
  );
}
