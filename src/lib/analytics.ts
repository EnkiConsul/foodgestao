// Lightweight analytics helpers for GA4 + GTM dataLayer.
// Safe to call in any environment — no-ops when gtag/dataLayer are unavailable.

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
    gtag?: (...args: unknown[]) => void;
  }
}

type Params = Record<string, unknown>;

function withPageContext(params: Params = {}): Params {
  if (typeof window === "undefined") return params;
  return {
    page_location: window.location.href,
    page_path: window.location.pathname + window.location.search,
    ...params,
  };
}

/** Push an event to GTM dataLayer AND send it via GA4 gtag. */
export function trackEvent(eventName: string, params: Params = {}) {
  if (typeof window === "undefined") return;
  const payload = withPageContext(params);
  try {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: eventName, ...payload });
  } catch {
    /* noop */
  }
  try {
    window.gtag?.("event", eventName, payload);
  } catch {
    /* noop */
  }
}

/** Funnel step names used across the landing → signup flow. */
export const FunnelStep = {
  CtaClick: "cta_click_trial",
  SignupStart: "signup_start",
  SignupValidationError: "signup_validation_error",
  SignupSuccess: "sign_up", // GA4 recommended event
  SignupError: "signup_error",
  LeadGenerated: "generate_lead", // GA4 recommended conversion
} as const;
