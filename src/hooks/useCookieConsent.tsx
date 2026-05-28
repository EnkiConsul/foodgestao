import { useEffect, useState } from "react";

type ConsentCategory = "necessary" | "analytics" | "marketing";
export type ConsentPrefs = {
  status: "accepted" | "rejected" | "custom" | "unset";
  analytics: boolean;
  marketing: boolean;
  ts: number | null;
};

const STORAGE_KEY = "plin_cookie_consent";
const UNSET: ConsentPrefs = { status: "unset", analytics: false, marketing: false, ts: null };

function read(): ConsentPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return UNSET;
    const parsed = JSON.parse(raw) as Partial<ConsentPrefs>;
    return {
      status: parsed.status ?? "unset",
      analytics: !!parsed.analytics,
      marketing: !!parsed.marketing,
      ts: parsed.ts ?? null,
    };
  } catch {
    return UNSET;
  }
}

function write(prefs: ConsentPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    window.dispatchEvent(new CustomEvent("plin:cookie-consent-change", { detail: prefs }));
  } catch {
    // noop
  }
}

export function useCookieConsent() {
  const [prefs, setPrefs] = useState<ConsentPrefs>(() => read());

  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<ConsentPrefs>).detail;
      if (detail) setPrefs(detail);
    };
    window.addEventListener("plin:cookie-consent-change", onChange);
    return () => window.removeEventListener("plin:cookie-consent-change", onChange);
  }, []);

  const acceptAll = () =>
    write({ status: "accepted", analytics: true, marketing: true, ts: Date.now() });
  const rejectAll = () =>
    write({ status: "rejected", analytics: false, marketing: false, ts: Date.now() });
  const savePrefs = (next: { analytics: boolean; marketing: boolean }) =>
    write({ status: "custom", analytics: next.analytics, marketing: next.marketing, ts: Date.now() });
  const reset = () => write(UNSET);

  const has = (cat: ConsentCategory) => {
    if (cat === "necessary") return true;
    return !!prefs[cat];
  };

  return { prefs, acceptAll, rejectAll, savePrefs, reset, has, decided: prefs.status !== "unset" };
}
