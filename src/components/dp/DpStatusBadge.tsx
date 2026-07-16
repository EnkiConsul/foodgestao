import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/**
 * Tom semântico dos badges de status do módulo DP.
 * Mapeia diretamente para as classes usadas na doc de referência
 * (bg-{cor}-100 / text-{cor}-700), mantendo consistência entre telas.
 */
export type DpStatusTone =
  | "neutral"
  | "success"
  | "danger"
  | "warning"
  | "info"
  | "muted";

const TONE_CLASSES: Record<DpStatusTone, string> = {
  neutral: "bg-primary/10 text-primary border-transparent",
  success: "bg-emerald-100 text-emerald-700 border-transparent dark:bg-emerald-500/15 dark:text-emerald-300",
  danger: "bg-rose-100 text-rose-700 border-transparent dark:bg-rose-500/15 dark:text-rose-300",
  warning: "bg-amber-100 text-amber-800 border-transparent dark:bg-amber-500/15 dark:text-amber-300",
  info: "bg-sky-100 text-sky-800 border-transparent dark:bg-sky-500/15 dark:text-sky-300",
  muted: "bg-muted text-muted-foreground border-transparent",
};

interface DpStatusBadgeProps {
  tone?: DpStatusTone;
  children: React.ReactNode;
  className?: string;
  pill?: boolean;
}

export function DpStatusBadge({
  tone = "neutral",
  children,
  className,
  pill = true,
}: DpStatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-medium",
        pill && "rounded-full px-3",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </Badge>
  );
}

/** Helper de conveniência para os enums mais comuns do DP. */
export function statusToneFor(
  value: string | null | undefined,
): DpStatusTone {
  const v = (value ?? "").toLowerCase();
  if (["aprovada", "aprovado", "ativo", "concluida", "concluído", "concluido"].includes(v)) return "success";
  if (["recusada", "recusado", "cancelada", "cancelado", "inativo", "bloqueada", "bloqueado"].includes(v)) return "danger";
  if (["pendente", "aguardando", "em_analise", "em análise"].includes(v)) return "warning";
  if (["rascunho", "novo", "aberta", "aberto"].includes(v)) return "info";
  return "neutral";
}
