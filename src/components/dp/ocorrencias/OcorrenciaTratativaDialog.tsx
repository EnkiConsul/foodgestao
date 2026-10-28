import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { rotuloTipoOcorrencia, ocorrenciaDeFolga, temControlePonto } from "@/lib/dp/ocorrencias";

/** Tipos de jornada em que o gestor decide entre Compensação, Abono ou Desconto em Folha. */
const TIPOS_DECISAO_JORNADA = ["atraso", "falta", "saida_antecipada", "atraso_intervalo"];
import { resumoTratativa } from "@/lib/dp/ocorrencia-resumo";
import type { Ocorrencia } from "@/hooks/useDpOcorrencias";

interface Props {
  ocorrencia: Ocorrencia | null;
  onOpenChange: (open: boolean) => void;
  saving?: boolean;
  onSubmit: (input: { decisao: string; observacao: string }) => void;
  /** Gestor grava o horário real apurado (esquecimento/divergência). */
  onAjustarHorario?: (input: { horario: string; observacao: string }) => void;
}

const TIPOS_AJUSTE_HORARIO = ["esquecimento_marcacao", "divergencia_jornada"];

/** Decisão do gestor sobre o que precisa ser considerado depois no ponto. */
export function OcorrenciaTratativaDialog({ ocorrencia, onOpenChange, saving, onSubmit, onAjustarHorario }: Props) {
  const [observacao, setObservacao] = useState("");
  const [horario, setHorario] = useState("");

  useEffect(() => {
    setObservacao(ocorrencia?.tratativa_observacao ?? "");
    setHorario((ocorrencia?.horario_real ?? "").slice(0, 5));
  }, [ocorrencia?.id, ocorrencia?.tratativa_observacao, ocorrencia?.horario_real]);

  if (!ocorrencia) return null;
  const r = resumoTratativa(ocorrencia);
  const comPonto = temControlePonto(ocorrencia);
  const jornada = TIPOS_DECISAO_JORNADA.includes(ocorrencia.tipo);
  const ajustavel = !!onAjustarHorario && TIPOS_AJUSTE_HORARIO.includes(ocorrencia.tipo);
  const informado = (ocorrencia.horario_real ?? "").slice(0, 5);
  const horarioMudou = ajustavel && /^\d{2}:\d{2}$/.test(horario) && horario !== informado;
  const jaTratada = ocorrencia.tratativa_status !== "pendente";

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{jaTratada && ajustavel ? "Ajustar horário" : comPonto ? "Tratar ponto" : "Conferir ocorrência"}</DialogTitle>
          <DialogDescription>{ocorrencia.colaborador?.nome}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-border p-3">
            <p className="text-sm font-medium">{r.titulo}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {r.batida ?? rotuloTipoOcorrencia(ocorrencia)}
              {r.horario ? ` às ${r.horario}` : ""}
              {r.previsto && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">(previsto {r.previsto})</span>
              )}
            </p>
            {ocorrencia.justificativa_inicial && (
              <p className="mt-1 text-sm italic text-muted-foreground">“{ocorrencia.justificativa_inicial}”</p>
            )}
          </div>
          {ajustavel && (
            <div className="space-y-1.5">
              <Label htmlFor="horario-apurado">Horário real apurado</Label>
              <Input
                id="horario-apurado"
                type="time"
                value={horario}
                onChange={(e) => setHorario(e.target.value)}
                className="w-36"
              />
              <p className="text-xs text-muted-foreground">
                {informado ? `Informado pelo colaborador: ${informado}. ` : ""}Altere se o horário correto for outro.
              </p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>{horarioMudou ? "Motivo do ajuste *" : "Observação (opcional)"}</Label>
            <Textarea
              rows={2}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder={comPonto && r.horario ? `Ex.: considerar ${r.batida?.toLowerCase() ?? "marcação"} às ${r.horario}.` : ""}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {jornada
              ? "Escolha a decisão: Compensação (o tempo será compensado), Abono ou Desconto em Folha. Nada é descontado sem a sua escolha."
              : comPonto
                ? "Ao decidir, a ocorrência já sai das pendências. O ponto em si é ajustado por quem faz o tratamento."
                : "Ao confirmar, você registra ciência da justificativa e a ocorrência sai das pendências."}
          </p>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          {jornada ? (
            <>
              <Button variant="outline" disabled={saving} onClick={() => onSubmit({ decisao: "desconto", observacao })}>
                Desconto em Folha
              </Button>
              <Button variant="outline" disabled={saving} onClick={() => onSubmit({ decisao: "abono", observacao })}>
                Abono
              </Button>
              <Button disabled={saving} onClick={() => onSubmit({ decisao: "compensacao", observacao })}>
                Compensação
              </Button>
            </>
          ) : horarioMudou ? (
            <Button
              disabled={saving || observacao.trim().length < 3}
              onClick={() => onAjustarHorario?.({ horario, observacao: observacao.trim() })}
            >
              Salvar horário {horario}
            </Button>
          ) : jaTratada && ajustavel ? null : (
            <>
              {comPonto && (
                <Button variant="outline" disabled={saving} onClick={() => onSubmit({ decisao: "ajuste_solicitado", observacao })}>
                  Anotar ajuste p/ quem lança o ponto
                </Button>
              )}
              <Button disabled={saving} onClick={() => onSubmit({ decisao: "confirmada", observacao })}>
                {ocorrenciaDeFolga(ocorrencia)
                  ? "Confirmar justificativa"
                  : !comPonto
                    ? "Registrar ciência"
                    : r.horario
                      ? `Aceitar ${r.horario}`
                      : "Aceitar"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
