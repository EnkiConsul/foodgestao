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
        // O toast com mensagem/código já foi disparado pelo hook (onError).
        // Fecha o modal para o usuário reagir à orientação exibida.
        if (!cancelled) onClose();
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, companyId, mode, connectionId]);

  if (!open || !session) return null;

  const registerFromEvent = async (itemId: string) => {
    try {
      await registerItem.mutateAsync({
        request_id: session.requestId,
        item_id: itemId,
      });
      onSuccess?.();
    } catch {
      // toast já foi disparado pelo hook; deixa a UI reagir
    }
  };

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
            await registerFromEvent(itemData.item.id);
          } finally {
            setSession(null);
            onClose();
          }
        }}
        // Fallback: alguns eventos do widget (item criado, mas modal fechado
        // antes do onSuccess) chegam apenas pelo onEvent. Registramos assim
        // que temos o itemId para evitar itens órfãos.
        onEvent={(event: { event?: string; itemId?: string; item?: { id?: string } }) => {
          const itemId = event?.itemId ?? event?.item?.id;
          const name = String(event?.event ?? "").toUpperCase();
          if (itemId && (name === "ITEM_CREATED" || name === "ITEM_UPDATED" || name === "LOGIN_SUCCESS")) {
            void registerFromEvent(itemId);
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
