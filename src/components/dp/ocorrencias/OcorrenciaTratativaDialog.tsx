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
  onAjustarHorario?: (input: { horario: string; observacao: string; marcacaoAlvo?: OcorrenciaMarcacao; concluir?: boolean }) => void;
}

const TIPOS_AJUSTE_HORARIO = ["esquecimento_marcacao", "divergencia_jornada"];

/** Decisão do gestor sobre o que precisa ser considerado depois no ponto. */
export function OcorrenciaTratativaDialog({ ocorrencia, onOpenChange, saving, modo = "tratar", onSubmit, onAjustarHorario }: Props) {
  const [decisao, setDecisao] = useState<string | null>(null);
  const [concluir, setConcluir] = useState(true);
  const [observacao, setObservacao] = useState("");
  const [horario, setHorario] = useState("");
  const [marcacao, setMarcacao] = useState<OcorrenciaMarcacao | null>(null);

  useEffect(() => {
    setDecisao(null);
    setConcluir(true);
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

  const confirmar = () => {
    if (ajustavel && ajusteMudou) {
      onAjustarHorario?.({ horario, observacao: observacao.trim(), ...(marcacao ? { marcacaoAlvo: marcacao } : {}), ...(modo === "tratar" ? { concluir: jaTratada ? false : concluir } : {}) });
    } else {
      onSubmit({ decisao: jornada ? decisao ?? "" : "confirmada", observacao });
    }
  };
  const invalido = ajustavel
    ? !horarioValido || (ocorrencia.tipo === "esquecimento_marcacao" && !marcacao) || (ajusteMudou && observacao.trim().length < 3) || ((modo === "editar" || jaTratada) && !ajusteMudou)
    : jornada && !decisao;
  const footer = (
    <Button className="min-h-12 w-full whitespace-normal" disabled={saving || !!invalido} onClick={confirmar}>
      {saving ? "Salvando…" : ajustavel ? modo === "editar" || jaTratada ? "Salvar ajuste" : ajusteMudou ? concluir ? "Salvar ajuste e confirmar" : "Salvar ajuste e manter pendente" : comPonto ? "Confirmar batida" : "Confirmar ocorrência" : "Confirmar decisão"}
    </Button>
  );

  return (
    <ResponsiveDialog open onOpenChange={(open) => !saving && onOpenChange(open)}
      title={ajustavel && comPonto ? modo === "editar" || jaTratada ? "Ajustar batida" : "Confirmar batida" : "Tratar ocorrência"}
      description={`${ocorrencia.colaborador?.nome ?? "Colaborador"} · ${ocorrencia.data_operacional?.split("-").reverse().join("/") ?? ""}`}
      className="sm:max-w-md"
      footer={footer}
    >
        <div className="space-y-4">
          <div className="space-y-2 border-b border-border pb-4">
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
          {jornada && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Decisão</legend>
              <div className="grid gap-2">
                {[["compensacao", "Compensação"], ["abono", "Abono"], ["desconto", "Desconto em Folha"]].map(([valor, label]) => (
                  <Button key={valor} variant={decisao === valor ? "default" : "outline"} className="min-h-12" aria-pressed={decisao === valor} disabled={saving} onClick={() => setDecisao(valor)}>{label}</Button>
                ))}
              </div>
            </fieldset>
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
          {ajustavel && ajusteMudou && modo === "tratar" && !jaTratada && (
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" className="h-5 w-5 accent-primary" checked={concluir} disabled={saving} onChange={(e) => setConcluir(e.target.checked)} />
              Concluir conferência ao salvar
            </label>
          )}

        </div>


    </ResponsiveDialog>
  );
}
