import { FileText, Home } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { usePortalAcesso } from "@/hooks/usePortalAcesso";
import { dataBr } from "@/lib/dp/formato";

/**
 * Guarda das telas operacionais do portal.
 *
 * Quem foi desligado e está no prazo de 30 dias só consulta e baixa documentos:
 * folgas, trocas, férias, convocações e novas solicitações ficam indisponíveis.
 * A restrição também vale no banco — aqui é apenas a explicação para a pessoa.
 */
export function PortalSomenteDocumentos({ children }: { children: React.ReactNode }) {
  const { somenteDocumentos, estado, acessoAte, isLoading } = usePortalAcesso();

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;
  if (!somenteDocumentos) return <>{children}</>;

  const suspensa = estado === "empresa_suspensa_leitura";
  const prazo = formatarData(acessoAte);

  return (
    <div className="mx-auto max-w-md space-y-3 p-6 text-center">
      <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
      <h1 className="text-lg font-semibold">
        {suspensa ? "Esta tela está indisponível no momento" : "Esta tela não está mais disponível"}
      </h1>
      <p className="text-sm text-muted-foreground">
        {suspensa
          ? "Seu acesso está em modo de consulta. Você pode ver e baixar seus contracheques e documentos. Em caso de dúvidas, procure o setor de pessoal."
          : estado === "aviso_pos_trabalho"
            ? "Seu período de trabalho foi concluído. Até o término do contrato, o portal fica disponível para acompanhar seu desligamento e consultar seus documentos."
            : "Com o vínculo encerrado, seu acesso fica apenas para consultar e baixar seus documentos."}
      </p>
      {prazo && (
        <p className="text-xs text-muted-foreground">
          Seus documentos e recibos ficam disponíveis para consulta e download até {prazo}.
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Button asChild>
          <Link to="/dp/meu/documentos">Ver meus documentos</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/dp/meu"><Home className="mr-2 h-4 w-4" /> Ir para o início</Link>
        </Button>
      </div>
    </div>
  );
}
