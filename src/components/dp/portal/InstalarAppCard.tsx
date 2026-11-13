import { useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InstalacaoAppSheet } from "@/components/pwa/InstalacaoAppSheet";
import { useInstalacaoApp } from "@/components/pwa/useInstalacaoApp";

const DISPENSAR_KEY = "portal-instalar-app-dispensado";

function lerDispensa() {
  try {
    return localStorage.getItem(DISPENSAR_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Convite em destaque, na tela inicial do portal, para o colaborador deixar o
 * app no celular. Aparece em qualquer celular/navegador (inclusive dentro do
 * WhatsApp) com o passo a passo certo; some quando o app já está instalado ou
 * quando a pessoa dispensa.
 */
export function InstalarAppCard() {
  const instalacao = useInstalacaoApp();
  const [dispensado, setDispensado] = useState(lerDispensa);
  const [aberto, setAberto] = useState(false);

  if (dispensado || !instalacao.oferecer) return null;

  const dispensar = () => {
    try {
      localStorage.setItem(DISPENSAR_KEY, "1");
    } catch {
      // ignora
    }
    setDispensado(true);
  };

  const baixar = async () => {
    if (instalacao.estrategia === "android_instalar") {
      const r = await instalacao.instalarNativo();
      if (r === "aceito") setDispensado(true);
      return;
    }
    setAberto(true);
  };

  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15">
          <Download className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Baixe o aplicativo no seu celular</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Fica igual a um aplicativo: você abre com um toque, sem procurar o link no WhatsApp.
          </p>
          <Button size="sm" className="mt-3 min-h-11" onClick={baixar}>
            <Download className="mr-2 h-4 w-4" /> Baixar aplicativo
          </Button>
        </div>
        <button
          type="button"
          onClick={dispensar}
          aria-label="Fechar"
          className="flex h-11 w-11 shrink-0 items-center justify-center -mr-2 -mt-2 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <InstalacaoAppSheet open={aberto} onOpenChange={setAberto} instalacao={instalacao} />
    </div>
  );
}
