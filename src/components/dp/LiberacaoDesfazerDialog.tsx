import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const ERROS: Record<string, string> = {
  LIBERACAO_JUSTIFICATIVA: "Escreva uma justificativa com pelo menos 10 caracteres.",
  LIBERACAO_JA_ENCERRADA: "Esta liberação já foi encerrada.",
  REGRAS_SEM_PERMISSAO: "Você não tem permissão para esta ação.",
};

interface Props {
  solicitacao: { id: string; nome?: string | null } | null;
  onOpenChange: (open: boolean) => void;
}

/** Recusar/desfazer Liberação do Gestor: o gestor sempre diz se a pessoa trabalhou ou faltou. */
export function LiberacaoDesfazerDialog({ solicitacao, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [opcao, setOpcao] = useState<"trabalhou" | "faltou" | "">("");
  const [just, setJust] = useState("");
  useEffect(() => { setOpcao(""); setJust(""); }, [solicitacao?.id]);

  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("dp_liberacao_desfazer", {
        p_id: solicitacao!.id,
        p_trabalhou: opcao === "trabalhou",
        p_justificativa: just.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(opcao === "trabalhou" ? "Liberação cancelada, dia trabalhado normal." : "Liberação convertida em falta.");
      qc.invalidateQueries({ queryKey: ["dp_solicitacoes"] });
      qc.invalidateQueries({ queryKey: ["dp_ocorrencias"] });
      onOpenChange(false);
    },
    onError: (e: Error) => {
      const k = Object.keys(ERROS).find((c) => e.message.includes(c));
      toast.error(k ? ERROS[k] : "Não foi possível concluir. Tente novamente.");
    },
  });

  return (
    <Dialog open={!!solicitacao} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Desfazer Liberação do Gestor</DialogTitle>
          <DialogDescription>{solicitacao?.nome ?? "Colaborador"} — o que aconteceu no dia?</DialogDescription>
        </DialogHeader>
        <RadioGroup value={opcao} onValueChange={(v) => setOpcao(v as "trabalhou" | "faltou")} className="space-y-2">
          <label className="flex items-start gap-2 rounded-md border p-3 cursor-pointer">
            <RadioGroupItem value="trabalhou" className="mt-0.5" />
            <span className="text-sm"><b>Trabalhou normalmente</b><br />
              <span className="text-muted-foreground">Só cancela a liberação. Sem impacto no ponto nem na assiduidade.</span></span>
          </label>
          <label className="flex items-start gap-2 rounded-md border p-3 cursor-pointer">
            <RadioGroupItem value="faltou" className="mt-0.5" />
            <span className="text-sm"><b>Se ausentou sem autorização</b><br />
              <span className="text-muted-foreground">Vira Falta. Se tiver prêmio de assiduidade, por padrão perde; você decide em Ocorrências.</span></span>
          </label>
        </RadioGroup>
        <div className="space-y-1.5">
          <Label>Justificativa</Label>
          <Textarea rows={3} value={just} onChange={(e) => setJust(e.target.value)} placeholder="Ex: Colaborador desistiu da saída e cumpriu a jornada." />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Voltar</Button>
          <Button disabled={!opcao || just.trim().length < 10 || salvar.isPending} onClick={() => salvar.mutate()}>
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const ehLiberacaoGestor = (motivo?: string | null) => (motivo ?? "").startsWith("Liberação do Gestor");
