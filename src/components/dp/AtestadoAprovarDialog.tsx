import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { textoErroAssiduidade } from "@/lib/dp/assiduidade-risco";
import {
  AssiduidadePergunta,
  validarDecisaoAssiduidade,
  type DecisaoAssiduidade,
} from "@/components/dp/AssiduidadePergunta";
import { toast } from "sonner";

interface Props {
  solicitacao: { id: string; colaborador_id: string; nome?: string | null } | null;
  saving?: boolean;
  onOpenChange: (open: boolean) => void;
  /** Aprovação em si; chamada depois de gravar a decisão de assiduidade. */
  onAprovar: () => void;
}

/** Aprovação de atestado com a pergunta do prêmio de assiduidade (só se houver prêmio). */
export function AtestadoAprovarDialog({ solicitacao, saving, onOpenChange, onAprovar }: Props) {
  const [decisao, setDecisao] = useState<DecisaoAssiduidade | null>(null);
  const [gravando, setGravando] = useState(false);

  const confirmar = async () => {
    if (!solicitacao) return;
    try {
      const d = validarDecisaoAssiduidade("atestado", decisao);
      setGravando(true);
      if (d) {
        const { error } = await supabase.rpc("dp_solicitacao_assiduidade_definir", {
          p_id: solicitacao.id,
          p_perde: d.perde,
          p_justificativa: d.justificativa || null,
        });
        if (error) throw new Error(textoErroAssiduidade(error.message));
      }
      onAprovar();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGravando(false);
    }
  };

  return (
    <Dialog open={!!solicitacao} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Aprovar Atestado</DialogTitle>
          <DialogDescription>{solicitacao?.nome ?? "Colaborador"}</DialogDescription>
        </DialogHeader>
        <AssiduidadePergunta
          colaboradorId={solicitacao?.colaborador_id}
          evento="atestado"
          value={decisao}
          onChange={setDecisao}
        />
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Voltar
          </Button>
          <Button disabled={saving || gravando} onClick={confirmar}>
            Aprovar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
