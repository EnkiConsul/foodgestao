import { useState, type ReactNode } from "react";
import { AlertTriangle, CalendarClock, Copy, Minus, Plus, Trash2, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { viraNoDiaSeguinte } from "@/lib/dp/convocacoes-planejamento";



export type OrigemHorario = "historico" | "sugerida" | "geral" | "manual";

export interface DiaSelecionadoItem {
  chave: string;
  data: string;
  entrada: string;
  saida: string;
  vira: boolean;
  vagas: number;
  origem: OrigemHorario;
  ambiguo: boolean;
  faltam: number | null;
}

interface Props {
  itens: DiaSelecionadoItem[];
  onPatch: (chave: string, patch: Partial<Pick<DiaSelecionadoItem, "entrada" | "saida" | "vira" | "vagas">>) => void;
  onRemover: (chave: string) => void;
  onAbrirIndividuais: (chave: string) => void;
  onAplicarATodos: (chave: string) => void;
  /** Rotina do dia simulada, montada sob demanda ao expandir a linha. */
  renderSimulacao?: (item: DiaSelecionadoItem) => ReactNode;
  /**
   * Dia que travou a publicação. Os outros dias ficam recolhidos para facilitar
   * a leitura — nada é publicado separadamente, apenas a exibição muda.
   */
  destacarData?: string | null;
}

const ROTULO_ORIGEM: Record<OrigemHorario, string> = {
  historico: "Usado nas convocações anteriores",
  sugerida: "Horário mais usado pela equipe fixa",
  geral: "Horário padrão da convocação",
  manual: "Ajustado por você",
};

const rotuloData = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });

/** Dias marcados no calendário, já com o horário padrão preenchido e editável na linha. */
export function DiasSelecionadosLista({
  itens,
  onPatch,
  onRemover,
  onAbrirIndividuais,
  onAplicarATodos,
  renderSimulacao,
  destacarData = null,
}: Props) {
  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({});
  const [reabertos, setReabertos] = useState<Record<string, boolean>>({});
  if (itens.length === 0) return null;


  return (
    <div className="space-y-2">
      <Label className="text-xs">Datas selecionadas</Label>
      <div className="space-y-2">
        {itens.map((d) => {
          const semHorario = !d.entrada || !d.saida;
          const comErro = !!destacarData && d.data === destacarData;
          const recolhido = !!destacarData && !comErro && !reabertos[d.chave];
          if (recolhido) {
            return (
              <button
                key={d.chave}
                type="button"
                onClick={() => setReabertos((prev) => ({ ...prev, [d.chave]: true }))}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-2 text-left text-xs hover:bg-muted"
              >
                <span className="font-medium capitalize">{rotuloData(d.data)}</span>
                <span className="text-muted-foreground">
                  {d.entrada && d.saida ? `${d.entrada} às ${d.saida}` : "sem horário"} · toque para abrir
                </span>
              </button>
            );
          }
          return (
            <div
              key={d.chave}
              className={
                comErro
                  ? "space-y-2 rounded-lg border-2 border-destructive/60 bg-destructive/5 p-2.5"
                  : "space-y-2 rounded-lg border border-border p-2.5"
              }
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold capitalize">
                  {rotuloData(d.data)}
                  {comErro && (
                    <span className="ml-2 font-medium text-destructive">Dia com problema</span>
                  )}
                </span>
                <div className="flex min-w-0 flex-wrap items-center gap-1">

                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => onAplicarATodos(d.chave)}
                    disabled={semHorario || itens.length < 2}
                  >
                    <Copy className="mr-1 h-3 w-3" /> Aplicar a todos os dias
                  </Button>
                  {renderSimulacao && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[11px]"
                      onClick={() =>
                        setExpandidos((prev) => ({ ...prev, [d.chave]: !prev[d.chave] }))
                      }
                    >
                      <CalendarClock className="mr-1 h-3 w-3" />
                      {expandidos[d.chave] ? "Ocultar rotina do dia" : "Ver rotina do dia"}
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => onAbrirIndividuais(d.chave)}
                  >
                    <UserCog className="mr-1 h-3 w-3" /> Horário por pessoa
                  </Button>

                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground"
                    onClick={() => onRemover(d.chave)}
                    aria-label={`Remover ${rotuloData(d.data)}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <div className="space-y-1">
                  <Label className="text-[11px]">Entrada</Label>
                  <Input
                    type="time"
                    className="h-8"
                    value={d.entrada}
                    onChange={(e) => onPatch(d.chave, { entrada: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Saída</Label>
                  <Input
                    type="time"
                    className="h-8"
                    value={d.saida}
                    onChange={(e) => onPatch(d.chave, { saida: e.target.value })}
                  />
                </div>
                <div className="col-span-2 min-w-0 space-y-1 md:col-span-1">
                  <Label className="text-[11px]">Vagas</Label>
                  <div className="flex min-w-0 items-center gap-1">

                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-8 w-8 shrink-0"
                      aria-label="Diminuir vagas"
                      disabled={d.vagas <= 1}
                      onClick={() => onPatch(d.chave, { vagas: Math.max(1, d.vagas - 1) })}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <Input
                      inputMode="numeric"
                      className="h-8 text-center"
                      value={String(d.vagas)}
                      onChange={(e) =>
                        onPatch(d.chave, {
                          vagas: Math.max(1, Number(e.target.value.replace(/\D/g, "") || 1)),
                        })
                      }
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-8 w-8 shrink-0"
                      aria-label="Aumentar vagas"
                      onClick={() => onPatch(d.chave, { vagas: d.vagas + 1 })}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <label className="col-span-2 flex min-w-0 flex-wrap items-center gap-2 text-[11px] md:col-span-1 md:items-end md:pb-1.5">
                  <Checkbox
                    checked={d.vira}
                    disabled={viraNoDiaSeguinte(d.entrada, d.saida)}
                    onCheckedChange={(v) => onPatch(d.chave, { vira: v === true })}
                  />
                  Termina no dia seguinte
                  {viraNoDiaSeguinte(d.entrada, d.saida) && (
                    <span className="text-muted-foreground">(a saída é no dia seguinte)</span>
                  )}
                </label>

              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                {semHorario ? (
                  <span className="flex items-center gap-1 text-destructive">
                    <AlertTriangle className="h-3 w-3" /> Sem horário de referência — informe
                  </span>
                ) : (
                  <span>{ROTULO_ORIGEM[d.origem]}</span>
                )}
                {d.ambiguo && !semHorario && <span>Mais de um horário praticado neste dia</span>}
                {d.faltam ? <span>Faltam {d.faltam} para o mínimo</span> : null}
              </div>

              {renderSimulacao && expandidos[d.chave] && renderSimulacao(d)}
            </div>

          );
        })}
      </div>
    </div>
  );
}
