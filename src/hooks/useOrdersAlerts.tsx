import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type NotificationPermissionState = "unsupported" | "default" | "granted" | "denied";

interface AlertOptions {
  /** Repetição controlada: intervalo mínimo entre avisos do mesmo pedido. */
  repeatMs?: number;
}

/**
 * Alertas operacionais: som, aviso visual e notificação do navegador.
 * Nada é persistido — as preferências vivem apenas na sessão da tela.
 */
export function useOrdersAlerts(options?: AlertOptions) {
  const repeatMs = options?.repeatMs ?? 30_000;

  const [soundEnabled, setSoundEnabled] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [volume, setVolume] = useState(0.4);
  const [flash, setFlash] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastAlertRef = useRef<Map<string, number>>(new Map());
  const acknowledgedRef = useRef<Set<string>>(new Set());

  const permission: NotificationPermissionState = useMemo(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
    return Notification.permission as NotificationPermissionState;
  }, [notificationsEnabled]);

  useEffect(
    () => () => {
      void audioCtxRef.current?.close();
      audioCtxRef.current = null;
    },
    [],
  );

  const playBeep = useCallback(
    async (times = 2) => {
      if (typeof window === "undefined") return false;
      try {
        const Ctx =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return false;
        const ctx = audioCtxRef.current ?? new Ctx();
        audioCtxRef.current = ctx;
        if (ctx.state === "suspended") await ctx.resume();

        for (let i = 0; i < times; i += 1) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.value = i % 2 === 0 ? 880 : 1180;
          gain.gain.value = Math.min(1, Math.max(0, volume)) * 0.25;
          osc.connect(gain).connect(ctx.destination);
          const start = ctx.currentTime + i * 0.28;
          osc.start(start);
          osc.stop(start + 0.18);
        }
        return true;
      } catch {
        return false;
      }
    },
    [volume],
  );

  const requestNotificationPermission = useCallback(async (): Promise<NotificationPermissionState> => {
    if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
    if (Notification.permission === "granted") {
      setNotificationsEnabled(true);
      return "granted";
    }
    if (Notification.permission === "denied") {
      setNotificationsEnabled(false);
      return "denied";
    }
    const result = await Notification.requestPermission();
    setNotificationsEnabled(result === "granted");
    return result as NotificationPermissionState;
  }, []);

  const showNotification = useCallback(
    (title: string, body: string) => {
      if (typeof window === "undefined" || !("Notification" in window)) return false;
      if (Notification.permission !== "granted" || !notificationsEnabled) return false;
      try {
        // corpo enxuto: nunca inclui telefone, endereço ou valores
        new Notification(title, { body, tag: title, silent: true });
        return true;
      } catch {
        return false;
      }
    },
    [notificationsEnabled],
  );

  /** Aviso visual curto (usado em conjunto com badge/contador). */
  const triggerFlash = useCallback(() => {
    setFlash(true);
    window.setTimeout(() => setFlash(false), 1_200);
  }, []);

  /**
   * Alerta de um pedido específico, com repetição controlada e silêncio
   * definitivo depois do reconhecimento na tela.
   */
  const alertOrder = useCallback(
    async (key: string, title: string, body: string) => {
      if (acknowledgedRef.current.has(key)) return false;
      const last = lastAlertRef.current.get(key) ?? 0;
      if (Date.now() - last < repeatMs) return false;
      lastAlertRef.current.set(key, Date.now());

      triggerFlash();
      if (soundEnabled) await playBeep();
      showNotification(title, body);
      return true;
    },
    [playBeep, repeatMs, showNotification, soundEnabled, triggerFlash],
  );

  /** Reconhecimento: silencia o pedido até o fim da sessão. */
  const acknowledge = useCallback((key: string) => {
    acknowledgedRef.current.add(key);
    lastAlertRef.current.delete(key);
  }, []);

  const acknowledgeAll = useCallback((keys: string[]) => {
    keys.forEach((k) => acknowledgedRef.current.add(k));
    lastAlertRef.current.clear();
  }, []);

  const testSound = useCallback(async () => {
    const ok = await playBeep(1);
    return ok;
  }, [playBeep]);

  const testNotification = useCallback(async () => {
    const state = await requestNotificationPermission();
    if (state !== "granted") return state;
    showNotification("360°FOOD — teste", "As notificações estão funcionando.");
    return state;
  }, [requestNotificationPermission, showNotification]);

  return {
    soundEnabled,
    setSoundEnabled,
    notificationsEnabled,
    setNotificationsEnabled,
    volume,
    setVolume,
    flash,
    permission,
    permissionBlocked: permission === "denied",
    requestNotificationPermission,
    alertOrder,
    acknowledge,
    acknowledgeAll,
    testSound,
    testNotification,
  };
}
