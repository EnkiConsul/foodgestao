import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { rotuloTipoOcorrencia, ocorrenciaDeFolga, temControlePonto, MARCACAO_LABEL, type OcorrenciaMarcacao } from "@/lib/dp/ocorrencias";

/** Tipos de jornada em que o gestor decide entre Compensação, Abono ou Desconto em Folha. */
const TIPOS_DECISAO_JORNADA = ["atraso", "falta", "saida_antecipada", "atraso_intervalo"];
import { resumoTratativa } from "@/lib/dp/ocorrencia-resumo";
import type { Ocorrencia } from "@/hooks/useDpOcorrencias";

interface Props {
  ocorrencia: Ocorrencia | null;
  onOpenChange: (open: boolean) => void;
  saving?: boolean;
  modo?: "editar" | "tratar";
  onSubmit: (input: { decisao: string; observacao: string }) => void;
  /** Gestor grava o horário real apurado (esquecimento/divergência). */
  onAjustarHorario?: (input: { horario: string; observacao: string; marcacaoAlvo?: OcorrenciaMarcacao }) => void;
}

const TIPOS_AJUSTE_HORARIO = ["esquecimento_marcacao", "divergencia_jornada"];

/** Decisão do gestor sobre o que precisa ser considerado depois no ponto. */
export function OcorrenciaTratativaDialog({ ocorrencia, onOpenChange, saving, modo = "tratar", onSubmit, onAjustarHorario }: Props) {
  const [observacao, setObservacao] = useState("");
  const [horario, setHorario] = useState("");
  const [marcacao, setMarcacao] = useState<OcorrenciaMarcacao | null>(null);

  useEffect(() => {
    setObservacao(modo === "editar" ? "" : ocorrencia?.tratativa_observacao ?? "");
    setMarcacao(ocorrencia?.marcacao_alvo ?? null);
    setHorario((ocorrencia?.horario_real ?? "").slice(0, 5));
  }, [ocorrencia?.id, ocorrencia?.tratativa_observacao, ocorrencia?.horario_real, ocorrencia?.marcacao_alvo, modo]);

  if (!ocorrencia) return null;
  const r = resumoTratativa(ocorrencia);
  const comPonto = temControlePonto(ocorrencia);
  const jornada = TIPOS_DECISAO_JORNADA.includes(ocorrencia.tipo);
  const ajustavel = !!onAjustarHorario && TIPOS_AJUSTE_HORARIO.includes(ocorrencia.tipo);
  const informado = (ocorrencia.horario_real ?? "").slice(0, 5);
  const horarioValido = /^([01]\d|2[0-3]):[0-5]\d$/.test(horario);
  const horarioMudou = ajustavel && horarioValido && horario !== informado;
  const observacaoMudou = observacao.trim() !== (modo === "editar" ? "" : ocorrencia.tratativa_observacao ?? "").trim();
  const ajusteMudou = ajustavel && (horarioMudou || marcacao !== (ocorrencia.marcacao_alvo ?? null) || observacaoMudou);
  const jaTratada = ocorrencia.tratativa_status !== "pendente";

  const footer = (
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap [&_button]:min-h-11">
          <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
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
          ) : ajustavel ? (
            <>
            <Button
              disabled={saving || !horarioValido || !ajusteMudou || observacao.trim().length < 3 || (ocorrencia.tipo === "esquecimento_marcacao" && !marcacao)}
              onClick={() => onAjustarHorario?.({ horario, observacao: observacao.trim(), ...(marcacao ? { marcacaoAlvo: marcacao } : {}) })}
            >
              {saving ? "Salvando…" : "Salvar ajuste"}
            </Button>
            {modo !== "editar" && !jaTratada && !ajusteMudou && (
              <Button disabled={saving} onClick={() => onSubmit({ decisao: "confirmada", observacao })}>
                {r.horario ? `Aceitar ${r.horario}` : "Aceitar"}
              </Button>
            )}
            </>
          ) : (
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
        </div>
  );

  return (
    <ResponsiveDialog open onOpenChange={(open) => !saving && onOpenChange(open)}
      title={modo === "editar" ? "Editar ocorrência" : comPonto ? "Tratar ponto" : "Conferir ocorrência"}
      description={`${ocorrencia.colaborador?.nome ?? "Colaborador"} · ${ocorrencia.data_operacional?.split("-").reverse().join("/") ?? ""}`}
      className="sm:max-w-md"
      footer={footer}
    >
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
            <div className="space-y-4">
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Marcação a corrigir</legend>
                <div className="grid grid-cols-2 gap-2">
                  {(["entrada", "intervalo_inicio", "intervalo_retorno", "saida"] as OcorrenciaMarcacao[]).map((valor) => (
                    <Button key={valor} variant={marcacao === valor ? "default" : "outline"} className="min-h-11 whitespace-normal px-2" aria-pressed={marcacao === valor} disabled={saving} onClick={() => setMarcacao(valor)}>{MARCACAO_LABEL[valor]}</Button>
                  ))}
                </div>
              </fieldset>
              <Label htmlFor="horario-apurado">Horário real apurado</Label>
              <Input
                id="horario-apurado"
                type="time"
                value={horario}
                onChange={(e) => setHorario(e.target.value)}
                className="h-11 w-full text-base"
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">
                {informado ? `Horário registrado: ${informado}. ` : ""}Altere se o horário correto for outro.
              </p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="observacao-tratativa">{ajustavel ? "Motivo do ajuste" : "Observação (opcional)"}</Label>
            <Textarea
              id="observacao-tratativa"
              aria-describedby={ajustavel ? "motivo-ajuste-ajuda" : undefined}
              rows={3}
              disabled={saving}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder={comPonto && r.horario ? `Ex.: considerar ${r.batida?.toLowerCase() ?? "marcação"} às ${r.horario}.` : ""}
            />
            {ajustavel && (
              <p id="motivo-ajuste-ajuda" className={ajusteMudou && observacao.trim().length < 3 ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                Informe o motivo do ajuste (mínimo de 3 caracteres).
              </p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {modo === "editar"
              ? "A correção preserva a justificativa original e não conclui a conferência. O lançamento no ponto externo continua separado."
              : jornada
              ? "Escolha a decisão: Compensação (o tempo será compensado), Abono ou Desconto em Folha. Nada é descontado sem a sua escolha."
              : comPonto
                ? "Ao decidir, a ocorrência já sai das pendências. O ponto em si é ajustado por quem faz o tratamento."
                : "Ao confirmar, você registra ciência da justificativa e a ocorrência sai das pendências."}
          </p>
        </div>


    </ResponsiveDialog>
  );
}
