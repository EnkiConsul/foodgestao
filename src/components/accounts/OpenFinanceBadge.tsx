import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Link2, AlertTriangle, RefreshCw, Clock3 } from "lucide-react";
import type { AccountOFInfo } from "@/hooks/useAccountOpenFinanceStatus";

interface Props {
  info: AccountOFInfo;
}

/**
 * Chip visual pequeno mostrando o estado da conexão Open Finance de uma
 * conta bancária ou cartão. Renderiza nada quando não há vínculo OF.
 */
export function OpenFinanceBadge({ info }: Props) {
  const base =
    "text-[10px] h-4 px-1.5 shrink-0 gap-1 border-0 inline-flex items-center";
  const lastSync = info.lastSyncAt
    ? new Date(info.lastSyncAt).toLocaleString("pt-BR")
    : "nunca";

  if (info.status === "connected") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className={`${base} bg-success/15 text-success hover:bg-success/20`}>
            <Link2 className="h-2.5 w-2.5" /> Open Finance
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs">
            <div className="font-medium">{info.institution ?? "Banco"}</div>
            <div className="text-muted-foreground">Última sync: {lastSync}</div>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (info.status === "consent_expiring") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className={`${base} bg-warning/15 text-warning hover:bg-warning/20`}>
            <Clock3 className="h-2.5 w-2.5" /> Expira em {info.daysToExpire}d
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs">
            Consentimento Open Finance vence em {info.daysToExpire} dias.
            Reconecte para manter a sincronização.
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (info.status === "needs_reconnect") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className={`${base} bg-warning/15 text-warning hover:bg-warning/20`}>
            <RefreshCw className="h-2.5 w-2.5" /> Reconectar
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs">
            Autenticação expirada. Reconecte o banco para retomar a sincronização.
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (info.status === "error") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className={`${base} bg-destructive/15 text-destructive hover:bg-destructive/20`}>
            <AlertTriangle className="h-2.5 w-2.5" /> Erro OF
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs">
            O provedor reportou um erro nesta conexão. Verifique em
            Configurações › Open Finance.
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return null;
}
