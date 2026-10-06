import { Link } from "react-router-dom";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompanyAccess } from "@/hooks/useCompanyAccess";
import { useCompanyPermissions } from "@/hooks/useCompanyPermissions";

/** Aviso fixo (não bloqueante) durante a carência pós-cortesia. Só dono e administradores. */
export function CarenciaBanner() {
  const { access, blocked, loading } = useCompanyAccess();
  const { role } = useCompanyPermissions();

  if (loading || blocked || access?.status !== "grace" || !access.graceEndsAt) return null;
  if (!(access.isOwner || role === "owner" || role === "admin")) return null;

  const fim = new Date(access.graceEndsAt);
  const dias = Math.max(0, Math.ceil((fim.getTime() - Date.now()) / 86400000));
  const data = fim.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-primary/30 bg-primary/10 px-4 py-2 text-sm">
      <Clock className="h-4 w-4 shrink-0 text-primary" />
      <span>
        Sua cortesia foi encerrada. Você tem {dias} {dias === 1 ? "dia" : "dias"} (até {data}) para escolher um plano.
      </span>
      <Button asChild size="sm" className="ml-auto">
        <Link to="/planos">Escolher Plano</Link>
      </Button>
    </div>
  );
}
