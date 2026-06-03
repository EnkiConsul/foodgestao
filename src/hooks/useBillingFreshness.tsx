import { useSyncExternalStore } from "react";

export type FreshnessKey = "invoices" | "quota" | "subscription";

type Reason = "payment_received" | "invoice_created" | "invoice_updated" | "subscription_updated";

interface FreshnessEvent {
  at: number;
  reason: Reason;
}

const state: Record<FreshnessKey, FreshnessEvent | null> = {
  invoices: null,
  quota: null,
  subscription: null,
};

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function markFresh(key: FreshnessKey, reason: Reason) {
  state[key] = { at: Date.now(), reason };
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  // Tick every 15s so "há Xs" labels stay current without re-renders elsewhere.
  const interval = setInterval(cb, 15_000);
  return () => {
    listeners.delete(cb);
    clearInterval(interval);
  };
}

export function useFreshness(key: FreshnessKey): FreshnessEvent | null {
  return useSyncExternalStore(
    subscribe,
    () => state[key],
    () => null,
  );
}

export function formatFreshness(at: number): string {
  const diff = Math.max(0, Math.floor((Date.now() - at) / 1000));
  if (diff < 5) return "Atualizado agora";
  if (diff < 60) return `Atualizado há ${diff}s`;
  const min = Math.floor(diff / 60);
  if (min < 60) return `Atualizado há ${min} min`;
  const h = Math.floor(min / 60);
  return `Atualizado há ${h} h`;
}

export const REASON_LABEL: Record<Reason, string> = {
  payment_received: "pagamento confirmado",
  invoice_created: "nova fatura recebida",
  invoice_updated: "fatura atualizada",
  subscription_updated: "assinatura atualizada",
};
