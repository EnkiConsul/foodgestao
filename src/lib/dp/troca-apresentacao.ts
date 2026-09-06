import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

/** Rótulo e cor de cada situação de troca de folga. */
export const STATUS_TROCA_META: Record<string, { label: string; className: string }> = {
  pendente_colega: {
    label: "Aguardando colega",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40",
  },
  pendente_gestor: {
    label: "Aguardando gestor",
    className: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/40",
  },
  aprovada: {
    label: "Aprovada",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
  },
  recusada: {
    label: "Recusada",
    className: "bg-destructive/15 text-destructive border-destructive/40",
  },
  cancelada: {
    label: "Cancelada",
    className: "bg-muted text-muted-foreground border-border",
  },
  expirada: {
    label: "Expirada",
    className: "bg-muted text-muted-foreground border-border",
  },
};

export function metaStatusTroca(status: string) {
  return (
    STATUS_TROCA_META[status] ?? {
      label: status,
      className: "bg-muted text-muted-foreground border-border",
    }
  );
}

/** "Seg, 14/09" (ou "Segunda-feira, 14/09/2026" quando completo). */
export function dataComDiaSemana(iso: string | null, completo = false): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  const dia = format(d, completo ? "EEEE" : "EEEEEE", { locale: ptBR });
  const label = dia.charAt(0).toUpperCase() + dia.slice(1);
  return `${label}, ${format(d, completo ? "dd/MM/yyyy" : "dd/MM")}`;
}

/**
 * Registro antigo inválido: mesma data nos dois lados ou a mesma pessoa como
 * solicitante e colega. Não é troca real — só existe no histórico legado.
 */
export function trocaInconsistente(troca: {
  data_original: string | null;
  data_proposta: string | null;
  solicitante_id?: string | null;
  destino_id?: string | null;
}): boolean {
  if (troca.data_original && troca.data_original === troca.data_proposta) return true;
  return !!troca.solicitante_id && troca.solicitante_id === troca.destino_id;
}

