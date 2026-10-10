/** Portal: a cada 6 meses o colaborador confirma o WhatsApp e os contatos de emergência. */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { maskPhone } from "@/lib/phone";
import { notifyError } from "@/lib/notifyError";
import { confirmacaoVencida, contatosValidos, type ContatoEmergencia } from "@/lib/dp/contatosEmergencia";
import { ContatosEmergenciaEditor, limparContatos } from "./ContatosEmergenciaEditor";

const ADIAR = "dp.contatos.adiado_ate";

export function ConfirmarContatosPortal() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["dp-portal-meus-contatos"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("dp_portal_meus_contatos");
      if (error) throw error;
      return data as null | {
        whatsapp: string | null; contatos_emergencia: ContatoEmergencia[];
        contatos_confirmados_em: string | null; contatos_solicitado_em: string | null;
      };
    },
    staleTime: 10 * 60_000,
  });
  const [aberto, setAberto] = useState(false);
  const [whats, setWhats] = useState("");
  const [lista, setLista] = useState<ContatoEmergencia[]>([]);
  const [mudou, setMudou] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!data) return;
    const adiado = Number(sessionStorage.getItem(ADIAR) ?? 0);
    if (confirmacaoVencida(data.contatos_confirmados_em, data.contatos_solicitado_em) && Date.now() > adiado) {
      setWhats(String(data.whatsapp ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, ""));
      setLista(Array.isArray(data.contatos_emergencia) ? data.contatos_emergencia : []);
      setMudou(false);
      setAberto(true);
    }
  }, [data]);

  if (!data) return null;
  const limpos = limparContatos(lista);
  const valido = whats.replace(/\D/g, "").length >= 10 && contatosValidos(limpos);

  const confirmar = async () => {
    setSalvando(true);
    try {
      const { error } = await (supabase as any).rpc("dp_portal_confirmar_contatos", { _whatsapp: whats, _contatos: limpos });
      if (error) throw error;
      toast.success("Obrigado! Seus contatos foram confirmados.");
      setAberto(false);
      qc.invalidateQueries({ queryKey: ["dp-portal-meus-contatos"] });
    } catch (e) {
      notifyError(e as Error, { surface: "Portal", action: "confirmar seus contatos" });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(v) => {
      if (!v) sessionStorage.setItem(ADIAR, String(Date.now() + 4 * 3600_000));
      setAberto(v);
    }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Atualização Semestral de Contatos</DialogTitle>
          <DialogDescription>
            Confira se o seu WhatsApp e os seus contatos de emergência continuam os mesmos.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Seu WhatsApp</Label>
            <Input value={maskPhone(whats)} inputMode="tel"
              onChange={(e) => { setWhats(e.target.value.replace(/\D/g, "").slice(0, 11)); setMudou(true); }} />
          </div>
          <ContatosEmergenciaEditor value={lista} onChange={(v) => { setLista(v); setMudou(true); }} />
        </div>
        <DialogFooter>
          <Button className="w-full sm:w-auto" disabled={!valido || salvando} onClick={confirmar}>
            {salvando && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {mudou ? "Salvar e Confirmar" : "Confirmar que Estão Corretos"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
