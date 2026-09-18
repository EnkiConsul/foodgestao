// Lightweight analytics helpers for GA4 + GTM dataLayer.
// Safe to call in any environment — no-ops when gtag/dataLayer are unavailable.
//
// AUD-021: nenhum evento sai em rota sensível (login, ativação, recuperação,
// convite, OAuth) ou em URL com credencial temporária na query/fragmento. O
// contexto de página é sanitizado por allowlist: caminho + parâmetros de
// campanha, sem fragmento, sem IDs sensíveis e sem referrer bruto.

import { isSensitiveLocation, sanitizePath, sanitizeUrl } from "@/lib/security/trackingPrivacy";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dataLayer?: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gtag?: (...args: any[]) => void;
  }
}

type Params = Record<string, unknown>;

function withPageContext(params: Params = {}): Params {
  if (typeof window === "undefined") return params;
  const { origin, pathname, search } = window.location;
  return {
    page_location: sanitizeUrl(origin, pathname, search),
    page_path: sanitizePath(pathname, search),
    ...params,
  };
}

/** Push an event to GTM dataLayer AND send it via GA4 gtag. */
export function trackEvent(eventName: string, params: Params = {}) {
  if (typeof window === "undefined") return;
  const { pathname, search, hash } = window.location;
  // Rota sensível ou URL com credencial: nada é registrado, nem no dataLayer.
  if (isSensitiveLocation(pathname, search, hash)) return;
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
  SignupFormView: "signup_form_view",
  SignupStart: "signup_start",
  SignupValidationError: "signup_validation_error",
  SignupSuccess: "sign_up", // GA4 recommended event
  SignupError: "signup_error",
  LeadGenerated: "generate_lead", // GA4 recommended conversion
} as const;
