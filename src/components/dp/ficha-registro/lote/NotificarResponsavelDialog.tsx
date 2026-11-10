import { useEffect, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNotificarLoteFicha, useResponsaveisLote } from "@/hooks/useDpFichaImportacao";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  importacaoId: string;
  empresaNome: string;
  pendentes: number;
}

/** Exclusivo da equipe Aveto: passa o lote ao responsável da empresa, em nome da Aveto 360. */
export function NotificarResponsavelDialog({ open, onOpenChange, importacaoId, empresaNome, pendentes }: Props) {
  const { data: responsaveis = [], isLoading, error } = useResponsaveisLote(importacaoId, open);
  const [userId, setUserId] = useState<string | null>(null);
  const notificar = useNotificarLoteFicha();

  useEffect(() => {
    if (!userId && responsaveis[0]) setUserId(responsaveis[0].user_id);
  }, [responsaveis, userId]);

  const escolhido = responsaveis.find((r) => r.user_id === userId) ?? null;

  const enviar = () => {
    if (!userId) return;
    notificar.mutate(
      { importacaoId, userId },
      {
        onSuccess: () => {
          toast.success(`Lote salvo e ${escolhido?.nome ?? "o responsável"} foi notificado(a).`);
          onOpenChange(false);
        },
        onError: (e) => toast.error((e as Error).message),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Passar o lote ao responsável</DialogTitle>
          <DialogDescription>
            Cargos e setores já estão salvos. Quem receber continua a conferência nesta mesma tela.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-sm">Quem continua</Label>
            {isLoading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>
            ) : error ? (
              <p className="text-sm text-destructive">Não foi possível listar os responsáveis da empresa.</p>
            ) : responsaveis.length === 0 ? (
              <p className="text-sm text-muted-foreground">A empresa ainda não tem dono ou administrador com acesso ativo.</p>
            ) : (
              <Select value={userId ?? undefined} onValueChange={setUserId}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Escolha a pessoa" /></SelectTrigger>
                <SelectContent>
                  {responsaveis.map((r) => (
                    <SelectItem key={r.user_id} value={r.user_id}>
                      {r.nome}{r.perfil === "owner" ? " · Dono" : " · Admin"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {escolhido && <p className="text-xs text-muted-foreground">{escolhido.email}</p>}
          </div>

          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <p className="font-medium">Fichas de registro prontas para conferência</p>
            <p className="text-muted-foreground">
              A equipe da Aveto 360 parametrizou {pendentes} {pendentes === 1 ? "ficha de registro" : "fichas de registro"} de{" "}
              {empresaNome}. Toque para conferir e concluir o cadastro da sua equipe.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!userId || notificar.isPending || pendentes === 0} onClick={enviar}>
            {notificar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Salvar e notificar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
