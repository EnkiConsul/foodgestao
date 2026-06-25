/**
 * Métricas de performance no frontend (dev/diagnóstico).
 *
 * Coleta:
 *  - TTR (Time To Ready) por rota: do início da navegação até o componente sinalizar pronto.
 *  - Tempos de render por componente (média / p95 / último) via React Profiler.
 *  - Contagem de re-renders por componente.
 *
 * Os dados ficam num store em memória + window.__PERF__ para inspeção rápida no console.
 * Ative globalmente com VITE_PERF=1 (ou ?perf=1 na URL) — em produção fica zero-overhead
 * quando desligado.
 */
import { useEffect, useRef } from "react";
import type { ProfilerOnRenderCallback } from "react";

export type RenderSample = {
  count: number;
  totalMs: number;
  lastMs: number;
  maxMs: number;
  samples: number[]; // últimos 50 para p95
};

export type RouteTiming = {
  route: string;
  startedAt: number;
  readyAt?: number;
  ttrMs?: number;
};

type PerfStore = {
  enabled: boolean;
  renders: Map<string, RenderSample>;
  routes: RouteTiming[];
  listeners: Set<() => void>;
};

const URL_FLAG = typeof window !== "undefined" && /(?:[?&])perf=1\b/.test(window.location.search);
const ENV_FLAG = (import.meta as any).env?.VITE_PERF === "1" || (import.meta as any).env?.DEV;

const store: PerfStore = {
  enabled: Boolean(URL_FLAG || ENV_FLAG),
  renders: new Map(),
  routes: [],
  listeners: new Set(),
};

if (typeof window !== "undefined") {
  (window as any).__PERF__ = store;
  (window as any).__PERF_ENABLE__ = () => {
    store.enabled = true;
    emit();
  };
  (window as any).__PERF_DISABLE__ = () => {
    store.enabled = false;
    emit();
  };
  (window as any).__PERF_RESET__ = () => {
    store.renders.clear();
    store.routes = [];
    emit();
  };
}

function emit() {
  store.listeners.forEach((l) => l());
}

export function isPerfEnabled(): boolean {
  return store.enabled;
}

export function subscribePerf(listener: () => void): () => void {
  store.listeners.add(listener);
  return () => store.listeners.delete(listener);
}

export function getRenderStats(): Array<{ name: string } & RenderSample & { avgMs: number; p95Ms: number }> {
  const out: Array<{ name: string } & RenderSample & { avgMs: number; p95Ms: number }> = [];
  store.renders.forEach((s, name) => {
    const sorted = [...s.samples].sort((a, b) => a - b);
    const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : 0;
    out.push({
      name,
      ...s,
      avgMs: s.count ? s.totalMs / s.count : 0,
      p95Ms: p95,
    });
  });
  return out.sort((a, b) => b.totalMs - a.totalMs);
}

export function getRouteTimings(): RouteTiming[] {
  return [...store.routes].reverse();
}

/** Callback para <Profiler id="X" onRender={profilerOnRender}>. */
export const profilerOnRender: ProfilerOnRenderCallback = (id, _phase, actualDuration) => {
  if (!store.enabled) return;
  const cur = store.renders.get(id);
  if (!cur) {
    store.renders.set(id, {
      count: 1,
      totalMs: actualDuration,
      lastMs: actualDuration,
      maxMs: actualDuration,
      samples: [actualDuration],
    });
  } else {
    cur.count += 1;
    cur.totalMs += actualDuration;
    cur.lastMs = actualDuration;
    if (actualDuration > cur.maxMs) cur.maxMs = actualDuration;
    cur.samples.push(actualDuration);
    if (cur.samples.length > 50) cur.samples.shift();
  }
  emit();
};

/** Conta re-renders de um componente (uso opcional, sem Profiler). */
export function useRenderCount(name: string) {
  const n = useRef(0);
  n.current += 1;
  useEffect(() => {
    if (!store.enabled) return;
    const cur = store.renders.get(name);
    if (cur) {
      cur.count = n.current;
      emit();
    } else {
      store.renders.set(name, {
        count: n.current,
        totalMs: 0,
        lastMs: 0,
        maxMs: 0,
        samples: [],
      });
      emit();
    }
  });
}

/** Marca início da navegação para uma rota. */
export function markRouteStart(route: string) {
  if (!store.enabled) return;
  store.routes.push({ route, startedAt: performance.now() });
  if (store.routes.length > 50) store.routes.shift();
  emit();
}

/**
 * Marca a rota como "pronta" (TTR). Chame quando os dados principais terminam de carregar.
 * Use o hook useMarkRouteReady para casos comuns (depende de `loading`).
 */
export function markRouteReady(route: string) {
  if (!store.enabled) return;
  for (let i = store.routes.length - 1; i >= 0; i--) {
    const r = store.routes[i];
    if (r.route === route && r.readyAt === undefined) {
      r.readyAt = performance.now();
      r.ttrMs = r.readyAt - r.startedAt;
      emit();
      return;
    }
  }
}

/**
 * Hook: marca início no mount e ready quando `ready` vira true.
 * Exemplo: useMarkRouteReady("Lancamentos", !loading);
 */
export function useMarkRouteReady(route: string, ready: boolean) {
  const startedRef = useRef(false);
  const readyRef = useRef(false);

  if (!startedRef.current) {
    startedRef.current = true;
    markRouteStart(route);
  }

  useEffect(() => {
    if (ready && !readyRef.current) {
      readyRef.current = true;
      markRouteReady(route);
    }
  }, [ready, route]);
}
