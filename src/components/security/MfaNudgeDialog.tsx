import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useMfaNudge } from "@/hooks/useMfaNudge";

/**
 * Pop-up informativo e opcional: convida a ativar a verificação em duas
 * etapas e leva para a página de ativação. Não bloqueia nada.
 */
export function MfaNudgeDialog() {
  const { mostrar, fechar } = useMfaNudge();
  const [naoMostrar, setNaoMostrar] = useState(false);
  const navigate = useNavigate();

  const encerrar = async () => {
    await fechar(naoMostrar);
  };

  const ativarAgora = async () => {
    await fechar(naoMostrar);
    navigate("/configuracoes?secao=2fa");
  };

  return (
    <Dialog
      open={mostrar}
      onOpenChange={(aberto) => {
        if (!aberto) void encerrar();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
            Proteja sua conta com verificação em duas etapas
          </DialogTitle>
          <DialogDescription>
            Sua conta tem acesso a informações financeiras e a conexões bancárias. Com a verificação
            em duas etapas, além da senha é pedido um código do seu aplicativo autenticador. A
            ativação leva cerca de 2 minutos e continua sendo opcional.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Checkbox
            id="mfa-nudge-nao-mostrar"
            checked={naoMostrar}
            onCheckedChange={(valor) => setNaoMostrar(valor === true)}
          />
          <Label htmlFor="mfa-nudge-nao-mostrar" className="text-sm font-normal">
            Não mostrar novamente
          </Label>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={() => void encerrar()}>
            Agora não
          </Button>
          <Button type="button" onClick={() => void ativarAgora()}>
            Ativar agora
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
