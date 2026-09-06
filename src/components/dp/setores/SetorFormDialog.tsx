import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useDpSetores, useUpsertDpSetor, type DpSetor } from "@/hooks/useDpSetores";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Unidade a que o setor pertence — nunca é perguntada de novo. */
  unidadeId: string;
  unidadeNome?: string;
  /** Setor em edição; ausente = novo setor. */
  setor?: DpSetor | null;
  nomeInicial?: string;
  onSaved?: (setor: DpSetor) => void;
}

/**
 * Cadastro de setor/área da unidade. É o mesmo formulário usado na aba Setores
 * da unidade e no cadastro rápido dentro do colaborador.
 */
export function SetorFormDialog({
  open, onOpenChange, unidadeId, unidadeNome, setor, nomeInicial = "", onSaved,
}: Props) {
  const upsert = useUpsertDpSetor();
  const { sugestoes } = useDpSetores(unidadeId);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [ativo, setAtivo] = useState(true);

  useEffect(() => {
    if (!open) return;
    setNome(setor?.nome ?? nomeInicial);
    setDescricao(setor?.descricao ?? "");
    setAtivo(setor?.ativo ?? true);
  }, [open, setor?.id, setor?.nome, setor?.descricao, setor?.ativo, nomeInicial]);

  const salvar = async () => {
    if (!nome.trim()) { toast.error("Informe o nome do setor"); return; }
    try {
      const salvo = await upsert.mutateAsync({
        id: setor?.id,
        unidade_id: unidadeId,
        nome,
        descricao,
        ativo,
      });
      toast.success(setor ? "Setor atualizado" : "Setor criado");
      onSaved?.(salvo);
      onOpenChange(false);
    } catch (e) {
      toast.error("Não foi possível salvar o setor", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 text-primary" aria-hidden="true" />
            {setor ? "Editar setor" : "Novo setor"}
          </DialogTitle>
          <DialogDescription>
            {unidadeNome
              ? `Área operacional da unidade ${unidadeNome}.`
              : "Área operacional da unidade selecionada."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="setor-nome">Nome do setor *</Label>
            <Input
              id="setor-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Salão, Cozinha, Delivery..."
              autoFocus
            />
          </div>

          {!setor && sugestoes.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Setores já usados em outras unidades — toque para aproveitar o nome:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {sugestoes.map((s) => (
                  <Badge
                    key={s}
                    variant="outline"
                    className="cursor-pointer hover:bg-muted"
                    onClick={() => setNome(s)}
                  >
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="setor-descricao">Descrição</Label>
            <Input
              id="setor-descricao"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Opcional"
            />
          </div>

          {setor && (
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label htmlFor="setor-ativo">Setor ativo</Label>
                <p className="text-xs text-muted-foreground">
                  Setores inativos não aparecem para novos vínculos.
                </p>
              </div>
              <Switch id="setor-ativo" checked={ativo} onCheckedChange={setAtivo} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={upsert.isPending}>
            {setor ? "Salvar" : "Criar setor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
