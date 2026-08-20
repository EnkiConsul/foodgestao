import { Clock, Pencil, Trash2, Copy, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CATEGORIA_LABEL, formatarFaixaTurno } from "@/lib/dp/turno-utils";
import { formatarHoras } from "@/lib/dp/jornada-utils";
import {
  detalhesUsoTurno, motivoBloqueioExclusao, podeExcluirTurno, rotuloUsoTurno,
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
  onEdit: () => void;
  onDuplicar: () => void;
  onDelete: () => void;
  onToggleAtivo: (ativo: boolean) => void;
}

export function TurnoCard({
  turno, unidadeNome, uso, usoEstado, selecionavel, selecionado, onSelecionar,
  onEdit, onDuplicar, onDelete, onToggleAtivo,
}: TurnoCardProps) {
  const detalhes = detalhesUsoTurno(uso);
  const podeExcluir = podeExcluirTurno(usoEstado);
  const motivo = motivoBloqueioExclusao(usoEstado, uso);

  const variantSelo = usoEstado === "em_uso"
    ? "secondary"
    : usoEstado === "sem_uso"
      ? "outline"
      : "outline";

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
          <div className="min-w-0 flex-1">
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

            <div className="mt-2">
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" className="inline-flex" aria-label="Ver detalhes de uso do turno">
                    <Badge variant={variantSelo} className="gap-1">
                      {rotuloUsoTurno(usoEstado, uso)}
                      <Info className="h-3 w-3" aria-hidden="true" />
                    </Badge>
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 text-sm">
                  <p className="font-medium">Onde este turno é usado</p>
                  {detalhes.length === 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Nenhum vínculo encontrado. Pode ser excluído com segurança.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {detalhes.map((d) => (
                        <li key={d.rotulo} className="flex justify-between gap-2">
                          <span>{d.rotulo}</span>
                          <span className="font-medium text-foreground">{d.quantidade}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {motivo && <p className="mt-2 text-xs text-muted-foreground">{motivo}</p>}
                </PopoverContent>
              </Popover>
            </div>
          </div>
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
