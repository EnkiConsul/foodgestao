/** Captura e preserva parâmetros de campanha durante a navegação no site. */

const STORAGE_KEY = "mkt_utm";
const KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"] as const;

export type UtmData = Record<string, string>;

export function captureUtm(): UtmData {
  if (typeof window === "undefined") return {};
  try {
    const params = new URLSearchParams(window.location.search);
    const stored: UtmData = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}");
    let changed = false;
    for (const key of KEYS) {
      const value = params.get(key);
      if (value) {
        stored[key] = value.slice(0, 200);
        changed = true;
      }
    }
    if (!stored.referrer && document.referrer && !document.referrer.includes(window.location.host)) {
      stored.referrer = document.referrer.slice(0, 200);
      changed = true;
    }
    if (changed) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    return stored;
  } catch {
    return {};
  }
}

export function getUtm(): UtmData {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

/** Anexa as UTMs conhecidas a uma rota interna, preservando a campanha. */
export function withUtm(path: string): string {
  const utm = getUtm();
  const entries = Object.entries(utm).filter(([k]) => k !== "referrer");
  if (entries.length === 0) return path;
  const [base, hash] = path.split("#");
  const sep = base.includes("?") ? "&" : "?";
  const qs = new URLSearchParams(entries as [string, string][]).toString();
  return `${base}${sep}${qs}${hash ? `#${hash}` : ""}`;
}
