import { useMemo } from "react";
import { useLocation } from "react-router-dom";

export const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
];

export function useUtmQuery() {
  const { search } = useLocation();
  return useMemo(() => {
    const params = new URLSearchParams(search);
    const out = new URLSearchParams();
    UTM_KEYS.forEach((k) => {
      const v = params.get(k);
      if (v) out.set(k, v);
    });
    return out.toString();
  }, [search]);
}

export function buildCta(base: string, utm: string, extra?: Record<string, string>) {
  const u = new URL(base, "https://x.local");
  if (extra) Object.entries(extra).forEach(([k, v]) => u.searchParams.set(k, v));
  if (utm) {
    const e = new URLSearchParams(utm);
    e.forEach((v, k) => u.searchParams.set(k, v));
  }
  return u.pathname + (u.search ? u.search : "");
}

type GtagWindow = Window & {
  dataLayer?: Record<string, unknown>[];
  gtag?: (...args: unknown[]) => void;
};

export function trackCta(source: string, ctaText = "Conheça a solução") {
  try {
    const w = window as GtagWindow;
    const payload = {
      cta_source: source,
      cta_text: ctaText,
      cta_destination: "/auth?tab=signup",
      page_location: window.location.href,
      page_path: window.location.pathname,
    };

    w.dataLayer = w.dataLayer || [];
    w.dataLayer.push({ event: "cta_click_trial", ...payload });

    if (typeof w.gtag === "function") {
      w.gtag("event", "cta_click_trial", {
        event_category: "landing_cta",
        event_label: source,
        ...payload,
      });
      w.gtag("event", "generate_lead", {
        currency: "BRL",
        value: 0,
        method: source,
        ...payload,
      });
    }
  } catch {
    // noop
  }
}

export const formatPrice = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });
