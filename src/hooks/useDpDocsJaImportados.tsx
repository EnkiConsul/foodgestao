import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { competenciaRange, tiposEquivalentes } from "@/lib/dp/bulk-coverage";
import { fetchAllPages } from "@/lib/supabase/fetchAllPages";

/**
 * Colaboradores que JÁ possuem o documento salvo (mesmo tipo e competência),
 * independentemente do lote em revisão. Evita acusar falta de quem foi
 * importado em outra remessa.
 */
export function useDpDocsJaImportados(competencia: string | null, tipo: string | null) {
  const { selectedCompanyId } = useCompanyContext();
  const tipos = tiposEquivalentes(tipo);
  const range = competencia ? competenciaRange(competencia) : null;

  const query = useQuery({
    queryKey: ["dp_docs_ja_importados", selectedCompanyId, competencia, tipos.join(",")],
    enabled: !!selectedCompanyId && !!range && tipos.length > 0,
    queryFn: async (): Promise<string[]> => {
      // Leitura em lotes com ordem estável: a conferência não perde documentos.
      const data = await fetchAllPages<{ colaborador_id: string | null }>((from, to) =>
        supabase
          .from("dp_documentos")
          .select("colaborador_id, id")
          .eq("company_id", selectedCompanyId!)
          .in("tipo", tipos as never)
          .gte("referencia_data", range!.inicio)
          .lte("referencia_data", range!.fim)
          .order("id", { ascending: true })
          .range(from, to) as any,
      );
      return (data ?? [])
        .map((d) => (d as { colaborador_id: string | null }).colaborador_id)
        .filter((v): v is string => !!v);
    },
  });

  return new Set(query.data ?? []);
}
