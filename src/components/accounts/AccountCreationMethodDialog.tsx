import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Zap, Pencil, Check, Info } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectManual: () => void;
  onSelectOpenFinance: () => void;
  /** Se falso, o card de Open Finance é exibido desabilitado com aviso. */
  openFinanceEnabled?: boolean;
  /** Mensagem exibida quando Open Finance está desabilitado. */
  openFinanceDisabledReason?: string;
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-xs text-muted-foreground">
      <Check className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
      <span>{children}</span>
    </li>
  );
}

export function AccountCreationMethodDialog({
  open,
  onOpenChange,
  onSelectManual,
  onSelectOpenFinance,
  openFinanceEnabled = true,
  openFinanceDisabledReason = "Selecione uma empresa antes de conectar uma conta via Open Finance.",
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adicionar conta financeira</DialogTitle>
          <DialogDescription>
            Escolha como deseja cadastrar sua conta. Você pode conectar automaticamente pelo Open Finance ou informar os dados manualmente.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-2 mt-2 items-stretch">
          {/* Open Finance */}
          <button
            type="button"
            aria-label="Conectar por Open Finance"
            aria-disabled={!openFinanceEnabled}
            disabled={!openFinanceEnabled}
            onClick={onSelectOpenFinance}
            className={
              "group relative flex flex-col text-left rounded-lg border bg-card p-4 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary " +
              (openFinanceEnabled
                ? "cursor-pointer hover:border-primary hover:shadow-md"
                : "cursor-not-allowed opacity-60")
            }
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Zap className="h-5 w-5" />
              </div>
              <Badge className="bg-primary/10 text-primary border-0 hover:bg-primary/15">Recomendado</Badge>
            </div>
            <h3 className="text-sm font-semibold text-foreground">Conectar por Open Finance</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Sincronize saldos e extratos automaticamente com seu banco.
            </p>
            <ul className="mt-3 space-y-1.5 flex-1">
              <Bullet>Importação automática de lançamentos</Bullet>
              <Bullet>Atualização automática de saldos</Bullet>
              <Bullet>Menos digitação e menos erros</Bullet>
            </ul>

            {!openFinanceEnabled && (
              <div
                role="note"
                className="mt-3 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-foreground"
              >
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-warning" />
                <span>{openFinanceDisabledReason}</span>
              </div>
            )}

            <span
              aria-hidden="true"
              className={
                "mt-4 inline-flex h-10 w-full items-center justify-center rounded-md px-4 text-sm font-medium transition-colors " +
                (openFinanceEnabled
                  ? "bg-primary text-primary-foreground group-hover:bg-primary/90"
                  : "bg-muted text-muted-foreground")
              }
            >
              Conectar com Open Finance
            </span>
          </button>

          {/* Manual */}
          <button
            type="button"
            aria-label="Cadastrar conta manualmente"
            onClick={onSelectManual}
            className="group relative flex flex-col text-left cursor-pointer rounded-lg border bg-card p-4 transition-all hover:border-primary hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-foreground">
                <Pencil className="h-5 w-5" />
              </div>
            </div>
            <h3 className="text-sm font-semibold text-foreground">Cadastrar manualmente</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Informe os dados da conta e lance ou importe extratos por conta própria.
            </p>
            <ul className="mt-3 space-y-1.5 flex-1">
              <Bullet>Controle manual dos dados</Bullet>
              <Bullet>Possibilidade de importar extratos</Bullet>
              <Bullet>Sem conexão bancária</Bullet>
            </ul>
            <span
              aria-hidden="true"
              className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground transition-colors group-hover:bg-accent group-hover:text-accent-foreground"
            >
              Cadastrar manualmente
            </span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
