import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  itemIdToUpdate?: string; // reconnect existing item
  onConnected?: (payload: { itemId: string; connectionId?: string }) => void;
}

declare global {
  interface Window {
    PluggyConnect?: new (opts: any) => { init: () => void; destroy?: () => void };
  }
}

const SCRIPT_SRC = "https://cdn.pluggy.ai/pluggy-connect/v2.9.0/pluggy-connect.js";

function loadScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.PluggyConnect) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("script_load_failed")));
      return;
    }
    const s = document.createElement("script");
    s.src = SCRIPT_SRC; s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("script_load_failed"));
    document.head.appendChild(s);
  });
}

export function PluggyConnectDialog({ open, onOpenChange, companyId, itemIdToUpdate, onConnected }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const instanceRef = useRef<any>(null);
  const launchedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      launchedRef.current = false;
      setError(null);
      try { instanceRef.current?.destroy?.(); } catch { /* noop */ }
      instanceRef.current = null;
      return;
    }
    if (launchedRef.current) return;
    launchedRef.current = true;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        await loadScript();
        const { data, error: e } = await supabase.functions.invoke("pluggy-connect-token", {
          body: { item_id: itemIdToUpdate },
        });
        if (e || !data?.accessToken) throw new Error(e?.message ?? "connect_token_failed");

        const PluggyConnect = window.PluggyConnect!;
        const pc = new PluggyConnect({
          connectToken: data.accessToken,
          includeSandbox: false,
          updateItem: itemIdToUpdate,
          onSuccess: async (itemData: any) => {
            const itemId = itemData?.item?.id ?? itemData?.itemId ?? itemData?.id;
            if (!itemId) { toast.error("Conexão sem item retornado"); onOpenChange(false); return; }
            toast.info("Conta conectada. Sincronizando últimos 30 dias…");
            try {
              const { data: sync, error: sErr } = await supabase.functions.invoke("pluggy-sync-item", {
                body: { item_id: itemId, company_id: companyId, first_connect: true },
              });
              if (sErr) throw sErr;
              toast.success(`Sincronização concluída: ${sync?.transactions ?? 0} lançamentos importados`);
              onConnected?.({ itemId, connectionId: sync?.connection_id });
            } catch (err) {
              console.error(err);
              toast.error("Sincronização falhou. Você pode tentar novamente em Conexões.");
              onConnected?.({ itemId });
            }
            onOpenChange(false);
          },
          onError: (err: any) => {
            console.error("PluggyConnect error", err);
            setError(err?.message ?? "Erro na conexão");
          },
          onClose: () => {
            onOpenChange(false);
          },
        });
        instanceRef.current = pc;
        pc.init();
      } catch (e: any) {
        setError(e?.message ?? "Falha ao iniciar Pluggy Connect");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, companyId, itemIdToUpdate, onConnected, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Conectar via Open Finance</DialogTitle>
          <DialogDescription>
            {loading
              ? "Preparando conexão segura…"
              : error
              ? "Não foi possível iniciar a conexão."
              : "Uma janela segura será aberta para você autenticar-se no seu banco."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-center py-6">
          {loading && <Loader2 className="h-6 w-6 animate-spin text-primary" />}
          {error && <p className="text-sm text-destructive text-center">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
