import { useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { BellRing, Briefcase, CalendarClock, Check, Clock, MapPin, Users, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RecusaDialog } from "@/components/dp/RecusaDialog";
import { useMinhasConvocacoes, type MinhaOferta } from "@/hooks/useDpConvocacoes";
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

const hhmm = (v: string | null | undefined) => (v ? String(v).slice(0, 5) : "—");

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Valor previsto vem do snapshot gravado na publicação — nunca recalculado aqui. */
const remuneracaoPrevista = (snap: any): { total: string; detalhe: string } | null => {
  if (!snap || typeof snap !== "object") return null;
  const total = Number(snap.valor_previsto ?? 0);
  const unitario = Number(snap.valor_unitario ?? 0);
  if (!total && !unitario) return null;
  const unidade = snap.unidade_remuneracao === "diaria" ? "diária" : "hora";
  const qtd = Number(snap.quantidade_prevista ?? 0);
  return {
    total: moeda(total || unitario),
    detalhe: `${moeda(unitario)} / ${unidade}${qtd ? ` × ${qtd.toLocaleString("pt-BR")}` : ""}`,
  };
};

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

  const { rows, isLoading, responder, registrarVisualizacao } = useMinhasConvocacoes(me.data ?? null);

  // Visualização registrada uma única vez por oferta pendente ainda não vista.
  const vistas = useRef<Set<string>>(new Set());
  useEffect(() => {
    rows
      .filter((c) => c.status === "pendente" && !c.visualizada_em && !vistas.current.has(c.id))
      .forEach((c) => {
        vistas.current.add(c.id);
        registrarVisualizacao.mutate(c.id);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const mensagemMotivo = (motivo: string) =>
    motivo === "OFFER_FILLED"
      ? "As vagas deste dia acabaram de ser preenchidas."
      : motivo === "DEADLINE_EXPIRED"
        ? "O prazo para responder esta convocação venceu."
        : motivo === "OCCURRENCE_ALREADY_STARTED"
          ? "Este dia já começou e não aceita mais resposta."
          : motivo === "INVALID_STATE"
            ? "Esta convocação já não está aguardando resposta."
            : motivo.startsWith("ACCEPT_INELIGIBLE")
              ? "Você não está mais elegível para esta convocação."
              : "Não foi possível responder.";

  const responderConvocacao = (id: string, aceito: boolean, motivo?: string) =>
    responder.mutate(
      { id, aceito, motivo },
      {
        onSuccess: (res: any) => {
          if (res && res.ok === false) {
            toast.error(mensagemMotivo(String(res.motivo ?? "")));
            setRecusa(null);
            return;
          }
          toast.success(
            res?.idempotente
              ? "Sua resposta já estava registrada."
              : aceito
                ? "Convocação aceita."
                : "Convocação recusada.",
          );
          setRecusa(null);
        },
        onError: (e: any) => {
          const msg = String(e?.message ?? "");
          toast.error(
            msg.includes("ALREADY_ACCEPTED_TODAY")
              ? "Você já tem uma convocação confirmada para este mesmo dia."
              : msg.includes("REFUSAL_REASON_REQUIRED")
                ? "Informe o motivo da recusa."
                : msg.includes("ACCEPT_INELIGIBLE")
                  ? "Você não está mais elegível para esta convocação."
                  : msg || "Não foi possível responder.",
          );
        },
      },
    );

  const renderCard = (c: MinhaOferta) => {
    const st = statusEfetivo(c as any);
    const meta = STATUS_META[st] ?? { label: c.status, className: "bg-muted text-muted-foreground border-border" };
    const responderAgora = podeResponder(c as any);
    const prazo = rotuloPrazo(c.prazo_resposta);
    const rem = remuneracaoPrevista(c.remuneracao_snapshot);

    return (
      <Card key={c.id}>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="font-medium capitalize flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-primary" /> {rotuloData(c.data)}
              </p>

              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Clock className="h-4 w-4 shrink-0" />
                {hhmm(c.entrada)} → {hhmm(c.saida)}
                {c.termina_no_dia_seguinte ? " (+1)" : ""} ·{" "}
                {formatarHoras(Number(c.carga_prevista_horas))}
                {c.intervalo_minutos ? ` · ${c.intervalo_minutos} min de intervalo` : ""}
              </p>

              {c.cargo_nome ? (
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Briefcase className="h-4 w-4 shrink-0" /> {c.cargo_nome}
                </p>
              ) : null}

              {c.unidade_nome ? (
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <MapPin className="h-4 w-4 shrink-0" /> {c.unidade_nome}
                </p>
              ) : null}

              {c.modalidade && c.modalidade !== "individual" ? (
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Users className="h-4 w-4 shrink-0" />
                  Oferta aberta · {c.vagas_restantes ?? 0} de {c.vagas ?? 1}{" "}
                  {(c.vagas ?? 1) === 1 ? "vaga disponível" : "vagas disponíveis"}
                </p>
              ) : null}

              {c.necessidade_entrada ? (
                <p className="text-xs text-muted-foreground">
                  Cobertura necessária: {hhmm(c.necessidade_entrada)} → {hhmm(c.necessidade_saida)}
                  {c.necessidade_termina_no_dia_seguinte ? " (+1)" : ""}
                </p>
              ) : null}

              {prazo ? <p className="text-xs text-muted-foreground">Responder até {prazo}</p> : null}

              {rem ? (
                <p className="text-sm font-medium text-primary">
                  {rem.total} <span className="text-xs font-normal text-muted-foreground">({rem.detalhe})</span>
                </p>
              ) : null}

              {c.observacao ? <p className="text-sm pt-1">{c.observacao}</p> : null}
              {c.motivo_recusa && st === "recusada" ? (
                <p className="text-xs text-muted-foreground">Motivo informado: {c.motivo_recusa}</p>
              ) : null}
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
  };

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
        <div className="space-y-3">{rows.map(renderCard)}</div>
      )}

      <RecusaDialog
        open={!!recusa}
        onOpenChange={(v) => !v && setRecusa(null)}
        onConfirm={(motivo) => recusa && responderConvocacao(recusa, false, motivo)}
        loading={responder.isPending}
      />
    </div>
  );
}

