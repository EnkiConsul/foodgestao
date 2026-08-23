import { useQuery } from "@tanstack/react-query";
import { History, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

const ACOES_LABEL: Record<string, string> = {
  excluido: "Excluído",
  substituido: "Substituído",
};

function fmtDataHora(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** Registro de todas as exclusões e substituições de documentos da empresa. */
export function DocEventosDialog(props: {
  open: boolean;
  companyId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const query = useQuery({
    queryKey: ["dp_doc_eventos_empresa", props.companyId],
    enabled: props.open && !!props.companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_documento_eventos")
        .select("id, acao, titulo, tipo, competencia, colaborador_nome, unidade_nome, motivo, autor_id, created_at")
        .eq("company_id", props.companyId!)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;

      const ids = Array.from(new Set((data ?? []).map((e: any) => e.autor_id).filter(Boolean))) as string[];
      const nomes = new Map<string, string>();
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", ids);
        (profs ?? []).forEach((p: any) => nomes.set(p.user_id, p.full_name ?? "Usuário"));
      }
      return { eventos: data ?? [], nomes };
    },
  });

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" /> Registro De Alterações
          </DialogTitle>
          <DialogDescription>
            Documentos excluídos ou substituídos, com autor, data e motivo informado.
          </DialogDescription>
        </DialogHeader>

        {query.isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : (query.data?.eventos ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhuma exclusão ou substituição registrada até agora.
          </p>
        ) : (
          <ul className="space-y-2">
            {(query.data?.eventos ?? []).map((e: any) => (
              <li key={e.id} className="rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={e.acao === "excluido" ? "border-rose-300 text-rose-700" : "border-amber-300 text-amber-700"}
                  >
                    {ACOES_LABEL[e.acao] ?? e.acao}
                  </Badge>
                  <span className="font-semibold break-words">{e.titulo ?? "Documento"}</span>
                  <span className="font-mono text-xs text-muted-foreground">{fmtDataHora(e.created_at)}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {[e.colaborador_nome, e.unidade_nome, e.competencia].filter(Boolean).join(" · ") || "—"}
                  {" · por "}
                  {(e.autor_id ? query.data?.nomes.get(e.autor_id) : null) ?? "Usuário"}
                </div>
                {e.motivo && <p className="mt-1 text-xs">Motivo: {e.motivo}</p>}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
