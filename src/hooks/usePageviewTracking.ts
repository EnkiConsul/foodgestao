import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const GA_ID = "G-S82MB9C11K";

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
