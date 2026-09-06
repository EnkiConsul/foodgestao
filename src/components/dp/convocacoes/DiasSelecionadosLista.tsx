import { AlertTriangle, Copy, Trash2, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
}: Props) {
  if (itens.length === 0) return null;

  return (
    <div className="space-y-2">
      <Label className="text-xs">Datas selecionadas</Label>
      <div className="space-y-2">
        {itens.map((d) => {
          const semHorario = !d.entrada || !d.saida;
          return (
            <div
              key={d.chave}
              className="space-y-2 rounded-lg border border-border p-2.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold capitalize">{rotuloData(d.data)}</span>
                <div className="flex items-center gap-1">
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
                <div className="space-y-1">
                  <Label className="text-[11px]">Vagas</Label>
                  <Input
                    inputMode="numeric"
                    className="h-8"
                    value={String(d.vagas)}
                    onChange={(e) =>
                      onPatch(d.chave, {
                        vagas: Math.max(1, Number(e.target.value.replace(/\D/g, "") || 1)),
                      })
                    }
                  />
                </div>
                <label className="flex items-end gap-2 pb-1.5 text-[11px]">
                  <Checkbox
                    checked={d.vira}
                    onCheckedChange={(v) => onPatch(d.chave, { vira: v === true })}
                  />
                  Termina no dia seguinte
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
