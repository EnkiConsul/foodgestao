import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  message?: string;
  onRetry?: () => void;
  className?: string;
};

/** Estado de erro padrão para consultas do módulo DP. */
export function DpErrorState({ message, onRetry, className }: Props) {
  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-8 text-center ${className ?? ""}`}
      role="alert"
    >
      <AlertCircle className="h-6 w-6 text-destructive" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">Não foi possível carregar os dados</p>
        <p className="text-xs text-muted-foreground">
          {message ?? "Verifique sua conexão e tente novamente."}
        </p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Tentar novamente
        </Button>
      )}
    </div>
  );
}
