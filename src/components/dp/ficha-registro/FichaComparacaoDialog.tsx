import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { compararComCadastro } from "@/lib/dp/ficha-registro/payload";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  colaboradorId: string;
  dados: Record<string, unknown>;
  /** Recebe as colunas escolhidas para serem atualizadas. */
  onConfirmar: (colunas: string[]) => void;
  aplicando?: boolean;
}

/** Comparação lado a lado antes de completar um cadastro que já existe. */
export function FichaComparacaoDialog({ open, onOpenChange, colaboradorId, dados, onConfirmar, aplicando }: Props) {
  const { data: atual, isLoading } = useQuery({
    queryKey: ["dp_colaborador_comparacao", colaboradorId],
    enabled: open && !!colaboradorId,
    queryFn: async () => {
      const { data, error } = await supabase.from("dp_colaboradores").select("*").eq("id", colaboradorId).maybeSingle();
      if (error) throw error;
      return (data ?? null) as Record<string, unknown> | null;
    },
  });

  const diferencas = useMemo(() => compararComCadastro(dados, atual ?? null), [dados, atual]);
  const [escolhidos, setEscolhidos] = useState<string[]>([]);

  useEffect(() => {
    // Por padrão marca só o que completa campos vazios — sobrescrever é decisão explícita.
    setEscolhidos(diferencas.filter((d) => d.apenasCompleta).map((d) => d.coluna));
  }, [diferencas]);

  const alternar = (coluna: string) =>
    setEscolhidos((prev) => (prev.includes(coluna) ? prev.filter((c) => c !== coluna) : [...prev, coluna]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden p-0">
        <DialogHeader className="p-6 pb-3">
          <DialogTitle>Comparar com o cadastro atual</DialogTitle>
          <DialogDescription>
            Escolha o que a ficha deve alterar. O que não for marcado permanece como está hoje.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] overflow-y-auto px-6">
          {isLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando cadastro…
            </div>
          ) : diferencas.length === 0 ? (
            <p className="py-8 text-sm text-muted-foreground">
              A ficha não traz nenhuma informação diferente do cadastro atual.
            </p>
          ) : (
            <div className="space-y-2 pb-2">
              {diferencas.map((d) => (
                <label
                  key={d.coluna}
                  className="flex items-start gap-3 rounded-lg border p-3 text-sm hover:bg-muted/40"
                >
                  <Checkbox
                    checked={escolhidos.includes(d.coluna)}
                    onCheckedChange={() => alternar(d.coluna)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{d.label}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded bg-muted px-2 py-0.5 text-muted-foreground">
                        {d.atual || "vazio hoje"}
                      </span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                      <span className="rounded bg-primary/10 px-2 py-0.5 font-medium text-primary">{d.novo}</span>
                      {!d.apenasCompleta && (
                        <span className="text-amber-600 dark:text-amber-400">substitui o valor atual</span>
                      )}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="border-t p-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={aplicando || isLoading} onClick={() => onConfirmar(escolhidos)}>
            {aplicando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Atualizar cadastro
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
