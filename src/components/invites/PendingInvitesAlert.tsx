import { Link } from "react-router-dom";
import { MailOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePendingInvites } from "@/hooks/usePendingInvites";

/** Aviso de convites pendentes para o e-mail do usuário conectado. */
export function PendingInvitesAlert() {
  const { data: invites } = usePendingInvites();
  const count = invites?.length ?? 0;
  if (count === 0) return null;

  const first = invites![0];

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3 min-w-0">
        <MailOpen className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {count === 1
              ? `Você tem um convite para acessar ${first.company_name ?? "uma empresa"}`
              : `Você tem ${count} convites de empresas pendentes`}
          </p>
          <p className="text-xs text-muted-foreground">
            Aceite para entrar e trabalhar nos dados dessa empresa.
          </p>
        </div>
      </div>
      <Button asChild size="sm" className="shrink-0 min-h-9">
        <Link to="/bem-vindo">Ver convites</Link>
      </Button>
    </div>
  );
}
