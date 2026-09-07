import { DpDialogShell } from "@/components/dp/DpDialogShell";
import { Badge } from "@/components/ui/badge";
import { useDpOcorrenciaEventos, textoEvento } from "@/hooks/useDpOcorrenciaEventos";
import { TIPO_LABEL } from "@/lib/dp/ocorrencias";
import type { Ocorrencia } from "@/hooks/useDpOcorrencias";

interface Props {
  ocorrencia: Ocorrencia | null;
  onOpenChange: (open: boolean) => void;
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export function OcorrenciaHistoricoDialog({ ocorrencia, onOpenChange }: Props) {
  const { eventos, loading } = useDpOcorrenciaEventos(ocorrencia?.id ?? null);

  return (
    <DpDialogShell
      open={!!ocorrencia}
      onOpenChange={onOpenChange}
      title="Histórico da ocorrência"
      description={
        ocorrencia
          ? `${ocorrencia.colaborador?.nome ?? "Colaborador"} · ${TIPO_LABEL[ocorrencia.tipo]}`
          : undefined
      }
      size="sm"
    >
      {loading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
      ) : eventos.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nenhuma mudança registrada ainda.
        </p>
      ) : (
        <ol className="space-y-2">
          {eventos.map((e) => (
            <li key={e.id} className="rounded-md border p-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{textoEvento(e)}</span>
                <Badge variant="outline" className="text-[10px]">
                  {fmt(e.created_at)}
                </Badge>
              </div>
              {e.campo && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {e.campo}
                  {e.valor_anterior ? `: de ${e.valor_anterior}` : ""}
                  {e.valor_novo ? ` para ${e.valor_novo}` : ""}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </DpDialogShell>
  );
}
