import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ativarPush, desativarPush, pushEstado, PUSH_MENSAGEM, type PushEstado } from "@/lib/push";

export function AtivarPushCard() {
  const [estado, setEstado] = useState<PushEstado | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { pushEstado().then(setEstado).catch(() => setEstado("nao_suportado")); }, []);
  if (!estado) return null;

  const ativar = async () => {
    setBusy(true);
    try {
      const r = await ativarPush();
      setEstado(r);
      if (r === "ativo") toast.success("Notificações Ativadas Neste Aparelho.");
      else toast.info(PUSH_MENSAGEM[r]);
    } catch { toast.error("Não foi possível ativar as notificações. Tente novamente."); }
    finally { setBusy(false); }
  };
  const desativar = async () => {
    setBusy(true);
    try { await desativarPush(); setEstado("inativo"); toast.success("Notificações Desativadas Neste Aparelho."); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center">
      <BellRing className="h-5 w-5 shrink-0 text-primary" />
      <div className="flex-1">
        <div className="text-sm font-semibold">Notificações No Celular</div>
        <div className="text-xs text-muted-foreground">{PUSH_MENSAGEM[estado]}</div>
      </div>
      {estado === "inativo" && <Button size="sm" onClick={ativar} disabled={busy}>{busy ? "Ativando..." : "Ativar"}</Button>}
      {estado === "ativo" && <Button size="sm" variant="outline" onClick={desativar} disabled={busy}>Desativar</Button>}
    </div>
  );
}
