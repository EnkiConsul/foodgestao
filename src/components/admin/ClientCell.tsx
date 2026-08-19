import { useUserNames } from "@/hooks/useUserNames";
import { cn } from "@/lib/utils";

interface ClientCellProps {
  userId?: string | null;
  /** Hide the truncated id subline (default: false). */
  compact?: boolean;
  className?: string;
}

/**
 * Standard backoffice cell for rendering a user_id as the client's name,
 * with the truncated id shown as a monospaced subline. Uses the shared
 * `useUserNames` hook so every admin screen stays in sync.
 *
 * When no profile exists for the id (test/seed accounts, deleted profiles),
 * we say so explicitly instead of showing the raw id as if it were a name.
 */
export function ClientCell({ userId, compact = false, className }: ClientCellProps) {
  const { realName } = useUserNames();

  if (!userId) {
    return <span className={cn("text-muted-foreground", className)}>—</span>;
  }

  const name = realName(userId);

  if (compact) {
    return (
      <span className={cn(!name && "text-muted-foreground italic", className)}>
        {name ?? "Sem perfil"}
      </span>
    );
  }

  return (
    <div className={cn("flex flex-col leading-tight", className)}>
      <span className={cn(!name && "text-muted-foreground italic font-normal")}>
        {name ?? "Sem perfil"}
      </span>
      <span className="font-mono text-[10px] text-muted-foreground">
        {userId.slice(0, 8)}…
      </span>
    </div>
  );
}
