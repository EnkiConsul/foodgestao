import { Clock, Pencil, Trash2, Copy, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { CATEGORIA_LABEL, formatarFaixaTurno } from "@/lib/dp/turno-utils";
import { formatarHoras } from "@/lib/dp/jornada-utils";
import {
  motivoBloqueioExclusao, podeExcluirTurno, rotuloUsoTurno,
  type TurnoUsoEstado, type TurnoUsoRow,
} from "@/lib/dp/turno-uso";
import type { DpTurnoRow } from "@/hooks/useDpTurnos";

interface TurnoCardProps {
  turno: DpTurnoRow;
  unidadeNome?: string | null;
  uso?: TurnoUsoRow | null;
  usoEstado: TurnoUsoEstado;
  selecionavel?: boolean;
  selecionado?: boolean;
  onSelecionar?: (marcado: boolean) => void;
  onAbrirDetalhe: () => void;
  onEdit: () => void;
  onDuplicar: () => void;
  onDelete: () => void;
  onToggleAtivo: (ativo: boolean) => void;
}

export function TurnoCard({
  turno, unidadeNome, uso, usoEstado, selecionavel, selecionado, onSelecionar,
  onAbrirDetalhe, onEdit, onDuplicar, onDelete, onToggleAtivo,
}: TurnoCardProps) {
  const podeExcluir = podeExcluirTurno(usoEstado);
  const motivo = motivoBloqueioExclusao(usoEstado, uso);

  return (
    <Card className={turno.ativo ? undefined : "opacity-60"}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          {selecionavel && (
            <Checkbox
              className="mt-1.5"
              checked={!!selecionado}
              onCheckedChange={(v) => onSelecionar?.(v === true)}
              aria-label={`Selecionar turno ${turno.nome}`}
            />
          )}
          <span
            className="mt-1 h-8 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: turno.cor ?? "hsl(var(--primary))" }}
            aria-hidden="true"
          />
          <button
            type="button"
            onClick={onAbrirDetalhe}
            className="min-w-0 flex-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Ver detalhes e colaboradores do turno ${turno.nome}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-semibold">{turno.nome}</h3>
              {turno.versao > 1 && <Badge variant="outline">v{turno.versao}</Badge>}
              {turno.categoria && (
                <Badge variant="secondary">{CATEGORIA_LABEL[turno.categoria] ?? turno.categoria}</Badge>
              )}
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {formatarFaixaTurno({ entrada: turno.entrada, saida: turno.saida })}
              <span aria-hidden="true">·</span>
              {turno.intervalo_minutos > 0 ? `${turno.intervalo_minutos} min de intervalo` : "sem intervalo"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatarHoras(Number(turno.carga_liquida_horas ?? 0))} líquidas ·{" "}
              {unidadeNome ?? "Todas as unidades"}
            </p>
            {turno.descricao && (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{turno.descricao}</p>
            )}

            <span className="mt-2 inline-flex items-center gap-1">
              <Badge variant={usoEstado === "em_uso" ? "secondary" : "outline"} className="gap-1">
                {rotuloUsoTurno(usoEstado, uso)}
                <ChevronRight className="h-3 w-3" aria-hidden="true" />
              </Badge>
            </span>
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 border-t pt-3">
          <div className="flex items-center gap-2">
            <Switch
              checked={turno.ativo}
              onCheckedChange={onToggleAtivo}
              aria-label={turno.ativo ? "Desativar turno" : "Ativar turno"}
            />
            <span className="text-xs text-muted-foreground">{turno.ativo ? "Ativo" : "Inativo"}</span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-10 w-10" aria-label="Duplicar turno" onClick={onDuplicar}>
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-10 w-10" aria-label="Editar turno" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 text-destructive"
              aria-label="Excluir turno"
              disabled={!podeExcluir}
              title={motivo ?? undefined}
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
