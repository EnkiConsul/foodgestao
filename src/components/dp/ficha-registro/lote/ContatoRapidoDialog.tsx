import { useEffect, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { contatoValido } from "@/lib/dp/ficha-registro/organizacao-lote";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  nome: string;
  inicial: { whatsapp: string; email: string };
  /** Há outra ficha sem dados de acesso depois desta. */
  temProxima: boolean;
  salvando: boolean;
  onSalvar: (c: { whatsapp: string; email: string }, seguir: boolean) => Promise<void>;
}

/** Atalho da lista: completa WhatsApp/e-mail sem abrir a ficha inteira (fica salvo no lote). */
export function ContatoRapidoDialog({ open, onOpenChange, nome, inicial, temProxima, salvando, onSalvar }: Props) {
  const [whatsapp, setWhatsapp] = useState(inicial.whatsapp);
  const [email, setEmail] = useState(inicial.email);
  useEffect(() => {
    if (open) { setWhatsapp(inicial.whatsapp); setEmail(inicial.email); }
  }, [open, inicial.whatsapp, inicial.email]);
  const erro = contatoValido({ whatsapp, email });

  const salvar = async (seguir: boolean) => {
    try {
      await onSalvar({ whatsapp: whatsapp.replace(/\D/g, ""), email: email.trim().toLowerCase() }, seguir);
    } catch {
      /* a mensagem já foi mostrada */
    }
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={<span className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-warning" /> Dados para acesso</span>}
      description={`${nome}: com WhatsApp ou e-mail a pessoa recebe o acesso ao portal. Não cria o cadastro.`}
      className="sm:max-w-md"
      footer={
        <div className="flex w-full gap-2 sm:justify-end">
          <Button variant="outline" className="h-11 flex-1 sm:flex-none" disabled={!!erro || salvando} onClick={() => salvar(false)}>
            Salvar
          </Button>
          {temProxima && (
            <Button className="h-11 flex-1 sm:flex-none" disabled={!!erro || salvando} onClick={() => salvar(true)}>
              {salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Salvar e próxima
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="contato-whatsapp" className="text-xs">WhatsApp (com DDD)</Label>
          <Input
            id="contato-whatsapp"
            className="h-11"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            autoFocus
            placeholder="(64) 99999-0000"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="contato-email" className="text-xs">E-mail (opcional)</Label>
          <Input
            id="contato-email"
            className="h-11"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        {erro && (whatsapp || email) && <p className="text-xs text-destructive">{erro}</p>}
      </div>
    </ResponsiveDialog>
  );
}
