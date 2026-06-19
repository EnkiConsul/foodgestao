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
 */
export function ClientCell({ userId, compact = false, className }: ClientCellProps) {
  const { displayName } = useUserNames();

  if (!userId) {
    return <span className={cn("text-muted-foreground", className)}>—</span>;
  }

  if (compact) {
    return <span className={className}>{displayName(userId)}</span>;
  }

  return (
    <div className={cn("flex flex-col leading-tight", className)}>
      <span>{displayName(userId)}</span>
      <span className="font-mono text-[10px] text-muted-foreground">
        {userId.slice(0, 8)}…
      </span>
    </div>
  );
}
