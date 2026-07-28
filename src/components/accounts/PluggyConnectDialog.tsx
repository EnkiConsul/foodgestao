import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

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

const SCRIPT_SRC = "https://cdn.pluggy.ai/pluggy-connect/v2.11.0/pluggy-connect.js";
const RESUME_KEY = "pluggy_connect_resume_v1";

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

// URL de retorno após o consent de Open Finance no site do banco.
// Precisa ser same-origin com a página que abriu o Connect.
function buildOauthRedirectUri(): string {
  const url = new URL(window.location.href);
  // Limpa quaisquer params antigos para evitar loops.
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function PluggyConnectDialog({ open, onOpenChange, companyId, itemIdToUpdate, onConnected }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [widgetReady, setWidgetReady] = useState(false);
  const instanceRef = useRef<any>(null);
  const launchedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      launchedRef.current = false;
      setError(null);
      setWidgetReady(false);
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

        // Se estamos retomando de um redirect de Open Finance, reutiliza o
        // connectToken salvo para que o SDK conclua o item; caso contrário
        // pede um novo token ao backend.
        let accessToken: string | undefined;
        let resumeItemId: string | undefined = itemIdToUpdate;
        const resumeRaw = sessionStorage.getItem(RESUME_KEY);
        const url = new URL(window.location.href);
        const hasOauthReturn =
          url.searchParams.has("item_id") ||
          url.searchParams.has("pluggy_item_id") ||
          url.searchParams.has("oauth") ||
          url.searchParams.has("code");
        if (resumeRaw && hasOauthReturn) {
          try {
            const resume = JSON.parse(resumeRaw) as {
              accessToken?: string;
              companyId?: string;
              itemIdToUpdate?: string;
            };
            if (resume?.accessToken && resume.companyId === companyId) {
              accessToken = resume.accessToken;
              resumeItemId = resume.itemIdToUpdate ?? itemIdToUpdate;
            }
          } catch { /* noop */ }
        }

        if (!accessToken) {
          const { data, error: e } = await supabase.functions.invoke("pluggy-connect-token", {
            body: {
              item_id: itemIdToUpdate,
              oauth_redirect_uri: buildOauthRedirectUri(),
            },
          });
          if (e || !data?.accessToken) throw new Error(e?.message ?? "connect_token_failed");
          accessToken = data.accessToken as string;
        }

        // Persiste dados para conseguir retomar após redirect de OF.
        sessionStorage.setItem(
          RESUME_KEY,
          JSON.stringify({ accessToken, companyId, itemIdToUpdate: resumeItemId }),
        );

        const PluggyConnect = window.PluggyConnect!;
        const pc = new PluggyConnect({
          connectToken: accessToken,
          includeSandbox: false,
          updateItem: resumeItemId,
          // Conectores Open Finance (C6, Itaú OF, etc.) exigem redirecionar o
          // topo do navegador para data.of.pluggy.ai / site do banco. Sem
          // oauthRedirectUri o widget tenta abrir em iframe e o banco
          // recusa via X-Frame-Options (ERR_BLOCKED_BY_RESPONSE).
          oauthRedirectUri: buildOauthRedirectUri(),
          onSuccess: async (itemData: any) => {
            sessionStorage.removeItem(RESUME_KEY);
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
            setWidgetReady(false);
          },
          onClose: () => {
            sessionStorage.removeItem(RESUME_KEY);
            onOpenChange(false);
          },
        });
        instanceRef.current = pc;
        pc.init();
        setWidgetReady(true);
      } catch (e: any) {
        sessionStorage.removeItem(RESUME_KEY);
        setError(e?.message ?? "Falha ao iniciar Pluggy Connect");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, companyId, itemIdToUpdate, onConnected, onOpenChange]);

  // Widget da Pluggy gerencia seu próprio modal fullscreen.
  // Só renderizamos overlay próprio para os estados de loading inicial e erro,
  // evitando qualquer wrapper (ex.: Radix Dialog) que capture cliques como "outside".
  if (!open) return null;
  if (widgetReady && !error) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Conectar via Open Finance"
    >
      <div className="mx-4 w-full max-w-md rounded-lg border bg-card p-6 shadow-lg">
        <h2 className="text-lg font-semibold">Conectar via Open Finance</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {loading
            ? "Preparando conexão segura…"
            : error
            ? "Não foi possível iniciar a conexão."
            : "Uma janela segura será aberta para você autenticar-se no seu banco."}
        </p>
        <div className="flex items-center justify-center py-6">
          {loading && <Loader2 className="h-6 w-6 animate-spin text-primary" />}
          {error && <p className="text-sm text-destructive text-center">{error}</p>}
        </div>
        {error && (
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
