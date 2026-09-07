import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Send, Users, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatarMinutos } from "@/lib/dp/convocacoes-parcial";
import {
  useDpConvocacoesParciais,
  type AvaliacaoParcial,
  type ParcialPendente,
} from "@/hooks/useDpConvocacoes";

const hhmm = (v: string | null | undefined) => (v ? String(v).slice(0, 5) : "—");

const rotuloData = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "long", day: "2-digit", month: "2-digit",
  });

const rotuloPrazo = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", {
        day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
      })
    : null;

export interface AprovacaoParcialDialogProps {
  parcial: ParcialPendente | null;
  onOpenChange: (v: boolean) => void;
}

/**
 * Decisão do gestor sobre um horário parcial: aprovar, oferecer o dia
 * aos aptos antes de recusar, ou recusar com confirmação explícita.
 */
export function AprovacaoParcialDialog({ parcial, onOpenChange }: AprovacaoParcialDialogProps) {
  const { avaliar, decidir } = useDpConvocacoesParciais();
  const [aval, setAval] = useState<AvaliacaoParcial | null>(null);
  const [motivo, setMotivo] = useState("");
  const [confirmandoRecusa, setConfirmandoRecusa] = useState(false);

  useEffect(() => {
    setAval(null);
    setMotivo("");
    setConfirmandoRecusa(false);
    if (!parcial) return;
    avaliar.mutate(parcial.convocacao_id, {
      onSuccess: (r) => setAval(r),
      onError: (e: any) => toast.error(String(e?.message ?? "Não foi possível avaliar o dia.")),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parcial?.convocacao_id]);

  if (!parcial) return null;

  const aptos = aval?.aptos ?? [];
  const descoberto =
    (aval?.descoberto_inicio_minutos ?? 0) + (aval?.descoberto_fim_minutos ?? 0);

  const decidirAgora = (
    acao: "APROVAR" | "RECUSAR" | "REOFERTAR",
    confirmado = false,
  ) =>
    decidir.mutate(
      { id: parcial.convocacao_id, acao, motivo: motivo.trim() || null, confirmado },
      {
        onSuccess: (res: any) => {
          if (res?.ok === false) {
            if (res.motivo === "HAS_ELIGIBLE") {
              setConfirmandoRecusa(true);
              toast.warning("Há gente apta para este dia — considere oferecer antes de recusar.");
              return;
            }
            if (res.motivo === "NO_ELIGIBLE_CONFIRM") {
              setConfirmandoRecusa(true);
              toast.warning("Não há outra pessoa apta para este dia. Confirme se quer recusar.");
              return;
            }
            if (res.motivo === "NO_ELIGIBLE") {
              toast.error("Não há ninguém apto para receber este dia agora.");
              return;
            }
            if (res.motivo === "OCCURRENCE_ALREADY_STARTED") {
              toast.error("Este dia já começou e não aceita mais decisão.");
              return;
            }
            toast.error("Esta proposta já não está aguardando decisão.");
            onOpenChange(false);
            return;
          }
          if (acao === "APROVAR") {
            toast.success(
              descoberto > 0
                ? `Horário parcial aprovado. Ficam ${formatarMinutos(descoberto)} descobertos neste dia.`
                : "Horário parcial aprovado.",
            );
          } else if (acao === "REOFERTAR") {
            toast.success(
              `Dia oferecido a ${res?.ofertas_criadas ?? aptos.length} pessoa(s). A proposta parcial segue reservada.`,
            );
          } else {
            toast.success("Horário parcial recusado.");
          }
          onOpenChange(false);
        },
        onError: (e: any) => {
          const msg = String(e?.message ?? "");
          toast.error(
            msg.includes("REFUSAL_REASON_REQUIRED")
              ? "Informe o motivo da recusa."
              : msg || "Não foi possível concluir.",
          );
        },
      },
    );

  return (
    <Dialog open={!!parcial} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" /> Horário parcial · {parcial.colaborador_nome}
          </DialogTitle>
          <DialogDescription className="capitalize">
            {rotuloData(parcial.data)}
            {parcial.cargo_nome ? ` · ${parcial.cargo_nome}` : ""}
            {parcial.unidade_nome ? ` · ${parcial.unidade_nome}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border p-3 text-sm space-y-1">
          <p>
            Horário pedido: {hhmm(parcial.necessidade_entrada)} → {hhmm(parcial.necessidade_saida)}
            {parcial.necessidade_termina_no_dia_seguinte ? " (+1)" : ""}
          </p>
          <p className="font-medium">
            Oferecido: {hhmm(parcial.parcial_entrada)} → {hhmm(parcial.parcial_saida)}
            {parcial.parcial_termina_no_dia_seguinte ? " (+1)" : ""}
          </p>
          {aval ? (
            <p className="text-muted-foreground">
              {descoberto > 0
                ? `Fica descoberto: ${formatarMinutos(descoberto)}`
                : "Cobre todo o horário pedido."}
            </p>
          ) : (
            <Skeleton className="h-4 w-40" />
          )}
          {parcial.parcial_observacao ? (
            <p className="pt-1">Recado: {parcial.parcial_observacao}</p>
          ) : null}
          {parcial.reofertas_pendentes > 0 ? (
            <p className="text-amber-700 dark:text-amber-300">
              {parcial.reofertas_pendentes} pessoa(s) já receberam este dia
              {rotuloPrazo(parcial.reoferta_prazo) ? ` · até ${rotuloPrazo(parcial.reoferta_prazo)}` : ""}
            </p>
          ) : null}
        </div>

        <div className="rounded-lg border border-border p-3 text-sm space-y-2">
          <p className="flex items-center gap-2 font-medium">
            <Users className="h-4 w-4" /> Quem mais está apto neste dia
          </p>
          {!aval ? (
            <Skeleton className="h-10 w-full" />
          ) : aptos.length === 0 ? (
            <p className="text-muted-foreground">
              Ninguém mais está apto agora. Se recusar, o dia pode ficar sem cobertura.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {aptos.map((a) => (
                <Badge key={a.colaborador_id} variant="outline" className="text-[11px]">
                  {a.colaborador_nome} · {hhmm(a.entrada)}–{hhmm(a.saida)}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="parcial-motivo">Justificativa (obrigatória para recusar)</Label>
          <Textarea
            id="parcial-motivo" rows={3} value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: precisamos da cobertura completa deste turno."
          />
        </div>

        {confirmandoRecusa ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm flex gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            <span>
              {aptos.length === 0
                ? "Não há outra pessoa apta para este dia. Ao recusar, o turno pode ficar sem ninguém."
                : "Há pessoas aptas. Você pode oferecer o dia a elas antes de recusar oficialmente."}
            </span>
          </div>
        ) : null}

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          {aptos.length > 0 ? (
            <Button
              variant="outline" className="gap-2"
              disabled={decidir.isPending || !aval}
              onClick={() => decidirAgora("REOFERTAR")}
            >
              <Send className="h-4 w-4" /> Oferecer aos aptos
            </Button>
          ) : null}
          <Button
            variant={confirmandoRecusa ? "destructive" : "outline"}
            className="gap-2"
            disabled={decidir.isPending || !aval}
            onClick={() => decidirAgora("RECUSAR", confirmandoRecusa)}
          >
            <X className="h-4 w-4" />
            {confirmandoRecusa ? "Recusar mesmo assim" : "Recusar"}
          </Button>
          <Button
            className="gap-2" disabled={decidir.isPending || !aval}
            onClick={() => decidirAgora("APROVAR")}
          >
            <CheckCircle2 className="h-4 w-4" /> Aprovar horário parcial
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
