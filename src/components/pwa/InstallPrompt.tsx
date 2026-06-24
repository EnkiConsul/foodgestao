import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Share, Plus, X } from "lucide-react";

const DISMISS_KEY = "pwa-install-dismissed-at";
const DISMISS_DAYS = 14;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // @ts-expect-error iOS Safari only
    window.navigator.standalone === true
  );
}

function isIos() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  // @ts-expect-error legacy
  return /iphone|ipad|ipod/i.test(ua) && !window.MSStream;
}

function wasRecentlyDismissed() {
  try {
    const v = localStorage.getItem(DISMISS_KEY);
    if (!v) return false;
    const diff = Date.now() - Number(v);
    return diff < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIos, setShowIos] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isStandalone() || wasRecentlyDismissed()) return;

    if (isIos()) {
      setShowIos(true);
      return;
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  if (dismissed) return null;
  if (!showIos && !deferred) return null;

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // ignore
    }
    setDismissed(true);
  };

  const handleInstall = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted") {
      setDismissed(true);
    } else {
      handleDismiss();
    }
    setDeferred(null);
  };

  return (
    <div className="fixed inset-x-2 bottom-20 z-50 md:inset-x-auto md:right-4 md:bottom-4 md:max-w-sm">
      <div className="rounded-lg border border-border bg-card shadow-lg p-4 flex gap-3 items-start">
        <div className="shrink-0 rounded-md bg-primary/10 text-primary p-2">
          <Download className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-foreground">
            Instalar Gestor Plin
          </p>
          {showIos ? (
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Toque em <Share className="inline h-3.5 w-3.5 align-text-bottom" />{" "}
              <span className="font-medium">Compartilhar</span> no Safari e depois em{" "}
              <span className="font-medium">
                Adicionar à Tela de Início <Plus className="inline h-3.5 w-3.5 align-text-bottom" />
              </span>
              .
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">
              Instale o app no seu dispositivo para acesso rápido e tela cheia.
            </p>
          )}
          {deferred && !showIos && (
            <Button size="sm" className="mt-3" onClick={handleInstall}>
              <Download className="h-4 w-4 mr-2" />
              Instalar app
            </Button>
          )}
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Fechar"
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
