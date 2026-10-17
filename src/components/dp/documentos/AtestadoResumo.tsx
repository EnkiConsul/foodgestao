import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const br = (d?: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");

/** Resumo enxuto do atestado (apenas o período) exibido junto ao anexo. */
export function AtestadoResumo({ rowId, filePath }: { rowId: string; filePath?: string | null }) {
  const q = useQuery({
    queryKey: ["atestado_resumo", rowId, filePath],
    queryFn: async () => {
      let qb = supabase
        .from("dp_solicitacoes")
        .select("id, data_alvo, data_fim, created_at")
        .eq("tipo", "atestado")
        .is("removido_em", null);
      if (rowId.startsWith("sol:")) qb = qb.eq("id", rowId.slice(4));
      else if (filePath) qb = qb.eq("arquivo_path", filePath);
      else return null;
      const { data } = await qb.limit(1).maybeSingle();
      return data;
    },
  });
  const s = q.data;
  if (!s) return null;
  const ini = s.data_alvo ?? s.created_at;
  const fim = s.data_fim ?? s.data_alvo;
  const dias = ini && fim ? Math.round((Date.parse(fim.slice(0, 10)) - Date.parse(ini.slice(0, 10))) / 86400000) + 1 : null;
  return (
    <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs sm:text-sm">
      <b>Período:</b> {br(ini)}
      {fim && fim !== ini ? ` a ${br(fim)}` : ""}
      {dias ? ` (${dias} ${dias === 1 ? "dia" : "dias"})` : ""}
    </div>
  );
}
