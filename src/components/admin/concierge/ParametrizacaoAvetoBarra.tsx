import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Wrench } from "lucide-react";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useModoSuporte } from "@/hooks/useModoSuporte";
import { Button } from "@/components/ui/button";

/**
 * Faixa fixa da equipe Aveto: aparece sempre que um super admin está numa
 * empresa da qual não é titular, para nunca confundir o cliente com a própria
 * empresa, e devolve com um toque para a empresa da pessoa.
 */
export function ParametrizacaoAvetoBarra() {
  const { setContext } = useCompanyContext();
  const { ativo, cliente, minha } = useModoSuporte();
  const qc = useQueryClient();
  const navigate = useNavigate();

  if (!ativo || !cliente) return null;

  const voltar = () => {
    if (!minha) return;
    setContext("pj", minha.id);
    qc.invalidateQueries();
    navigate("/");
  };

  return (
    <div
      role="status"
      className="sticky top-14 z-30 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-warning/50 bg-warning px-3 py-2 text-sm text-warning-foreground shadow-sm md:px-6"
    >
      <p className="flex min-w-0 flex-1 items-center gap-1.5">
        <Wrench className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 truncate">
          Modo suporte Aveto · <strong>{cliente.trade_name || cliente.name}</strong>
          <span className="hidden sm:inline"> — empresa do cliente, não é a sua</span>
        </span>
      </p>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" className="hidden h-9 px-2 hover:bg-background/20 sm:inline-flex" asChild>
          <Link to="/admin/clientes">Backoffice</Link>
        </Button>
        {minha && (
          <Button size="sm" variant="outline" className="h-9 bg-background text-foreground" onClick={voltar}>
            <ArrowLeftRight className="mr-1.5 h-4 w-4" />
            <span className="max-w-[9rem] truncate sm:max-w-[12rem]">Voltar para {minha.trade_name || minha.name}</span>
          </Button>
        )}
      </div>
    </div>
  );
}
