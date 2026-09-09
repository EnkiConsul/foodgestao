import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/** Canal único de presença da plataforma. */
const PRESENCE_TOPIC = "presence:online-users";
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

// --- Canal compartilhado (uma única inscrição por aba) -----------------------

type Listener = (entries: PresenceEntry[], connected: boolean) => void;

let channel: RealtimeChannel | null = null;
let entriesCache: PresenceEntry[] = [];
let connectedCache = false;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((l) => l(entriesCache, connectedCache));
}

function ensureChannel(presenceKey: string): RealtimeChannel {
  if (channel) return channel;
  const ch = supabase.channel(PRESENCE_TOPIC, {
    config: { presence: { key: presenceKey } },
  });
  const sync = () => {
    const state = ch.presenceState<PresenceEntry>();
    entriesCache = (Object.values(state).flat() as unknown as PresenceEntry[]).filter(
      (r) => r && typeof r.user_id === "string",
    );
    notify();
  };
  ch.on("presence", { event: "sync" }, sync)
    .on("presence", { event: "join" }, sync)
    .on("presence", { event: "leave" }, sync)
    .subscribe((status) => {
      connectedCache = status === "SUBSCRIBED";
      notify();
    });
  channel = ch;
  return ch;
}

function teardownChannel() {
  if (channel && listeners.size === 0) {
    void supabase.removeChannel(channel);
    channel = null;
    entriesCache = [];
    connectedCache = false;
  }
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
  const routeRef = useRef<string>(location.pathname);
  const trackRef = useRef<(() => void) | null>(null);

  routeRef.current = location.pathname;

  useEffect(() => {
    if (!user) return;

    const name =
      (user.user_metadata?.full_name as string | undefined) ||
      user.email?.split("@")[0] ||
      "Usuário";

    const ch = ensureChannel(`${user.id}:${sinceRef.current}`);

    const track = () => {
      const idle = Date.now() - lastActivityRef.current > IDLE_MS;
      void ch.track({
        user_id: user.id,
        name,
        email: user.email ?? null,
        route: routeRef.current,
        status: idle ? "ausente" : "online",
        since: sinceRef.current,
        last_activity: new Date(lastActivityRef.current).toISOString(),
      } satisfies PresenceEntry);
    };
    trackRef.current = track;

    const listener: Listener = (_e, connected) => {
      if (connected) track();
    };
    listeners.add(listener);
    if (connectedCache) track();

    const markActivity = () => {
      lastActivityRef.current = Date.now();
    };
    const events = ["pointerdown", "keydown", "visibilitychange", "focus"] as const;
    events.forEach((e) => window.addEventListener(e, markActivity, { passive: true }));

    const interval = setInterval(track, HEARTBEAT_MS);

    return () => {
      clearInterval(interval);
      events.forEach((e) => window.removeEventListener(e, markActivity));
      listeners.delete(listener);
      trackRef.current = null;
      void ch.untrack();
      teardownChannel();
    };
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
  const [entries, setEntries] = useState<PresenceEntry[]>(entriesCache);
  const [connected, setConnected] = useState(connectedCache);

  useEffect(() => {
    const listener: Listener = (e, c) => {
      setEntries(e);
      setConnected(c);
    };
    listeners.add(listener);
    setEntries(entriesCache);
    setConnected(connectedCache);
    return () => {
      listeners.delete(listener);
      teardownChannel();
    };
  }, []);

  return { entries, connected };
}
