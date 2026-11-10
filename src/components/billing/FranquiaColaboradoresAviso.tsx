import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Info, Users } from "lucide-react";
import { buscarPreviaFranquia } from "@/lib/billing/excedente-colaboradores";
import { avaliarFranquia, type EstadoFranquia } from "@/lib/billing/franquia";
import { formatCents } from "@/lib/billing";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Prévia da franquia de colaboradores, compartilhada entre os cartões da tela. */
export function useFranquiaColaboradores(companyId: string | null | undefined) {
  return useQuery({
    queryKey: ["franquia-colaboradores", companyId],
    enabled: !!companyId,
    staleTime: 30_000,
    queryFn: () => buscarPreviaFranquia(companyId!),
  });
}

export function useEstadoFranquia(companyId: string | null | undefined, novos = 1): EstadoFranquia | null {
  const q = useFranquiaColaboradores(companyId);
  if (!q.data) return null;
  return avaliarFranquia(q.data, novos);
}

interface Props {
  estado: EstadoFranquia | null;
  /** Quantos cadastros novos a tela vai incluir (1 = cadastro único). */
  novos?: number;
  className?: string;
}

/**
 * Aviso exibido antes de preencher o cadastro: franquia cheia (com custo do
 * excedente e comparação com o Enterprise) ou bloqueio para quem não pode autorizar.
 */
export function FranquiaColaboradoresAviso({ estado, novos = 1, className }: Props) {
  if (!estado) return null;
  if (estado.tipo === "livre") return null;

  if (estado.tipo === "por_colaborador") {
    if (novos <= 1) return null;
    return (
      <div role="status" className={cn("flex gap-2 rounded-md border bg-muted/30 p-3 text-xs", className)}>
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p>
          Seu plano cobra {formatCents(estado.unitarioCents)} por colaborador ativo. Estes {novos} cadastros somam{" "}
          {formatCents(estado.unitarioCents * novos)}/mês à mensalidade.
        </p>
      </div>
    );
  }

  const ent = estado.enterprise?.compensa ? estado.enterprise : null;
  const bloqueado = estado.tipo === "bloqueado";

  return (
    <div
      role="alert"
      className={cn(
        "space-y-2 rounded-md border p-3 text-sm",
        bloqueado ? "border-destructive/50 bg-destructive/5" : "border-warning/50 bg-warning/10",
        className,
      )}
    >
      <div className="flex gap-2">
        {bloqueado
          ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          : <Users className="mt-0.5 h-4 w-4 shrink-0 text-warning" />}
        <div className="min-w-0 space-y-1">
          <p className="font-medium">
            Franquia completa: {estado.atual} de {estado.limite} colaboradores
          </p>
          {estado.tipo === "excedente" ? (
            <p className="text-xs text-muted-foreground">
              {novos > 1
                ? `${estado.excedentes} destes cadastros passam da franquia`
                : "Este cadastro passa da franquia"}{" "}
              e custa {formatCents(estado.valorUnitCents)}/mês por colaborador. Você confirma o valor ao salvar.
            </p>
          ) : estado.motivo === "sem_permissao" ? (
            <p className="text-xs text-muted-foreground">
              Só o dono ou um administrador da empresa pode incluir colaboradores acima da franquia. Peça a um deles para
              concluir este cadastro ou mudar de plano — o que você preencher não se perde.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Para incluir mais colaboradores, amplie o plano antes de concluir.
            </p>
          )}
        </div>
      </div>
      {ent && (
        <div className="flex flex-col gap-2 rounded-md bg-background/70 p-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs">
            <strong>{ent.nome}</strong>: {formatCents(ent.valorEnterpriseCents)}/mês, contra{" "}
            {formatCents(ent.valorAtualCents)}/mês no plano atual. Sem limite de colaboradores.
          </p>
          {!(bloqueado && estado.motivo === "sem_permissao") && (
            <Button size="sm" variant="outline" className="shrink-0" asChild>
              <a href={`/planos?plano=${ent.plano}`}>Ver o Enterprise</a>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
