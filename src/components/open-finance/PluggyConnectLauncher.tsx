import { useEffect, useState, lazy, Suspense } from "react";
import { useCreateConnectToken, useRegisterPluggyItem } from "@/hooks/useOpenFinance";

// react-pluggy-connect renderiza um modal — carrega apenas quando aberto.
const PluggyConnect = lazy(() =>
  import("react-pluggy-connect").then((m) => ({ default: m.PluggyConnect })),
);

type Props = {
  companyId: string;
  mode?: "create" | "update" | "renew_consent";
  connectionId?: string;
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

export function PluggyConnectLauncher({
  companyId,
  mode = "create",
  connectionId,
  open,
  onClose,
  onSuccess,
}: Props) {
  const createToken = useCreateConnectToken();
  const registerItem = useRegisterPluggyItem();
  const [session, setSession] = useState<{ token: string; requestId: string } | null>(null);

  useEffect(() => {
    if (!open) {
      setSession(null);
      return;
    }
    let cancelled = false;
    createToken
      .mutateAsync({ company_id: companyId, mode, connection_id: connectionId })
      .then((res) => {
        if (!cancelled) setSession({ token: res.access_token, requestId: res.request_id });
      })
      .catch(() => {
        if (!cancelled) onClose();
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, companyId, mode, connectionId]);

  if (!open || !session) return null;

  return (
    <Suspense fallback={null}>
      <PluggyConnect
        connectToken={session.token}
        includeSandbox={false}
        onClose={() => {
          setSession(null);
          onClose();
        }}
        onSuccess={async (itemData: { item: { id: string } }) => {
          try {
            await registerItem.mutateAsync({
              request_id: session.requestId,
              item_id: itemData.item.id,
            });
            onSuccess?.();
          } finally {
            setSession(null);
            onClose();
          }
        }}
        onError={() => {
          setSession(null);
          onClose();
        }}
      />
    </Suspense>
  );
}
