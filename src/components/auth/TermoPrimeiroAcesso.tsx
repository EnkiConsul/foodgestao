import { useState } from "react";
import { Check, FileText } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  TERMO_PORTAL_PARAGRAFOS,
  TERMO_PORTAL_TITULO,
  TERMO_PORTAL_VERSAO,
} from "@/lib/dp/termoPortal";

type Props = {
  aceito: boolean;
  onAceitar: (valor: boolean) => void;
  /** Destaca o campo quando o colaborador tenta salvar sem marcar. */
  pendente?: boolean;
};

/**
 * Termo de primeiro acesso ao portal: resumo na tela, texto completo em janela
 * própria e a marcação de aceite exigida para criar a senha.
 */
export function TermoPrimeiroAcesso({ aceito, onAceitar, pendente }: Props) {
  const [aberto, setAberto] = useState(false);

  return (
    <div
      className={`rounded-md border p-3 ${
        pendente && !aceito ? "border-destructive bg-destructive/5" : "bg-muted/40"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <Checkbox
          id="termo-portal"
          checked={aceito}
          onCheckedChange={(v) => onAceitar(v === true)}
          className="mt-0.5"
          aria-describedby="termo-portal-ajuda"
        />
        <div className="space-y-1.5">
          <label htmlFor="termo-portal" className="text-sm leading-snug">
            Li e concordo com o{" "}
            <Dialog open={aberto} onOpenChange={setAberto}>
              <DialogTrigger asChild>
                <button
                  type="button"
                  className="font-medium text-primary underline underline-offset-2"
                >
                  {TERMO_PORTAL_TITULO}
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle className="text-left text-base">{TERMO_PORTAL_TITULO}</DialogTitle>
                  <DialogDescription className="text-left">
                    Versão {TERMO_PORTAL_VERSAO} · Leia com atenção antes de aceitar.
                  </DialogDescription>
                </DialogHeader>
                <ScrollArea className="max-h-[55vh] pr-3">
                  <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
                    {TERMO_PORTAL_PARAGRAFOS.map((p) => (
                      <p key={p.slice(0, 24)}>{p}</p>
                    ))}
                  </div>
                </ScrollArea>
                <DialogFooter className="gap-2 sm:justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    onClick={() => setAberto(false)}
                  >
                    Fechar
                  </Button>
                  <Button
                    type="button"
                    className="min-h-11"
                    onClick={() => {
                      onAceitar(true);
                      setAberto(false);
                    }}
                  >
                    <Check className="mr-1.5 h-4 w-4" />
                    Li e Concordo
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            .
          </label>
          <p id="termo-portal-ajuda" className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Autoriza receber e assinar seus documentos pelo portal. Fica registrado com data e hora,
            e você pode pedir uma via ao setor de pessoal.
          </p>
        </div>
      </div>
    </div>
  );
}
