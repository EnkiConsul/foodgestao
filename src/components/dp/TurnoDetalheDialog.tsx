import { Clock, Copy, Pencil, Trash2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { categoriaLabel, formatarFaixaTurno } from "@/lib/dp/turno-utils";
import { useTurnoCategoriaLabels } from "@/hooks/useTurnoCategoriaLabels";
import { formatarHoras } from "@/lib/dp/jornada-utils";
import {
  detalhesUsoTurno, motivoBloqueioExclusao, podeExcluirTurno,
  type TurnoUsoEstado, type TurnoUsoRow,
} from "@/lib/dp/turno-uso";
import {
  ORIGEM_VINCULO_LABEL, useDpTurnoColaboradores,
} from "@/hooks/useDpTurnoColaboradores";
import type { DpTurnoRow } from "@/hooks/useDpTurnos";

const LIMITE_LISTA = 50;

interface TurnoDetalheDialogProps {
  turno: DpTurnoRow | null;
  unidadeNome?: string | null;
  uso?: TurnoUsoRow | null;
  usoEstado: TurnoUsoEstado;
  onOpenChange: (open: boolean) => void;
  onEditar: () => void;
  onDuplicar: () => void;
  onExcluir: () => void;
  onAbrirColaborador: (colaboradorId: string) => void;
}

export function TurnoDetalheDialog({
  turno, unidadeNome, uso, usoEstado,
  onOpenChange, onEditar, onDuplicar, onExcluir, onAbrirColaborador,
}: TurnoDetalheDialogProps) {
  const colaboradores = useDpTurnoColaboradores(turno?.id ?? null, !!turno);
  const lista = colaboradores.data ?? [];
  const visiveis = lista.slice(0, LIMITE_LISTA);
  const restantes = lista.length - visiveis.length;
  const detalhes = detalhesUsoTurno(uso);
  const motivo = motivoBloqueioExclusao(usoEstado, uso);
  const { categorias } = useTurnoCategoriaLabels();

  return (
    <Dialog open={!!turno} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-lg">
        <DialogHeader className="border-b p-5 text-left">
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {turno?.nome}
            {turno && turno.versao > 1 && <Badge variant="outline">v{turno.versao}</Badge>}
            {turno?.categoria && (
              <Badge variant="secondary">
                {categoriaLabel(turno.categoria, categorias)}
              </Badge>
            )}
            {turno && !turno.ativo && <Badge variant="outline">Inativo</Badge>}
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {turno && formatarFaixaTurno({ entrada: turno.entrada, saida: turno.saida })}
            <span aria-hidden="true">·</span>
            {turno && turno.intervalo_minutos > 0
              ? `${turno.intervalo_minutos} min de intervalo`
              : "sem intervalo"}
            <span aria-hidden="true">·</span>
            {turno && `${formatarHoras(Number(turno.carga_liquida_horas ?? 0))} líquidas`}
            <span aria-hidden="true">·</span>
            {unidadeNome ?? "Todas as unidades"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <section className="space-y-2">
            <h3 className="text-sm font-medium">Onde este turno é usado</h3>
            {detalhes.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhum vínculo encontrado. Pode ser excluído com segurança.
              </p>
            ) : (
              <ul className="space-y-1 text-xs text-muted-foreground">
                {detalhes.map((d) => (
                  <li key={d.rotulo} className="flex justify-between gap-2">
                    <span>{d.rotulo}</span>
                    <span className="font-medium text-foreground">{d.quantidade}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-sm font-medium">
              <Users className="h-4 w-4" aria-hidden="true" />
              Colaboradores vinculados
              {lista.length > 0 && (
                <span className="text-xs font-normal text-muted-foreground">({lista.length})</span>
              )}
            </h3>

            {colaboradores.isLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
              </div>
            ) : colaboradores.error ? (
              <p className="text-xs text-muted-foreground">
                Não foi possível carregar os colaboradores deste turno.
              </p>
            ) : lista.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhum colaborador vinculado a este turno.
              </p>
            ) : (
              <>
                <ul className="divide-y rounded-lg border">
                  {visiveis.map((c) => (
                    <li key={c.colaborador_id}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 p-2.5 text-left hover:bg-muted/60"
                        onClick={() => onAbrirColaborador(c.colaborador_id)}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{c.nome}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {c.cargo_nome ?? "Sem cargo"} · {c.unidade_nome ?? "Sem unidade"}
                            {c.ativo === false ? " · desligado" : ""}
                          </p>
                        </div>
                        <Badge variant="outline" className="shrink-0">
                          {ORIGEM_VINCULO_LABEL[c.origem] ?? c.origem}
                        </Badge>
                      </button>
                    </li>
                  ))}
                </ul>
                {restantes > 0 && (
                  <p className="text-xs text-muted-foreground">+{restantes} colaborador(es)</p>
                )}
              </>
            )}
          </section>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t p-4">
          <Button variant="outline" className="h-11" onClick={onDuplicar}>
            <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
            Duplicar
          </Button>
          <Button
            variant="outline"
            className="h-11 text-destructive"
            disabled={!podeExcluirTurno(usoEstado)}
            title={motivo ?? undefined}
            onClick={onExcluir}
          >
            <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
            Excluir
          </Button>
          <Button className="h-11" onClick={onEditar}>
            <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
            Editar turno
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
