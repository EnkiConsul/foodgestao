import { FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { usePortalAcesso } from "@/hooks/usePortalAcesso";

/**
 * Guarda das telas operacionais do portal.
 *
 * Quem foi desligado e está no prazo de 30 dias só consulta e baixa documentos:
 * folgas, trocas, férias, convocações e novas solicitações ficam indisponíveis.
 * A restrição também vale no banco — aqui é apenas a explicação para a pessoa.
 */
export function PortalSomenteDocumentos({ children }: { children: React.ReactNode }) {
  const { somenteDocumentos, isLoading } = usePortalAcesso();

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;
  if (!somenteDocumentos) return <>{children}</>;

  return (
    <div className="mx-auto max-w-md space-y-3 p-6 text-center">
      <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
      <h1 className="text-lg font-semibold">Esta tela não está mais disponível</h1>
      <p className="text-sm text-muted-foreground">
        Com o vínculo encerrado, seu acesso fica apenas para consultar e baixar seus documentos.
      </p>
      <Button asChild>
        <Link to="/dp/meu/documentos">Ver meus documentos</Link>
      </Button>
    </div>
  );
}
