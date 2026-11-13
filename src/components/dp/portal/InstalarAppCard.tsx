import { useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InstalacaoAppSheet } from "@/components/pwa/InstalacaoAppSheet";
import { useConviteInstalacao } from "@/components/pwa/useConviteInstalacao";

/**
 * Balão flutuante, logo acima do menu inferior do portal, convidando o
 * colaborador a deixar o app no celular. Não empurra a página nem cobre o
 * menu; espera a caixa de cookies, some com o teclado aberto e, fechado,
 * só volta 14 dias depois (regras em `src/lib/pwa/convite.ts`).
 */
export function InstalarAppCard() {
  const { instalacao, visivel, dispensar } = useConviteInstalacao();
  const [aberto, setAberto] = useState(false);

  if (!instalacao.oferecer) return null;

  const baixar = async () => {
    if (instalacao.estrategia === "android_instalar") {
      const r = await instalacao.instalarNativo();
      if (r === "aceito") dispensar();
      return;
    }
    setAberto(true);
  };

  return (
    <>
      {visivel && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-3 bottom-[calc(56px+env(safe-area-inset-bottom)+0.75rem)] z-40 animate-in fade-in slide-in-from-bottom-4 duration-300 md:inset-x-auto md:bottom-4 md:right-4 md:max-w-sm"
        >
          <div className="flex items-start gap-3 rounded-2xl border border-primary/30 bg-card p-3 shadow-2xl">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15">
              <Download className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">Baixe o aplicativo no seu celular</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Abra com um toque, sem procurar o link no WhatsApp.</p>
              <Button size="sm" className="mt-2 min-h-11" onClick={baixar}>
                <Download className="mr-2 h-4 w-4" aria-hidden="true" /> Baixar aplicativo
              </Button>
            </div>
            <button
              type="button"
              onClick={dispensar}
              aria-label="Fechar aviso de baixar o aplicativo"
              className="-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
      <InstalacaoAppSheet open={aberto} onOpenChange={setAberto} instalacao={instalacao} />
    </>
  );
}
