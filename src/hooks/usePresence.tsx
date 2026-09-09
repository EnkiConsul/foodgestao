import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/** Canal único de presença da plataforma. */
const PRESENCE_CHANNEL = "presence:online-users";
/** Sem interação por mais que isso → "ausente". */
const IDLE_MS = 5 * 60 * 1000;
/** Intervalo mínimo entre atualizações enviadas ao canal. */
const HEARTBEAT_MS = 30 * 1000;

export type PresenceStatus = "online" | "ausente";

export interface PresenceEntry {
  user_id: string;
  name: string;
  email: string | null;
  route: string;
  status: PresenceStatus;
  /** Início da sessão nesta aba (ISO). */
  since: string;
  /** Última interação detectada (ISO). */
  last_activity: string;
}

/**
 * Publica a presença do usuário logado no canal compartilhado.
 * Deve ser montado uma única vez, dentro do AuthProvider e do Router.
 */
export function usePresenceTracker() {
  const { user } = useAuth();
  const location = useLocation();
  const lastActivityRef = useRef<number>(Date.now());
  const sinceRef = useRef<string>(new Date().toISOString());
  const trackRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!user) return;

    const name =
      (user.user_metadata?.full_name as string | undefined) ||
      user.email?.split("@")[0] ||
      "Usuário";

    const channel = supabase.channel(PRESENCE_CHANNEL, {
      config: { presence: { key: `${user.id}:${sinceRef.current}` } },
    });

    let currentRoute = location.pathname;

    const track = () => {
      const idle = Date.now() - lastActivityRef.current > IDLE_MS;
      void channel.track({
        user_id: user.id,
        name,
        email: user.email ?? null,
        route: currentRoute,
        status: idle ? "ausente" : "online",
        since: sinceRef.current,
        last_activity: new Date(lastActivityRef.current).toISOString(),
      } satisfies PresenceEntry);
    };
    trackRef.current = track;

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") track();
    });

    const markActivity = () => {
      lastActivityRef.current = Date.now();
    };
    const events = ["pointerdown", "keydown", "visibilitychange", "focus"] as const;
    events.forEach((e) => window.addEventListener(e, markActivity, { passive: true }));

    const interval = setInterval(track, HEARTBEAT_MS);

    return () => {
      clearInterval(interval);
      events.forEach((e) => window.removeEventListener(e, markActivity));
      trackRef.current = null;
      void supabase.removeChannel(channel);
    };
    // route é enviado por um efeito separado para não recriar o canal
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Atualiza a rota atual sem recriar a inscrição
  useEffect(() => {
    lastActivityRef.current = Date.now();
    trackRef.current?.();
  }, [location.pathname]);
}

/** Monta o rastreador de presença (componente sem UI). */
export function PresenceTracker() {
  usePresenceTracker();
  return null;
}

/** Lê, em tempo real, quem está conectado agora. */
export function useOnlineUsers() {
  const [entries, setEntries] = useState<PresenceEntry[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const channel = supabase.channel(PRESENCE_CHANNEL);

    const sync = () => {
      const state = channel.presenceState<PresenceEntry>();
      const rows = Object.values(state).flat() as unknown as PresenceEntry[];
      setEntries(
        rows.filter((r) => r && typeof r.user_id === "string"),
      );
    };

    channel
      .on("presence", { event: "sync" }, sync)
      .on("presence", { event: "join" }, sync)
      .on("presence", { event: "leave" }, sync)
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  return { entries, connected };
}
