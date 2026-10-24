import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
      <DialogContent className="flex h-[100dvh] w-full min-w-0 max-w-full flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-auto sm:max-h-[92dvh] sm:max-w-md sm:rounded-lg">
        <DialogHeader className="shrink-0 border-b p-4 pr-12 text-left">
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

        <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 [&_input]:min-w-0 [&_input]:max-w-full [&_input]:min-h-11 [&_input]:text-base [&_textarea]:text-base [&_button[role=combobox]]:min-h-11 [&_button[role=combobox]]:min-w-0 [&_button[role=combobox]>span]:truncate">
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
                  <Button
                    key={s}
                    type="button"
                    variant="outline"
                    className="h-auto min-h-11 max-w-full whitespace-normal break-words"
                    onClick={() => setNome(s)}
                  >
                    {s}
                  </Button>
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
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
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

        <DialogFooter className="shrink-0 flex-row gap-2 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))] [&>button]:min-h-11 [&>button]:flex-1 sm:[&>button]:flex-none">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={upsert.isPending}>
            {setor ? "Salvar" : "Criar setor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
