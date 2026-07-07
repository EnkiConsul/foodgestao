import { useEffect, useRef, useState } from "react";

const CDN_URL = "https://cdn.pluggy.ai/pluggy-connect/v2.9.0/pluggy-connect.js";

declare global {
  interface Window {
    PluggyConnect?: new (opts: PluggyConnectOptions) => PluggyConnectInstance;
  }
}

interface PluggyConnectOptions {
  connectToken: string;
  includeSandbox?: boolean;
  updateItem?: string;
  onSuccess: (data: { item: { id: string } }) => void;
  onError?: (err: { message?: string }) => void;
  onClose?: () => void;
}

interface PluggyConnectInstance {
  init: () => void;
  destroy?: () => void;
}

let scriptPromise: Promise<void> | null = null;

function loadPluggyScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.PluggyConnect) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = CDN_URL;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("Falha ao carregar Pluggy Connect"));
    };
    document.body.appendChild(s);
  });
  return scriptPromise;
}

export interface UsePluggyConnectResult {
  loading: boolean;
  open: (opts: {
    fetchToken: () => Promise<string>;
    updateItem?: string;
    onSuccess: (itemId: string) => void;
    onError?: (msg: string) => void;
  }) => Promise<void>;
}

export function usePluggyConnect(): UsePluggyConnectResult {
  const [loading, setLoading] = useState(false);
  const instanceRef = useRef<PluggyConnectInstance | null>(null);

  useEffect(() => {
    return () => {
      instanceRef.current?.destroy?.();
      instanceRef.current = null;
    };
  }, []);

  const open: UsePluggyConnectResult["open"] = async ({
    fetchToken,
    updateItem,
    onSuccess,
    onError,
  }) => {
    setLoading(true);
    try {
      await loadPluggyScript();
      const token = await fetchToken();
      if (!window.PluggyConnect) throw new Error("Widget Pluggy indisponível");
      const inst = new window.PluggyConnect({
        connectToken: token,
        includeSandbox: false,
        updateItem,
        onSuccess: ({ item }) => {
          onSuccess(item.id);
        },
        onError: (err) => onError?.(err.message ?? "Erro ao conectar"),
      });
      instanceRef.current = inst;
      inst.init();
    } catch (e) {
      onError?.((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return { loading, open };
}
