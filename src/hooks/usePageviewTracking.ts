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
 * to Google Analytics (gtag.js). The initial `config` call in index.html
 * fires the first pageview; this hook handles every subsequent navigation.
 */
export function usePageviewTracking() {
  const location = useLocation();

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.gtag !== "function") return;

    const path = location.pathname + location.search;
    window.gtag("event", "page_view", {
      page_path: path,
      page_location: window.location.href,
      page_title: document.title,
      send_to: GA_ID,
    });
  }, [location.pathname, location.search]);
}
