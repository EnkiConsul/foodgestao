import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ORIGEM_SETOR_LABEL, SETOR_NAO_DEFINIDO_LABEL, traduzirErroSetor, type OrigemSetor,
} from "@/lib/dp/setor-previsto";

const USAR_PADRAO = "__usar_padrao__";

export interface AlterarSetorAlvo {
  colaborador_id: string;
  nome: string;
  data: string;
  /** Setor efetivo hoje nesta data. */
  setor_id: string | null;
  setor_nome: string | null;
  origem: OrigemSetor;
  /** Setor habitual do cadastro. */
  setor_habitual_nome: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  alvo: AlterarSetorAlvo | null;
  setores: { id: string; nome: string }[];
  salvando?: boolean;
  onConfirmar: (input: {
    colaborador_id: string;
    data: string;
    acao: "USAR_PADRAO" | "DEFINIR_SETOR";
    setor_id: string | null;
    motivo: string | null;
  }) => Promise<void>;
  /** Abre o cadastro do colaborador para trocar a área padrão. */
  onEditarSetorHabitual?: (colaboradorId: string) => void;
}

const dataLonga = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "long", day: "2-digit", month: "long",
  });

/**
 * Troca o setor de uma pessoa somente na data escolhida. Não altera o setor
 * habitual do cadastro nem o horário, turno ou folga daquele dia.
 */
export function AlterarSetorDiaDialog({
  open, onOpenChange, alvo, setores, salvando, onConfirmar, onEditarSetorHabitual,
}: Props) {
  const [escolha, setEscolha] = useState<string>(USAR_PADRAO);
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    if (!open || !alvo) return;
    setEscolha(alvo.origem === "escala" && alvo.setor_id ? alvo.setor_id : USAR_PADRAO);
    setMotivo("");
  }, [open, alvo]);

  if (!alvo) return null;

  const confirmar = async () => {
    try {
      await onConfirmar({
        colaborador_id: alvo.colaborador_id,
        data: alvo.data,
        acao: escolha === USAR_PADRAO ? "USAR_PADRAO" : "DEFINIR_SETOR",
        setor_id: escolha === USAR_PADRAO ? null : escolha,
        motivo: motivo.trim() || null,
      });
      toast.success(
        escolha === USAR_PADRAO
          ? "O dia voltou a usar o setor padrão da pessoa."
          : "Setor deste dia alterado.",
      );
      onOpenChange(false);
    } catch (e) {
      toast.error(traduzirErroSetor(e as { message?: string }));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Alterar setor deste dia</DialogTitle>
          <DialogDescription>
            Vale somente para {dataLonga(alvo.data)}. A área padrão do cadastro não muda.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border bg-muted/30 p-3 text-xs">
            <p className="text-sm font-medium text-foreground">{alvo.nome}</p>
            <p className="text-muted-foreground">
              Área habitual: {alvo.setor_habitual_nome ?? SETOR_NAO_DEFINIDO_LABEL}
            </p>
            <p className="text-muted-foreground">
              Setor nesta data: {alvo.setor_nome ?? SETOR_NAO_DEFINIDO_LABEL}
              {" "}({ORIGEM_SETOR_LABEL[alvo.origem]})
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="novo-setor-dia">Setor nesta data</Label>
            <Select value={escolha} onValueChange={setEscolha}>
              <SelectTrigger id="novo-setor-dia">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={USAR_PADRAO}>Usar setor padrão da pessoa</SelectItem>
                {setores.map((st) => (
                  <SelectItem key={st.id} value={st.id}>{st.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="motivo-setor-dia">Motivo (opcional)</Label>
            <Textarea
              id="motivo-setor-dia"
              rows={2}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: cobertura na cozinha neste dia"
            />
          </div>

          {onEditarSetorHabitual && (
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-xs"
              onClick={() => onEditarSetorHabitual(alvo.colaborador_id)}
            >
              Editar setor habitual do colaborador
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={confirmar} disabled={salvando}>
            {escolha === USAR_PADRAO ? "Usar setor padrão" : "Alterar setor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
