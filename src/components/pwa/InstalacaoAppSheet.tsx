import { Smartphone } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { GuiaInstalacaoApp } from "./GuiaInstalacaoApp";
import type { InstalacaoApp } from "./useInstalacaoApp";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  instalacao: InstalacaoApp;
  urlDestino?: string;
}

/** Janela inferior com o passo a passo de instalação, no celular. */
export function InstalacaoAppSheet({ open, onOpenChange, instalacao, urlDestino }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[90svh] overflow-y-auto rounded-t-2xl pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      >
        <SheetHeader className="mb-4 text-left">
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
            <Smartphone className="h-5 w-5 text-primary" />
          </div>
          <SheetTitle>Baixar o aplicativo Aveto 360</SheetTitle>
          <SheetDescription>
            Fica na tela do seu celular: você abre com um toque, sem procurar link no WhatsApp.
          </SheetDescription>
        </SheetHeader>
        <GuiaInstalacaoApp
          instalacao={instalacao}
          urlDestino={urlDestino}
          onInstalado={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
