import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { KeyRound, QrCode, ShieldCheck, Smartphone } from "lucide-react";

interface Props {
  open: boolean;
  onProceed: () => void;
}

const PASSOS = [
  {
    icone: Smartphone,
    titulo: "Instale o app autenticador",
    texto: "No seu celular, instale Google Authenticator, Authy, 1Password ou Microsoft Authenticator.",
  },
  {
    icone: QrCode,
    titulo: "Escaneie o QR Code",
    texto: "Na tela a seguir, escaneie o código exibido com o app — ou copie a chave manual para configurar.",
  },
  {
    icone: KeyRound,
    titulo: "Digite o código de 6 dígitos",
    texto: "O app gera um novo código a cada 30 segundos. Informe-o na tela para concluir a ativação.",
  },
] as const;

/**
 * Pop-up de boas-vindas ao fluxo obrigatório de 2FA do Backoffice.
 * Explica o procedimento antes de abrir a tela de configuração.
 */
export function MfaIntroDialog({ open, onProceed }: Props) {
  return (
    <Dialog
      open={open}
      onOpenChange={(aberto) => {
        if (!aberto) onProceed();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
            Como ativar a verificação em duas etapas
          </DialogTitle>
          <DialogDescription>
            O acesso ao Backoffice da plataforma exige um segundo fator de segurança, além da senha.
            A ativação leva cerca de 2 minutos — siga os três passos abaixo.
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-3">
          {PASSOS.map((passo, i) => (
            <li key={passo.titulo} className="flex gap-3 text-sm">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <passo.icone className="h-4 w-4" aria-hidden="true" />
              </span>
              <span>
                <strong>
                  {i + 1}. {passo.titulo}
                </strong>
                <span className="block text-muted-foreground">{passo.texto}</span>
              </span>
            </li>
          ))}
        </ol>

        <p className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
          Importante: após ativar, o código do autenticador será pedido em todo acesso ao Backoffice.
          Não desinstale o app do celular sem antes configurar um novo dispositivo.
        </p>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" onClick={onProceed}>
            Entendi, ativar agora
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
