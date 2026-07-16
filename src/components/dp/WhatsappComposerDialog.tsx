import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDpModelosMensagem, applyModeloVars } from "@/hooks/useDpModelosMensagem";
import { MessageSquare } from "lucide-react";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onClose: () => void;
  colaboradorId: string | null;
  nome: string;
  contexto?: Record<string, string>;
};

export function WhatsappComposerDialog({ open, onClose, colaboradorId, nome, contexto = {} }: Props) {
  const { data: modelos = [] } = useDpModelosMensagem("whatsapp");
  const [modeloId, setModeloId] = useState<string>("");
  const [texto, setTexto] = useState("");

  const { data: colab } = useQuery({
    queryKey: ["dp_colab_whatsapp", colaboradorId],
    enabled: !!colaboradorId && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("dp_colaboradores")
        .select("whatsapp, telefone, nome")
        .eq("id", colaboradorId!)
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (!open) { setModeloId(""); setTexto(""); }
  }, [open]);

  useEffect(() => {
    if (!modeloId) return;
    const m = modelos.find((x) => x.id === modeloId);
    if (m) setTexto(applyModeloVars(m.corpo, { ...contexto, nome }));
  }, [modeloId, modelos, contexto, nome]);

  const phone = (colab?.whatsapp || colab?.telefone || "").replace(/\D+/g, "");

  const send = () => {
    if (!phone) { toast.error("Colaborador sem telefone/WhatsApp cadastrado"); return; }
    if (!texto.trim()) { toast.error("Escreva uma mensagem"); return; }
    const num = phone.length <= 11 ? `55${phone}` : phone;
    const url = `https://wa.me/${num}?text=${encodeURIComponent(texto)}`;
    window.open(url, "_blank", "noopener");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            Enviar WhatsApp — {nome}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Modelo</Label>
            <Select value={modeloId} onValueChange={setModeloId}>
              <SelectTrigger><SelectValue placeholder={modelos.length ? "Escolha um modelo…" : "Nenhum modelo cadastrado"} /></SelectTrigger>
              <SelectContent>
                {modelos.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.titulo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Mensagem</Label>
            <Textarea rows={6} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Digite ou escolha um modelo…" />
          </div>
          <p className="text-[11px] text-muted-foreground">
            {phone ? `Será aberto WhatsApp Web para ${phone}` : "Sem número de WhatsApp no cadastro"}
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={send} disabled={!phone || !texto.trim()}>Abrir WhatsApp</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
