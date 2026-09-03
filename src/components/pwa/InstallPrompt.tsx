import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Share, Plus, X } from "lucide-react";

const DISMISS_KEY = "pwa-install-dismissed-at";
const DISMISS_DAYS = 14;
const LOG_PREFIX = "[PWA InstallPrompt]";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function isStandalone() {
  if (typeof window === "undefined") return false;
  const mqStandalone = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  const mqFullscreen = window.matchMedia?.("(display-mode: fullscreen)").matches ?? false;
  const mqMinimalUi = window.matchMedia?.("(display-mode: minimal-ui)").matches ?? false;
  // @ts-expect-error iOS Safari only
  const iosStandalone = window.navigator.standalone === true;
  // Android TWA / installed app referrer
  const androidApp = document.referrer.startsWith("android-app://");
  return mqStandalone || mqFullscreen || mqMinimalUi || iosStandalone || androidApp;
}

export function detectPlatform() {
  if (typeof window === "undefined") {
    return { isIos: false, isIpadOs: false, isSafari: false, isInAppBrowser: false, ua: "" };
  }
  const ua = window.navigator.userAgent;
  const platform = window.navigator.platform || "";
  const maxTouchPoints = window.navigator.maxTouchPoints || 0;

  // Classic iPhone/iPad/iPod
  // @ts-expect-error legacy MSStream check
  const classicIos = /iphone|ipad|ipod/i.test(ua) && !window.MSStream;
  // iPadOS 13+ reports as Mac with touch support
  const ipadOs = platform === "MacIntel" && maxTouchPoints > 1 && !("MSStream" in window);

  const isIos = classicIos || ipadOs;

  // Safari = WebKit on iOS without other browser tags
  // On iOS, ALL browsers are WebKit, but only Safari can install PWAs.
  const isSafari =
    isIos &&
    /safari/i.test(ua) &&
    !/crios|fxios|edgios|opios|yabrowser|duckduckgo|brave/i.test(ua);

  // Common in-app browsers where Add to Home Screen is unavailable
  const isInAppBrowser =
    /fban|fbav|fbios|instagram|line|micromessenger|wv|tiktok|linkedinapp|twitter/i.test(ua);

  return { isIos, isIpadOs: ipadOs, isSafari, isInAppBrowser, ua };
}

export function wasRecentlyDismissed() {
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
    const platform = detectPlatform();
    const standalone = isStandalone();
    const dismissedRecently = wasRecentlyDismissed();

    console.info(LOG_PREFIX, "evaluating display conditions", {
      isIos: platform.isIos,
      isIpadOs: platform.isIpadOs,
      isSafari: platform.isSafari,
      isInAppBrowser: platform.isInAppBrowser,
      standalone,
      dismissedRecently,
    });

    if (standalone) {
      console.info(LOG_PREFIX, "skipping: app already installed (standalone mode)");
      return;
    }
    if (dismissedRecently) {
      console.info(LOG_PREFIX, "skipping: user dismissed recently");
      return;
    }

    if (platform.isIos) {
      if (platform.isInAppBrowser) {
        console.info(LOG_PREFIX, "skipping iOS prompt: in-app browser cannot install PWA");
        return;
      }
      if (!platform.isSafari) {
        console.info(LOG_PREFIX, "skipping iOS prompt: only Safari can install PWA on iOS");
        return;
      }
      console.info(LOG_PREFIX, "showing iOS Add to Home Screen instructions");
      setShowIos(true);
      return;
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      console.info(LOG_PREFIX, "captured beforeinstallprompt (Android/Chrome)");
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      console.info(LOG_PREFIX, "appinstalled event received, hiding prompt");
      setDismissed(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
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
            Instalar Aveto 360
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
