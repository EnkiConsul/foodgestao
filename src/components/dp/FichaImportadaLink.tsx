import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const BUCKET = "dp-bulk-import";

interface FichaOrigem {
  id: string;
  arquivo_path: string | null;
  pagina_inicio: number | null;
  pagina_fim: number | null;
  created_at: string | null;
}

/**
 * Mostra o arquivo original da ficha de registro que gerou (ou atualizou)
 * este cadastro, para conferência de qualquer campo.
 */
export function FichaImportadaLink({ colaboradorId }: { colaboradorId?: string | null }) {
  const [abrindo, setAbrindo] = useState(false);

  const { data } = useQuery({
    queryKey: ["dp_ficha_origem", colaboradorId],
    enabled: !!colaboradorId,
    queryFn: async (): Promise<FichaOrigem | null> => {
      const { data, error } = await supabase
        .from("dp_ficha_importacao_itens")
        .select("id, arquivo_path, pagina_inicio, pagina_fim, created_at")
        .or(`colaborador_id.eq.${colaboradorId},colaborador_existente_id.eq.${colaboradorId}`)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return ((data ?? [])[0] as FichaOrigem | undefined) ?? null;
    },
  });

  if (!data?.arquivo_path) return null;

  const paginas =
    data.pagina_inicio && data.pagina_fim && data.pagina_fim !== data.pagina_inicio
      ? `páginas ${data.pagina_inicio} a ${data.pagina_fim}`
      : data.pagina_inicio
        ? `página ${data.pagina_inicio}`
        : null;

  const abrir = async () => {
    setAbrindo(true);
    try {
      const { data: url, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(data.arquivo_path!, 60);
      if (error || !url?.signedUrl) throw error ?? new Error("Arquivo não encontrado");
      window.open(url.signedUrl, "_blank", "noopener");
    } catch {
      toast.error("Não foi possível abrir a ficha enviada.");
    } finally {
      setAbrindo(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-4">
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0">
          <span className="font-semibold">Ficha importada</span>
          <span className="block text-xs text-muted-foreground">
            Cadastro feito a partir de uma ficha enviada em PDF
            {paginas ? ` (${paginas})` : ""}
            {data.created_at
              ? ` · ${new Date(data.created_at).toLocaleDateString("pt-BR")}`
              : ""}
          </span>
        </span>
      </div>
      <Button variant="outline" size="sm" className="h-8" disabled={abrindo} onClick={abrir}>
        <ExternalLink className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
        {abrindo ? "Abrindo…" : "Abrir ficha"}
      </Button>
    </div>
  );
}
