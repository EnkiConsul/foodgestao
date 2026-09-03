import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type TurnstileMode = "test" | "live";
type Config = { siteKey: string; mode: TurnstileMode };

let cached: Config | null = null;
let inflight: Promise<Config> | null = null;

async function fetchConfig(): Promise<Config> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    const { data, error } = await supabase.functions.invoke("auth-config", { method: "GET" as never });
    if (error || !data?.turnstile_site_key) {
      console.warn("[useTurnstileSiteKey] falha ao carregar site key", error);
      return { siteKey: "", mode: "live" as TurnstileMode };
    }
    cached = {
      siteKey: data.turnstile_site_key as string,
      mode: data.turnstile_mode === "test" ? "test" : "live",
    };
    return cached;
  })();
  return inflight;
}

/** Site key do Turnstile (string vazia enquanto carrega ou em caso de falha). */
export function useTurnstileSiteKey() {
  return useTurnstileConfig().siteKey;
}

/** Site key + modo: em preview/localhost a chave de teste do Cloudflare é usada. */
export function useTurnstileConfig(): Config {
  const [config, setConfig] = useState<Config>(cached ?? { siteKey: "", mode: "live" });
  useEffect(() => {
    if (cached) { setConfig(cached); return; }
    let alive = true;
    fetchConfig().then((c) => { if (alive) setConfig(c); });
    return () => { alive = false; };
  }, []);
  return config;
}
