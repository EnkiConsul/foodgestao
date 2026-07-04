import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Cookie, X } from "lucide-react";
import { useCookieConsent } from "@/hooks/useCookieConsent";

export function CookieConsentBanner() {
  const { decided, prefs, acceptAll, rejectAll, savePrefs } = useCookieConsent();
  const [open, setOpen] = useState(false);
  const [analytics, setAnalytics] = useState(prefs.analytics);
  const [marketing, setMarketing] = useState(prefs.marketing);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const handler = () => {
      setAnalytics(prefs.analytics);
      setMarketing(prefs.marketing);
      setOpen(true);
    };
    window.addEventListener("plin:cookie-settings-open", handler);
    return () => window.removeEventListener("plin:cookie-settings-open", handler);
  }, [prefs]);

  if (decided && !open) return null;
  if (hidden && !open) return null;

  return (
    <>
      {!decided && !hidden && (
        <div className="fixed inset-x-3 bottom-[calc(4rem+env(safe-area-inset-bottom)+0.75rem)] z-50 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:max-w-md">
          <div className="rounded-xl border border-border bg-card p-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <Cookie className="h-5 w-5 shrink-0 text-primary" />
              <div className="flex-1 text-sm">
                <p className="font-semibold text-foreground">Cookies e privacidade</p>
                <p className="mt-1 text-muted-foreground">
                  Usamos cookies essenciais para o funcionamento e, com sua autorização, cookies
                  analíticos/marketing. Saiba mais na nossa{" "}
                  <Link to="/cookies" className="text-primary underline">
                    Política de Cookies
                  </Link>
                  .
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHidden(true)}
                aria-label="Fechar"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={acceptAll} className="flex-1 min-w-[100px]">
                Aceitar todos
              </Button>
              <Button size="sm" variant="outline" onClick={rejectAll} className="flex-1 min-w-[100px]">
                Apenas essenciais
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setOpen(true)} className="flex-1 min-w-[100px]">
                Personalizar
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Preferências de cookies</DialogTitle>
            <DialogDescription>
              Você pode alterar essas configurações a qualquer momento.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label className="font-medium">Necessários</Label>
                <p className="text-xs text-muted-foreground">
                  Essenciais para autenticação e segurança. Sempre ativos.
                </p>
              </div>
              <Switch checked disabled />
            </div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label className="font-medium">Analíticos</Label>
                <p className="text-xs text-muted-foreground">
                  Métricas agregadas de uso para melhorar a plataforma.
                </p>
              </div>
              <Switch checked={analytics} onCheckedChange={setAnalytics} />
            </div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label className="font-medium">Marketing</Label>
                <p className="text-xs text-muted-foreground">
                  Personalização de comunicações e medição de campanhas.
                </p>
              </div>
              <Switch checked={marketing} onCheckedChange={setMarketing} />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                rejectAll();
                setOpen(false);
              }}
            >
              Recusar todos
            </Button>
            <Button
              onClick={() => {
                savePrefs({ analytics, marketing });
                setOpen(false);
              }}
            >
              Salvar preferências
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
