import { useEffect, useState } from "react";
import { Download, Plus, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { detectPlatform, isStandalone } from "@/components/pwa/InstallPrompt";

const DISPENSAR_KEY = "portal-instalar-app-dispensado";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Convite em destaque, na tela inicial do portal, para o colaborador deixar o
 * atalho do app no celular. Some quando o app já está instalado ou dispensado.
 */
export function InstalarAppCard() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [instrucoesIos, setInstrucoesIos] = useState(false);
  const [oculto, setOculto] = useState(true);

  useEffect(() => {
    let dispensado = false;
    try {
      dispensado = localStorage.getItem(DISPENSAR_KEY) === "1";
    } catch {
      dispensado = false;
    }
    if (dispensado || isStandalone()) return;

    const plataforma = detectPlatform();
    if (plataforma.isIos) {
      if (plataforma.isInAppBrowser || !plataforma.isSafari) return;
      setInstrucoesIos(true);
      setOculto(false);
      return;
    }

    setOculto(false);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalado = () => setOculto(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalado);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalado);
    };
  }, []);

  if (oculto) return null;

  const dispensar = () => {
    try {
      localStorage.setItem(DISPENSAR_KEY, "1");
    } catch {
      // ignora
    }
    setOculto(true);
  };

  const instalar = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === "accepted") setOculto(true);
    else dispensar();
  };

  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15">
          <Download className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Deixe o portal na tela do seu celular</p>
          {instrucoesIos ? (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Toque em <Share className="inline h-3.5 w-3.5 align-text-bottom" />{" "}
              <span className="font-medium">Compartilhar</span> e depois em{" "}
              <span className="font-medium">
                Adicionar à Tela de Início <Plus className="inline h-3.5 w-3.5 align-text-bottom" />
              </span>
              .
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Fica igual a um aplicativo: você abre com um toque, sem digitar o endereço.
            </p>
          )}
          {deferred && !instrucoesIos && (
            <Button size="sm" className="mt-3" onClick={instalar}>
              <Download className="mr-2 h-4 w-4" /> Instalar agora
            </Button>
          )}
        </div>
        <button
          type="button"
          onClick={dispensar}
          aria-label="Fechar"
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
