import { useState } from "react";
import { Copy, MessageCircle, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { linkWhatsapp } from "@/lib/dp/whatsapp-despacho";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  numero: string;
  mensagem: string;
}

export function WhatsAppChoiceDrawer({ open, onOpenChange, numero, mensagem }: Props) {
  // A instância é remontada pelo chamador para cada destinatário/mensagem.
  const [texto, setTexto] = useState(mensagem);
  const android = /Android/i.test(navigator.userAgent);
  const podeCompartilhar = typeof navigator.share === "function";
  const web = linkWhatsapp(numero, texto);
  const copiar = async () => {
    try { await navigator.clipboard.writeText(texto); toast.success("Mensagem copiada"); }
    catch { toast.error("Não foi possível copiar. Selecione a mensagem acima e copie manualmente."); }
  };
  const compartilhar = async () => {
    try { await navigator.share({ text: texto }); }
    catch (erro) {
      if (erro instanceof Error && erro.name === "AbortError") return;
      toast.error("Não foi possível compartilhar. Copie a mensagem ou abra pelo link.");
    }
  };
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Enviar mensagem"
      description={android ? "Escolha o aplicativo. Se não estiver disponível, o aparelho poderá abrir pelo link padrão." : "O link abre o aplicativo definido no aparelho. Compartilhar permite escolher entre os aplicativos disponíveis."}
      footer={<Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>Fechar</Button>}>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="whatsapp-despacho-mensagem">Mensagem</Label>
          <Textarea id="whatsapp-despacho-mensagem" rows={5} value={texto} onChange={(e) => setTexto(e.target.value)} />
        </div>
        {android && web && (
          <div className="grid grid-cols-2 gap-2">
            {(["normal", "business"] as const).map((destino) => {
              const href = linkWhatsapp(numero, texto, destino);
              return href ? <Button key={destino} asChild variant="outline" className="min-h-12" disabled={!texto.trim()}>
                <a href={href}><MessageCircle className="mr-2 h-4 w-4 shrink-0" />{destino === "normal" ? "WhatsApp" : "Business"}</a>
              </Button> : null;
            })}
          </div>
        )}
        <div className="grid gap-2">
          {web && <Button asChild variant={android ? "outline" : "default"} className="min-h-11"><a href={web} target="_blank" rel="noopener noreferrer"><MessageCircle className="mr-2 h-4 w-4" />Abrir pelo link padrão</a></Button>}
          {podeCompartilhar && <Button variant="outline" className="min-h-11" disabled={!texto.trim()} onClick={compartilhar}><Share2 className="mr-2 h-4 w-4" />Compartilhar</Button>}
          <Button variant="outline" className="min-h-11" disabled={!texto.trim()} onClick={copiar}><Copy className="mr-2 h-4 w-4" />Copiar mensagem</Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}