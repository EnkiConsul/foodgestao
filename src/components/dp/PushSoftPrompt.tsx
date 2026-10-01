import { useEffect, useState } from "react";
import { BellRing, Share, PlusSquare } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ativarPush, pushEstado, PUSH_MENSAGEM, type PushEstado } from "@/lib/push";

const KEY = "aveto_push_prompt_adiado_ate";
const ADIAR_DIAS = 3;
const EVENTO = "aveto:push-sugerir";

/** Chame após uma ação de alta intenção (pedido de folga, atestado, publicação de escala). */
export function sugerirPushContextual(motivo?: string) {
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: { motivo } }));
}

function adiado() {
  const v = Number(localStorage.getItem(KEY) || 0);
  return v > Date.now();
}
function adiar(dias = ADIAR_DIAS) {
  localStorage.setItem(KEY, String(Date.now() + dias * 86400000));
}

export function PushSoftPrompt() {
  const [open, setOpen] = useState(false);
  const [estado, setEstado] = useState<PushEstado | null>(null);
  const [motivo, setMotivo] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const movel = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

  const avaliar = async (forcar: boolean, m?: string) => {
    const e = await pushEstado().catch(() => "nao_suportado" as PushEstado);
    if (e !== "inativo" && e !== "ios_instalar") return;
    if (!forcar && adiado()) return;
    setEstado(e); setMotivo(m); setOpen(true);
  };

  useEffect(() => {
    const t = setTimeout(() => avaliar(false), 2500);
    const h = (ev: Event) => avaliar(true, (ev as CustomEvent).detail?.motivo);
    window.addEventListener(EVENTO, h);
    return () => { clearTimeout(t); window.removeEventListener(EVENTO, h); };
  }, []);

  const fechar = () => { adiar(); setOpen(false); };
  const ativar = async () => {
    setBusy(true);
    try {
      const r = await ativarPush();
      if (r === "ativo") { toast.success("Notificações Ativadas Neste Aparelho."); setOpen(false); }
      else { toast.info(PUSH_MENSAGEM[r]); if (r === "negado") adiar(3650); setOpen(false); }
    } catch { toast.error("Não foi possível ativar as notificações. Tente novamente."); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) fechar(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <BellRing className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">
            {motivo ? "Quer Ser Avisado Da Resposta?" : (movel ? "Receba Avisos Na Barra Do Celular" : "Receba Avisos Neste Computador")}
          </DialogTitle>
          <DialogDescription className="text-center">
            {motivo ?? "Folgas, escalas, recibos para assinar e prazos chegam na hora, mesmo com o app fechado." + (movel ? "" : " Os avisos aparecem no canto da tela.")}
          </DialogDescription>
        </DialogHeader>
        {estado === "ios_instalar" && (
          <ol className="space-y-2 rounded-lg border bg-muted/40 p-3 text-sm">
            <li className="flex items-center gap-2"><Share className="h-4 w-4 text-primary" /> Toque em Compartilhar no Safari.</li>
            <li className="flex items-center gap-2"><PlusSquare className="h-4 w-4 text-primary" /> Escolha "Adicionar à Tela de Início".</li>
            <li>Abra o AVETO 360 pelo ícone e ative os avisos.</li>
          </ol>
        )}
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {estado === "inativo" && <Button onClick={ativar} disabled={busy} className="w-full">Ativar Notificações</Button>}
          <Button variant="ghost" onClick={fechar} className="w-full">Agora Não</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
