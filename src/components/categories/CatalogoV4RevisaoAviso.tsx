import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/** Aviso discreto: lançamentos antigos em categorias redefinidas no catálogo v4. Nunca bloqueia. */
export function CatalogoV4RevisaoAviso({ companyId }: { companyId: string | null | undefined }) {
  const { data = [] } = useQuery({
    queryKey: ["catalogo-v4-revisao", companyId],
    enabled: !!companyId,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("catalogo_v4_revisao", { _company_id: companyId });
      if (error) return [];
      return (data ?? []) as { template_code: string; categoria: string; lancamentos: number }[];
    },
  });
  if (!data.length) return null;
  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <p>
        Revise se quiser: {data.map((d) => `${d.categoria} (${d.lancamentos})`).join(", ")} tinham lançamentos antes da
        atualização do catálogo. Cupons e chargebacks agora têm Deduções da Receita; encargos administrativos e pró-labore
        têm categorias próprias. Nada foi reclassificado automaticamente.
      </p>
    </div>
  );
}
