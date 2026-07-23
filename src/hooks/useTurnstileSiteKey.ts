import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

let cached: string | null = null;
let inflight: Promise<string> | null = null;

async function fetchKey(): Promise<string> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    const { data, error } = await supabase.functions.invoke("auth-config", { method: "GET" as never });
    if (error || !data?.turnstile_site_key) {
      console.warn("[useTurnstileSiteKey] falha ao carregar site key", error);
      return "";
    }
    cached = data.turnstile_site_key as string;
    return cached;
  })();
  return inflight;
}

export function useTurnstileSiteKey() {
  const [siteKey, setSiteKey] = useState<string>(cached ?? "");
  useEffect(() => {
    if (cached) { setSiteKey(cached); return; }
    let alive = true;
    fetchKey().then((k) => { if (alive) setSiteKey(k); });
    return () => { alive = false; };
  }, []);
  return siteKey;
}
