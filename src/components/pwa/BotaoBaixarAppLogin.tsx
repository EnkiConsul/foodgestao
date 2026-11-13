import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Download } from "lucide-react";
import { InstalacaoAppSheet } from "./InstalacaoAppSheet";
import { useInstalacaoApp } from "./useInstalacaoApp";

/**
 * Atalho "Baixar app" no canto da tela de login, só no celular e só enquanto
 * o app não está instalado. Com `?instalar=1` (vindo da ativação ou do
 * WhatsApp) o passo a passo abre sozinho.
 */
export function BotaoBaixarAppLogin() {
  const instalacao = useInstalacaoApp();
  const [params] = useSearchParams();
  const [aberto, setAberto] = useState(false);
  const pedido = params.get("instalar") === "1";

  useEffect(() => {
    if (pedido && instalacao.oferecer) setAberto(true);
    // abre uma vez ao chegar; depois a pessoa controla
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido]);

  if (!instalacao.oferecer) return null;

  const tocar = () => {
    if (instalacao.estrategia === "android_instalar") {
      void instalacao.instalarNativo();
      return;
    }
    setAberto(true);
  };

  const destino =
    typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}${window.location.search}` : undefined;

  return (
    <>
      <button
        type="button"
        onClick={tocar}
        className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
      >
        <Download className="h-4 w-4" aria-hidden="true" /> Baixar app
      </button>
      <InstalacaoAppSheet open={aberto} onOpenChange={setAberto} instalacao={instalacao} urlDestino={destino} />
    </>
  );
}
