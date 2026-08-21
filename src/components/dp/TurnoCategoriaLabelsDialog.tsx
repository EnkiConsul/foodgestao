import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Tags, RotateCcw, Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  categoriasPadrao, codigoCategoriaCustom, type CategoriaTurnoItem,
} from "@/lib/dp/turno-utils";
import { useTurnoCategoriaLabels } from "@/hooks/useTurnoCategoriaLabels";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Categorias de turno sob controle da empresa: renomear, criar, excluir e
 * reordenar. Excluir categoria em uso exige escolher para onde migrar os turnos.
 */
export function TurnoCategoriaLabelsDialog({ open, onOpenChange }: Props) {
  const { categorias, usoPorCategoria, salvar, excluir } = useTurnoCategoriaLabels();
  const [lista, setLista] = useState<CategoriaTurnoItem[]>([]);
  const [aExcluir, setAExcluir] = useState<CategoriaTurnoItem | null>(null);
  const [destino, setDestino] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    setLista(categorias);
    setAExcluir(null);
    setDestino("");
  }, [open, categorias]);

  const renomear = (codigo: string, nome: string) =>
    setLista((l) => l.map((c) => (c.codigo === codigo ? { ...c, nome } : c)));

  const mover = (index: number, delta: number) =>
    setLista((l) => {
      const alvo = index + delta;
      if (alvo < 0 || alvo >= l.length) return l;
      const copia = [...l];
      [copia[index], copia[alvo]] = [copia[alvo], copia[index]];
      return copia.map((c, i) => ({ ...c, ordem: i }));
    });

  const adicionar = () =>
    setLista((l) => [
      ...l,
      { codigo: codigoCategoriaCustom(`nova ${l.length + 1}`), nome: "", ordem: l.length },
    ]);

  const pedirExclusao = (c: CategoriaTurnoItem) => {
    const emUso = usoPorCategoria[c.codigo] ?? 0;
    if (emUso === 0) {
      setLista((l) => l.filter((x) => x.codigo !== c.codigo));
      return;
    }
    setAExcluir(c);
    setDestino(lista.find((x) => x.codigo !== c.codigo)?.codigo ?? "");
  };

  const confirmarExclusao = async () => {
    if (!aExcluir) return;
    if (!destino) {
      toast.error("Escolha a categoria de destino dos turnos.");
      return;
    }
    try {
      await excluir.mutateAsync({ codigo: aExcluir.codigo, destino, lista });
      toast.success("Categoria excluída e turnos migrados.");
      setAExcluir(null);
    } catch (e) {
      toast.error("Não foi possível excluir a categoria", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const gravar = async () => {
    if (lista.some((c) => !c.nome.trim())) {
      toast.error("Dê um nome a todas as categorias.");
      return;
    }
    try {
      await salvar.mutateAsync(lista);
      toast.success("Categorias atualizadas");
      onOpenChange(false);
    } catch (e) {
      toast.error("Não foi possível salvar as categorias", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] w-full max-w-md flex-col gap-0 overflow-hidden p-0 max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:rounded-none">
        <DialogHeader className="shrink-0 border-b px-4 py-3 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Tags className="h-5 w-5 text-primary" aria-hidden="true" />
            Categorias de turno
          </DialogTitle>
          <DialogDescription className="text-xs">
            Use a linguagem da sua operação: renomeie, crie ou remova o que não usa.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4">
          {aExcluir ? (
            <div className="space-y-3 rounded-xl border border-dashed p-3">
              <p className="text-sm">
                <strong>{aExcluir.nome}</strong> está em {usoPorCategoria[aExcluir.codigo]} turno(s).
                Escolha para qual categoria eles vão.
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs">Migrar turnos para</Label>
                <Select value={destino} onValueChange={setDestino}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {lista.filter((c) => c.codigo !== aExcluir.codigo && c.nome.trim()).map((c) => (
                      <SelectItem key={c.codigo} value={c.codigo}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="h-11 flex-1" onClick={() => setAExcluir(null)}>
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  className="h-11 flex-1"
                  onClick={confirmarExclusao}
                  disabled={excluir.isPending}
                >
                  {excluir.isPending ? "Excluindo..." : "Migrar e excluir"}
                </Button>
              </div>
            </div>
          ) : (
            <>
              {lista.map((c, i) => (
                <div key={c.codigo} className="flex items-center gap-1.5">
                  <Input
                    value={c.nome}
                    placeholder="Nome da categoria"
                    aria-label={`Nome da categoria ${i + 1}`}
                    onChange={(e) => renomear(c.codigo, e.target.value)}
                    className="h-11"
                  />
                  <div className="flex shrink-0">
                    <Button
                      type="button" variant="ghost" size="icon" className="h-10 w-9"
                      aria-label="Subir categoria" disabled={i === 0} onClick={() => mover(i, -1)}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button" variant="ghost" size="icon" className="h-10 w-9"
                      aria-label="Descer categoria" disabled={i === lista.length - 1}
                      onClick={() => mover(i, 1)}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button" variant="ghost" size="icon" className="h-10 w-9 text-destructive"
                      aria-label={`Excluir categoria ${c.nome || i + 1}`}
                      onClick={() => pedirExclusao(c)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}

              <Button type="button" variant="outline" className="h-11 w-full" onClick={adicionar}>
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                Nova categoria
              </Button>
            </>
          )}
        </div>

        {!aExcluir && (
          <DialogFooter className="shrink-0 flex-col gap-2 border-t p-4 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              className="h-11"
              onClick={() => setLista(categoriasPadrao())}
            >
              <RotateCcw className="mr-1.5 h-4 w-4" /> Restaurar padrão
            </Button>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button className="h-11" onClick={gravar} disabled={salvar.isPending}>
                {salvar.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
