import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const br = (d?: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");
const STATUS: Record<string, string> = { aprovada: "Aprovado", recusada: "Recusado", pendente: "Pendente", cancelada: "Cancelado" };

/** Resumo do atestado (período, motivo, aprovação, assiduidade) junto ao anexo. */
export function AtestadoResumo({ rowId, filePath, colaboradorId }: { rowId: string; filePath?: string | null; colaboradorId?: string | null }) {
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ["atestado_resumo", rowId, filePath],
    queryFn: async () => {
      let qb = supabase
        .from("dp_solicitacoes")
        .select("id, data_alvo, data_fim, motivo, status, respondido_em, resposta_admin, assiduidade_perde, assiduidade_justificativa, created_at")
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
  const assid = s.assiduidade_perde === true ? "Perde assiduidade" : s.assiduidade_perde === false ? "Mantém assiduidade" : "Assiduidade a decidir";
  return (
    <div className="mt-2 rounded-md border bg-muted/40 p-2 text-xs sm:text-sm space-y-1">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <span><b>Período:</b> {br(ini)}{fim && fim !== ini ? ` a ${br(fim)}` : ""}{dias ? ` (${dias} ${dias === 1 ? "dia" : "dias"})` : ""}</span>
        <span><b>Situação:</b> {STATUS[s.status] ?? s.status}{s.respondido_em ? ` em ${br(s.respondido_em)}` : ""}</span>
        <span><b>{assid}</b>{s.assiduidade_justificativa ? ` — ${s.assiduidade_justificativa}` : ""}</span>
      </div>
      {s.motivo && <div><b>Motivo:</b> {s.motivo}</div>}
      {s.resposta_admin && <div><b>Resposta do gestor:</b> {s.resposta_admin}</div>}
      <Button size="sm" variant="outline" className="mt-1" onClick={() => navigate(`/dp/atestados${colaboradorId ? `?colaborador=${colaboradorId}` : ""}`)}>
        <Info className="h-4 w-4 mr-1" /> Ver detalhes do atestado
      </Button>
    </div>
  );
}
