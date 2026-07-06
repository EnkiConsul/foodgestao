import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const GA_ID = "G-3B98VTL39B";

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
    dataLayer?: any[];
  }
}

/**
 * Tracks SPA pageviews on route changes by sending a `page_view` event
 * to Google Analytics (gtag.js).
 *
 * Because <Helmet> updates `document.title` asynchronously after the route
 * commit, we wait one animation frame + a short timeout so the title and
 * canonical URL reflect the new page before reporting.
 */
export function usePageviewTracking() {
  const location = useLocation();

  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;

    const send = () => {
      if (cancelled || typeof window.gtag !== "function") return;

      const pagePath = location.pathname + location.search + location.hash;
      const pageLocation = window.location.href;
      const pageTitle = document.title;

      // Keep the tracker's defaults in sync, then emit the page_view.
      window.gtag("config", GA_ID, {
        page_path: pagePath,
        page_location: pageLocation,
        page_title: pageTitle,
        send_page_view: false,
      });

      window.gtag("event", "page_view", {
        page_path: pagePath,
        page_location: pageLocation,
        page_title: pageTitle,
        send_to: GA_ID,
      });
    };

    // Wait for Helmet to flush the new <title> before reporting.
    const raf = window.requestAnimationFrame(() => {
      const t = window.setTimeout(send, 0);
      // store timeout id on closure for cleanup
      (raf as unknown as { _t?: number })._t = t;
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      const t = (raf as unknown as { _t?: number })._t;
      if (typeof t === "number") window.clearTimeout(t);
    };
  }, [location.pathname, location.search, location.hash]);
}
