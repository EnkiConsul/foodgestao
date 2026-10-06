import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Banknote, CheckCircle2, Eye, FileCheck2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RecusaDialog } from "@/components/dp/RecusaDialog";
import { DocumentPreview } from "@/components/dp/DocumentPreview";
import { salvarChecklistDocumento } from "@/lib/dp/documentos-oficial";
import { linkDocumentoAssinado } from "@/lib/documentoArquivo";
import { resolverPendencias } from "@/lib/dp/pendencias-resolver";
import { notifyError } from "@/lib/notifyError";
import { listarNomes, usePagamentosPendentes } from "./FolhaPagamentoAlerta";

type Parte = { vinculoId: string; documentoId: string | null; mime: string | null };
type Aprovacao = {
  chave: string;
  colaborador: string;
  requisito: string;
  validade: string | null;
  partes: Parte[];
  /** Documento com foto que costuma ter frente e verso, mas só veio um lado. */
  semVerso: boolean;
};

const SNOOZE_MS = 12 * 60 * 60 * 1000;
/** Fechar no X esconde só por 10 minutos (igual ao aviso do portal). */
const FECHAR_MS = 10 * 60 * 1000;
const KEY = "dp_avisos_gestor_adiado:";
const DOC_FRENTE_VERSO = /\b(rg|cnh|identidade|habilita|conselho|crm|coren|crn|ctps|carteira)\b/i;

function primeiroNome(n: string) {
  const p = (n || "").trim().split(/\s+/)[0] ?? "";
  return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : "Colaborador";
}

function useAprovacoes() {
  const { selectedCompanyId } = useCompanyContext();
  return useQuery({
    queryKey: ["dp_aprovacoes_rapidas", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async (): Promise<Aprovacao[]> => {
      const { data, error } = await supabase
        .from("dp_colaborador_documentos")
        .select(
          "id, validade, created_at, colaborador_id, dependente_id, requisito_id, dp_colaboradores!inner(nome, nome_social, company_id), dp_documento_requisitos(nome), dp_documentos(id, mime_type)",
        )
        .eq("status", "enviado")
        .eq("dp_colaboradores.company_id", selectedCompanyId!)
        .order("created_at", { ascending: true })
        .limit(60);
      if (error) throw error;
      const grupos = new Map<string, Aprovacao>();
      for (const r of (data ?? []) as any[]) {
        const chave = `${r.colaborador_id}-${r.requisito_id}-${r.dependente_id ?? ""}`;
        let g = grupos.get(chave);
        if (!g) {
          g = {
            chave,
            colaborador: primeiroNome(r.dp_colaboradores?.nome_social || r.dp_colaboradores?.nome),
            requisito: r.dp_documento_requisitos?.nome ?? "Documento",
            validade: r.validade,
            partes: [],
            semVerso: false,
          };
          grupos.set(chave, g);
        }
        g.partes.push({ vinculoId: r.id, documentoId: r.dp_documentos?.id ?? null, mime: r.dp_documentos?.mime_type ?? null });
      }
      return [...grupos.values()].map((g) => ({
        ...g,
        semVerso:
          g.partes.length === 1 &&
          DOC_FRENTE_VERSO.test(g.requisito) &&
          (g.partes[0].mime ?? "").startsWith("image/"),
      }));
    },
  });
}

/**
 * Aviso único sobreposto na tela inicial do gestor: reúne aprovações rápidas
 * (documentos enviados) e pagamentos aguardando comprovante. Pode ser fechado
 * (volta em 10 min) ou adiado com "Resolver Depois" (12h).
 */
export function AvisosGestorGate() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const aprov = useAprovacoes();
  const pagtos = usePagamentosPendentes();
  const [adiadoAte, setAdiadoAte] = useState(0);
  const [aberto, setAberto] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [vendo, setVendo] = useState<Aprovacao | null>(null);
  const [parteIdx, setParteIdx] = useState(0);
  const [link, setLink] = useState<{ url: string; mime: string | null } | null>(null);
  const [recusando, setRecusando] = useState<{ item: Aprovacao; motivo?: string } | null>(null);

  useEffect(() => {
    setAdiadoAte(selectedCompanyId ? Number(localStorage.getItem(KEY + selectedCompanyId) || 0) : 0);
    setAberto(true);
  }, [selectedCompanyId]);

  // Reabre sozinho quando o prazo de "fechar" acabar.
  useEffect(() => {
    const falta = adiadoAte - Date.now();
    if (falta <= 0) return;
    const t = setTimeout(() => setAdiadoAte(0), falta);
    return () => clearTimeout(t);
  }, [adiadoAte]);

  // Carrega o arquivo da parte (frente/verso) selecionada.
  const parte = vendo?.partes[parteIdx];
  useEffect(() => {
    setLink(null);
    if (!parte?.documentoId) return;
    let cancelado = false;
    linkDocumentoAssinado(parte.documentoId, 300)
      .then((l) => { if (!cancelado) setLink(l ? { url: l.url, mime: l.mimeType } : null); })
      .catch(() => { if (!cancelado) toast.error("Não foi possível abrir o arquivo. Feche e tente de novo."); });
    return () => { cancelado = true; };
  }, [parte?.documentoId]);

  const itens = aprov.data ?? [];
  const grupos = pagtos.data ?? [];
  const total = itens.length + grupos.length;

  const adiar = (ms: number) => {
    const ate = Date.now() + ms;
    try { if (selectedCompanyId) localStorage.setItem(KEY + selectedCompanyId, String(ate)); } catch { /* sessão */ }
    setAdiadoAte(ate);
  };

  const decidir = async (item: Aprovacao, status: "aprovado" | "recusado", motivo?: string) => {
    setOcupado(true);
    try {
      for (const p of item.partes) {
        await salvarChecklistDocumento(
          p.vinculoId,
          status === "aprovado" ? { status, validade: item.validade } : ({ status, motivo_dispensa: motivo } as any),
        );
      }
      toast.success(status === "aprovado" ? "Documento Aprovado" : "Documento Recusado — o colaborador foi avisado");
      setRecusando(null);
      setVendo(null);
      qc.invalidateQueries({ queryKey: ["dp_aprovacoes_rapidas"] });
      qc.invalidateQueries({ queryKey: ["dp_colaborador_documentos"] });
      void resolverPendencias(qc, { companyId: selectedCompanyId ?? null });
    } catch (e) {
      notifyError(e, { surface: "Aprovações rápidas", action: "concluir a ação", fallback: "Não foi possível salvar a decisão. Tente novamente." });
    } finally {
      setOcupado(false);
    }
  };

  const abrirVer = (it: Aprovacao) => { setParteIdx(0); setVendo(it); };
  const mostrar = total > 0 && aberto && adiadoAte <= Date.now();
  const rotulo = (i: number) => (i === 0 ? "Frente" : i === 1 ? "Verso" : `Foto ${i + 1}`);

  const acoes = useMemo(() => vendo && (
    <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
      <Button variant="outline" disabled={ocupado} onClick={() => setRecusando({ item: vendo })}>
        <XCircle className="h-4 w-4 mr-1" /> Recusar
      </Button>
      <Button disabled={ocupado} onClick={() => decidir(vendo, "aprovado")}>
        <CheckCircle2 className="h-4 w-4 mr-1" /> {ocupado ? "Salvando..." : "Aprovar"}
      </Button>
    </div>
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [vendo, ocupado]);

  return (
    <>
      <Dialog open={mostrar && !vendo} onOpenChange={(v) => { if (!v) { adiar(FECHAR_MS); } }}>
        <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Resolva Rápido</DialogTitle>
            <DialogDescription>
              {total} {total === 1 ? "item depende" : "itens dependem"} só de você. Resolva agora ou deixe para depois.
            </DialogDescription>
          </DialogHeader>

          {itens.length > 0 && (
            <div className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <FileCheck2 className="h-4 w-4 text-primary" /> Documentos Para Aprovar
              </h3>
              {itens.map((it) => (
                <div key={it.chave} className="rounded-xl border p-3 space-y-2">
                  <p className="text-sm">
                    <span className="font-medium">{it.colaborador}</span>
                    <span className="text-muted-foreground"> enviou </span>
                    <span className="font-medium break-words">{it.requisito}</span>
                    {it.partes.length > 1 && <span className="text-muted-foreground"> ({it.partes.length} fotos)</span>}
                  </p>
                  {it.semVerso && (
                    <p className="flex items-start gap-1.5 text-xs text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> Só a frente foi enviada. Confira se falta o verso.
                    </p>
                  )}
                  <Button size="sm" className="w-full sm:w-auto" onClick={() => abrirVer(it)}>
                    <Eye className="h-4 w-4 mr-1" /> Conferir e Aprovar
                  </Button>
                </div>
              ))}
            </div>
          )}

          {grupos.length > 0 && (
            <div className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Banknote className="h-4 w-4 text-primary" /> Pagamentos Pendentes
              </h3>
              {grupos.map((g) => (
                <div key={g.chave} className="rounded-xl border p-3 space-y-2">
                  <p className="text-sm">
                    <span className="font-medium">{g.titulo} {g.mes}/{g.ano}</span>
                    <span className="text-muted-foreground">
                      {" "}— {g.total} {g.total === 1 ? "documento aguarda" : "documentos aguardam"} comprovante
                      {g.nomes.length ? ` (${listarNomes(g.nomes)})` : ""}.
                    </span>
                  </p>
                  <Button asChild size="sm" variant="outline" className="w-full sm:w-auto">
                    <Link to={`/dp/documentos/historico?pendencia=comprovante&mes=${g.mes}&ano=${g.ano}`} onClick={() => setAberto(false)}>
                      Ver Documentos Para Pagar <ArrowRight className="h-4 w-4 ml-1" />
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          )}

          <Button variant="ghost" className="w-full" onClick={() => adiar(SNOOZE_MS)}>
            Resolver Depois
          </Button>
        </DialogContent>
      </Dialog>

      <DocumentPreview
        open={!!vendo}
        onOpenChange={(v) => !v && setVendo(null)}
        title={vendo ? `${vendo.requisito} — ${vendo.colaborador}` : ""}
        url={link?.url ?? null}
        mime={link?.mime ?? parte?.mime ?? null}
        aguardando={vendo && !link ? "Carregando documento..." : null}
        toolbar={
          vendo && (
            <div className="flex flex-wrap items-center gap-2">
              {vendo.partes.length > 1 &&
                vendo.partes.map((_, i) => (
                  <Button key={i} size="sm" variant={i === parteIdx ? "default" : "outline"} onClick={() => setParteIdx(i)}>
                    {rotulo(i)}
                  </Button>
                ))}
              {vendo.semVerso && (
                <span className="flex items-center gap-1 text-xs text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" /> Só a frente foi enviada.
                  <button
                    type="button"
                    className="underline"
                    onClick={() => setRecusando({ item: vendo, motivo: "Envie também a foto do verso do documento." })}
                  >
                    Pedir o verso
                  </button>
                </span>
              )}
            </div>
          )
        }
        acaoRodape={acoes}
      />

      <RecusaDialog
        key={recusando?.item.chave + (recusando?.motivo ?? "")}
        open={!!recusando}
        onOpenChange={(v) => !v && setRecusando(null)}
        title="Recusar Documento"
        description="Informe o motivo. O colaborador verá e poderá enviar novamente."
        motivoObrigatorio
        textoInicial={recusando?.motivo ?? ""}
        loading={ocupado}
        onConfirm={(m) => recusando && decidir(recusando.item, "recusado", m)}
      />
    </>
  );
}
