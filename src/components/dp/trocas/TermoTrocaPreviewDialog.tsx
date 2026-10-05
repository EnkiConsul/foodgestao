import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import type { DpTrocaRow } from "@/hooks/useDpTrocas";
import { emitirTermoTrocaPdf, termoTrocaHtml } from "@/lib/dp/troca-certificado";

type Props = {
  troca: DpTrocaRow | null;
  empresa: { nome: string; cnpj?: string | null };
  onOpenChange: (open: boolean) => void;
};

/** Mostra o Termo de Troca na tela; a impressão só acontece quando o usuário pede. */
export function TermoTrocaPreviewDialog({ troca, empresa, onOpenChange }: Props) {
  // CPF é sigiloso: buscado por rotina segura só quando o termo é aberto.
  const cpfs = useQuery({
    queryKey: ["dp_troca_termo_cpfs", troca?.id],
    enabled: !!troca?.id,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>)(
        "dp_troca_termo_cpfs",
        { _troca_id: troca!.id },
      );
      if (error) throw new Error(error.message);
      const row = (Array.isArray(data) ? data[0] : data) as
        | { solicitante_cpf: string | null; destino_cpf: string | null }
        | null;
      return row ?? { solicitante_cpf: null, destino_cpf: null };
    },
  });

  const trocaComCpf = useMemo<DpTrocaRow | null>(() => {
    if (!troca) return null;
    const c = cpfs.data;
    return {
      ...troca,
      solicitante: troca.solicitante ? { ...troca.solicitante, cpf: c?.solicitante_cpf ?? null } : null,
      destino: troca.destino ? { ...troca.destino, cpf: c?.destino_cpf ?? null } : null,
    };
  }, [troca, cpfs.data]);

  const html = useMemo(
    () => (trocaComCpf ? termoTrocaHtml(trocaComCpf, empresa) : ""),
    [trocaComCpf, empresa],
  );
  const [emitindo, setEmitindo] = useState(false);
  const emitir = async () => {
    if (!trocaComCpf) return;
    const janela = window.open("", "_blank");
    setEmitindo(true);
    try {
      await emitirTermoTrocaPdf(trocaComCpf, empresa, janela);
    } catch {
      janela?.close();
      toast.error("Não foi possível gerar o PDF do termo. Tente novamente; se continuar, recarregue a página.");
    } finally {
      setEmitindo(false);
    }
  };
  return (
    <Dialog open={!!troca} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90vh] max-w-3xl flex-col gap-3 p-4">
        <DialogHeader>
          <DialogTitle>Termo de Troca de Folga</DialogTitle>
        </DialogHeader>
        {cpfs.isError && (
          <p className="rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
            Não conseguimos carregar o CPF dos colaboradores agora, então o termo mostra "Não informado".
            Feche e abra o termo de novo; se continuar, confira se o CPF está no cadastro de cada um.
          </p>
        )}
        <div className="flex-1 overflow-hidden rounded-xl border border-border bg-background">
          {troca && cpfs.isLoading ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            troca && (
              <iframe
                title="Pré-visualização do Termo de Troca"
                srcDoc={html}
                sandbox=""
                className="h-full w-full bg-white"
              />
            )
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button className="min-h-11" disabled={emitindo || cpfs.isLoading} onClick={emitir}>
            <FileDown className="mr-1 h-4 w-4" /> {emitindo ? "Gerando…" : "Emitir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
