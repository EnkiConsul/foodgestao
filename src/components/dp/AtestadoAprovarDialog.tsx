import { useEffect, useRef, useState } from "react";
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
import { textoErroAssiduidade, type EventoAssiduidade } from "@/lib/dp/assiduidade-risco";
import {
  AssiduidadePergunta,
  usePremioAssiduidade,
  validarDecisaoAssiduidade,
  type DecisaoAssiduidade,
} from "@/components/dp/AssiduidadePergunta";
import { toast } from "sonner";

interface Props {
  solicitacao: { id: string; colaborador_id: string; nome?: string | null; evento?: EventoAssiduidade } | null;
  saving?: boolean;
  onOpenChange: (open: boolean) => void;
  /** Aprovação em si; chamada depois de gravar a decisão de assiduidade. */
  onAprovar: () => void;
}

/**
 * Aprovação de atestado/licença com a pergunta do prêmio de assiduidade.
 * Sem prêmio aplicável, aprova direto (sem abrir janela vazia).
 */
export function AtestadoAprovarDialog({ solicitacao, saving, onOpenChange, onAprovar }: Props) {
  const [decisao, setDecisao] = useState<DecisaoAssiduidade | null>(null);
  const [gravando, setGravando] = useState(false);
  const evento: EventoAssiduidade = solicitacao?.evento ?? "atestado";
  const premio = usePremioAssiduidade(solicitacao?.colaborador_id);
  const aprovadoDireto = useRef<string | null>(null);

  useEffect(() => {
    if (!solicitacao) { aprovadoDireto.current = null; return; }
    if (premio.isSuccess && !premio.data && aprovadoDireto.current !== solicitacao.id) {
      aprovadoDireto.current = solicitacao.id;
      onAprovar();
    }
  }, [solicitacao, premio.isSuccess, premio.data, onAprovar]);

  const confirmar = async () => {
    if (!solicitacao) return;
    try {
      const d = validarDecisaoAssiduidade(evento, decisao);
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

  const mostrar = !!solicitacao && premio.isSuccess && !!premio.data;

  return (
    <Dialog open={mostrar} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{evento === "licenca" ? "Aprovar Licença" : "Aprovar Atestado"}</DialogTitle>
          <DialogDescription>{solicitacao?.nome ?? "Colaborador"}</DialogDescription>
        </DialogHeader>
        <AssiduidadePergunta
          colaboradorId={solicitacao?.colaborador_id}
          evento={evento}
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
