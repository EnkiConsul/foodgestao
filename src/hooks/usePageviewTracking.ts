import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { isSensitiveLocation, sanitizePath, sanitizeUrl, safeReferrer } from "@/lib/security/trackingPrivacy";

const GA_ID = "G-S82MB9C11K";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gtag?: (...args: any[]) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dataLayer?: any[];
    __avetoPixelPageView?: () => boolean;
  }
}

/**
 * Reporta visualizações de rota do SPA ao Google Analytics.
 *
 * AUD-021: rotas sensíveis (login, ativação, recuperação, convite, OAuth) e
 * URLs com credencial temporária na query ou no fragmento não geram evento
 * algum — inclusive em navegação dentro do app, com os trackers já carregados.
 * O que é enviado leva apenas o caminho e a allowlist de campanha; nunca
 * fragmento, nunca referrer bruto.
 *
 * Como <Helmet> atualiza `document.title` de forma assíncrona, esperamos um
 * quadro + timeout para que o título reflita a página nova.
 */
export function usePageviewTracking() {
  const location = useLocation();

  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;

    const send = () => {
      if (cancelled) return;

      const sensivel = isSensitiveLocation(location.pathname, location.search, location.hash);

      if (typeof window.gtag === "function") {
        if (sensivel) {
          // Limpa qualquer URL anterior nos padrões do tracker e não reporta.
          window.gtag("config", GA_ID, { send_page_view: false });
        } else {
          const pagePath = sanitizePath(location.pathname, location.search);
          const pageLocation = sanitizeUrl(window.location.origin, location.pathname, location.search);
          const pageTitle = document.title;

          window.gtag("config", GA_ID, {
            page_path: pagePath,
            page_location: pageLocation,
            page_title: pageTitle,
            page_referrer: safeReferrer(document.referrer, window.location.origin),
            send_page_view: false,
          });

          window.gtag("event", "page_view", {
            page_path: pagePath,
            page_location: pageLocation,
            page_title: pageTitle,
            send_to: GA_ID,
          });
        }
      }

      // Pixel da Meta: a própria função reavalia consentimento e rota.
      if (!sensivel) window.__avetoPixelPageView?.();
    };

    // Espera o Helmet gravar o novo <title> antes de reportar.
    let timeoutId: number | undefined;
    const raf = window.requestAnimationFrame(() => {
      timeoutId = window.setTimeout(send, 0);
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      if (typeof timeoutId === "number") window.clearTimeout(timeoutId);
    };
  }, [location.pathname, location.search, location.hash]);
}
