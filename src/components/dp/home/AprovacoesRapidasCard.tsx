import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Eye, FileCheck2, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Button } from "@/components/ui/button";
import { RecusaDialog } from "@/components/dp/RecusaDialog";
import { salvarChecklistDocumento } from "@/lib/dp/documentos-oficial";
import { abrirDocumento } from "@/lib/documentoArquivo";
import { resolverPendencias } from "@/lib/dp/pendencias-resolver";
import { notifyError } from "@/lib/notifyError";

type Item = {
  id: string;
  validade: string | null;
  colaborador: string;
  requisito: string;
  arquivo: any;
};

const SNOOZE_MS = 12 * 60 * 60 * 1000;
const KEY = "dp_aprovacoes_rapidas_adiado:";

function primeiroNome(n: string) {
  const p = (n || "").trim().split(/\s+/)[0] ?? "";
  return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : "Colaborador";
}

/**
 * Aprovações rápidas: documentos enviados pelo colaborador que só dependem
 * do "Aprovar" do gestor. Resolve direto no início, sem abrir o quadro de pendências.
 */
export function AprovacoesRapidasCard() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const [adiadoAte, setAdiadoAte] = useState(0);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [recusando, setRecusando] = useState<Item | null>(null);

  useEffect(() => {
    if (!selectedCompanyId) return setAdiadoAte(0);
    setAdiadoAte(Number(localStorage.getItem(KEY + selectedCompanyId) || 0));
  }, [selectedCompanyId]);

  const q = useQuery({
    queryKey: ["dp_aprovacoes_rapidas", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<Item[]> => {
      const { data, error } = await supabase
        .from("dp_colaborador_documentos")
        .select(
          "id, validade, dp_colaboradores!inner(nome, nome_social, company_id), dp_documento_requisitos(nome), dp_documentos(id, file_path, file_name, mime_type)",
        )
        .eq("status", "enviado")
        .eq("dp_colaboradores.company_id", selectedCompanyId!)
        .limit(30);
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        id: r.id,
        validade: r.validade,
        colaborador: primeiroNome(r.dp_colaboradores?.nome_social || r.dp_colaboradores?.nome),
        requisito: r.dp_documento_requisitos?.nome ?? "Documento",
        arquivo: r.dp_documentos,
      }));
    },
  });

  const itens = q.data ?? [];
  if (!itens.length || adiadoAte > Date.now()) return null;

  const atualizar = () => {
    qc.invalidateQueries({ queryKey: ["dp_aprovacoes_rapidas"] });
    qc.invalidateQueries({ queryKey: ["dp_colaborador_documentos"] });
    void resolverPendencias(qc, { companyId: selectedCompanyId ?? null });
  };

  const decidir = async (item: Item, status: "aprovado" | "recusado", motivo?: string) => {
    setOcupado(item.id);
    try {
      await salvarChecklistDocumento(
        item.id,
        status === "aprovado"
          ? { status, validade: item.validade }
          : ({ status, motivo_dispensa: motivo } as any),
      );
      toast.success(status === "aprovado" ? "Documento Aprovado" : "Documento Recusado — o colaborador foi avisado");
      setRecusando(null);
      atualizar();
    } catch (e) {
      notifyError(e, { surface: "Aprovações rápidas", action: "concluir a ação", fallback: "Não foi possível salvar a decisão. Tente novamente." });
    } finally {
      setOcupado(null);
    }
  };

  const resolverDepois = () => {
    const ate = Date.now() + SNOOZE_MS;
    try { localStorage.setItem(KEY + selectedCompanyId, String(ate)); } catch { /* sessão */ }
    setAdiadoAte(ate);
  };

  return (
    <section className="rounded-2xl border border-primary/40 bg-primary/5 p-4 space-y-3 min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <FileCheck2 className="h-6 w-6 text-primary shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h2 className="font-semibold text-sm sm:text-base">Aprovações Rápidas</h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {itens.length} {itens.length === 1 ? "documento enviado aguarda" : "documentos enviados aguardam"} só a sua aprovação.
            </p>
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={resolverDepois} className="shrink-0">
          <X className="h-4 w-4 mr-1" /> Resolver Depois
        </Button>
      </div>
      <ul className="space-y-2">
        {itens.map((it) => (
          <li key={it.id} className="rounded-xl border bg-background p-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1 text-sm">
              <span className="font-medium">{it.colaborador}</span>
              <span className="text-muted-foreground"> enviou </span>
              <span className="font-medium break-words">{it.requisito}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {it.arquivo?.file_path && (
                <Button size="sm" variant="outline" onClick={() => abrirDocumento(it.arquivo.id)}>
                  <Eye className="h-4 w-4 mr-1" /> Ver
                </Button>
              )}
              <Button size="sm" variant="outline" disabled={ocupado === it.id} onClick={() => setRecusando(it)}>
                <XCircle className="h-4 w-4 mr-1" /> Recusar
              </Button>
              <Button size="sm" disabled={ocupado === it.id} onClick={() => decidir(it, "aprovado")}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> {ocupado === it.id ? "Salvando..." : "Aprovar"}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <RecusaDialog
        open={!!recusando}
        onOpenChange={(v) => !v && setRecusando(null)}
        title="Recusar Documento"
        description="Informe o motivo. O colaborador verá e poderá enviar novamente."
        motivoObrigatorio
        loading={!!ocupado}
        onConfirm={(m) => recusando && decidir(recusando, "recusado", m)}
      />
    </section>
  );
}
