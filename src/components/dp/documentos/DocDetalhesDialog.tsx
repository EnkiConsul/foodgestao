import { useQuery } from "@tanstack/react-query";
import {
  Download, Eye, FileText, History, Replace, Trash2, Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DP_DOC_GRUPOS, docTipoGrupo } from "@/lib/dp/documentoTipos";
import { docSourceConfig, parseDocRowId } from "@/lib/dp/historicoDocAcoes";

export type DocDetalhesTarget = {
  rowId: string;
  titulo: string;
  tipo_key: string;
  tipo_label: string;
  competencia: string;
  colaborador_nome: string;
  unidade_nome: string;
  /** Data de referência/registro exibida na lista antiga. */
  data: string;
  file_path: string | null;
  aceite: boolean | null;
  aceiteDispensado?: boolean;
};

const ACOES_LABEL: Record<string, string> = {
  excluido: "Excluído",
  substituido: "Substituído",
};

function fmtDataHora(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function naturezaLabel(tipoKey: string) {
  const grupo = docTipoGrupo(tipoKey);
  return DP_DOC_GRUPOS.find((g) => g.grupo === grupo)?.label ?? "—";
}

function Campo(props: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[11px] font-semibold uppercase text-muted-foreground">{props.label}</div>
      <div className="text-sm break-words">{props.children}</div>
    </div>
  );
}

export function DocDetalhesDialog(props: {
  target: DocDetalhesTarget | null;
  companyId: string | null;
  onOpenChange: (open: boolean) => void;
  onPreview: () => void;
  onDownload: () => void;
  onSubstituir: () => void;
  onExcluir: () => void;
}) {
  const { target, companyId } = props;
  const source = target ? parseDocRowId(target.rowId).source : "doc";
  const docId = target ? parseDocRowId(target.rowId).id : null;

  const detalhes = useQuery({
    queryKey: ["dp_doc_detalhes", target?.rowId, companyId],
    enabled: !!target && !!companyId,
    queryFn: async () => {
      const [docRes, aceiteRes, eventosRes] = await Promise.all([
        source === "doc"
          ? supabase
              .from("dp_documentos")
              .select("id, file_name, file_size, uploaded_by, created_at, exige_aceite, assinatura_detectada, submetido_por_colaborador")
              .eq("id", docId!)
              .maybeSingle()
          : Promise.resolve({ data: null } as any),
        source === "doc"
          ? supabase
              .from("dp_documento_aceites")
              .select("aceito_em, aceito_por, ip")
              .eq("documento_id", docId!)
              .order("aceito_em", { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null } as any),
        supabase
          .from("dp_documento_eventos")
          .select("id, acao, motivo, autor_id, created_at, arquivo_anterior, arquivo_novo")
          .eq("documento_id", docId!)
          .order("created_at", { ascending: false }),
      ]);

      const doc = (docRes as any)?.data ?? null;
      const aceite = (aceiteRes as any)?.data ?? null;
      const eventos = (eventosRes as any)?.data ?? [];

      const userIds = [
        doc?.uploaded_by,
        aceite?.aceito_por,
        ...eventos.map((e: any) => e.autor_id),
      ].filter(Boolean) as string[];

      const nomes = new Map<string, string>();
      if (userIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", Array.from(new Set(userIds)));
        (profs ?? []).forEach((p: any) => nomes.set(p.user_id, p.full_name ?? "Usuário"));
      }

      return { doc, aceite, eventos, nomes };
    },
  });

  const nome = (id?: string | null) =>
    (id ? detalhes.data?.nomes.get(id) : null) ?? (id ? "Usuário" : "—");

  const aceiteBadge = () => {
    if (!target) return null;
    if (target.aceite === null) {
      return target.aceiteDispensado
        ? <Badge variant="outline" className="border-sky-300 text-sky-700">Validação Dispensada</Badge>
        : <Badge variant="outline">Não Exige Validação</Badge>;
    }
    return target.aceite
      ? <Badge variant="outline" className="border-emerald-300 text-emerald-700">Aceito</Badge>
      : <Badge variant="outline" className="border-amber-300 text-amber-700">Aguardando Aceite</Badge>;
  };

  return (
    <Dialog open={!!target} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <span className="break-words">{target?.titulo ?? "Documento"}</span>
          </DialogTitle>
          <DialogDescription>
            {target ? `${docSourceConfig(target.rowId).label} · ${target.tipo_label}` : ""}
          </DialogDescription>
        </DialogHeader>

        {target && (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <Campo label="Colaborador">{target.colaborador_nome}</Campo>
              <Campo label="Unidade">{target.unidade_nome}</Campo>
              <Campo label="Competência">
                <span className="font-mono">{target.competencia}</span>
              </Campo>
              <Campo label="Natureza">{naturezaLabel(target.tipo_key)}</Campo>
              <Campo label="Tipo">{target.tipo_label}</Campo>
              <Campo label="Data do Documento">{fmtDataHora(target.data)}</Campo>
            </div>

            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Importação</div>
              {detalhes.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-3">
                  <Campo label="Data da Importação">
                    {fmtDataHora(detalhes.data?.doc?.created_at ?? target.data)}
                  </Campo>
                  <Campo label="Importado Por">
                    {detalhes.data?.doc?.submetido_por_colaborador
                      ? `${target.colaborador_nome} (portal)`
                      : nome(detalhes.data?.doc?.uploaded_by)}
                  </Campo>
                  <Campo label="Arquivo">
                    {detalhes.data?.doc?.file_name ?? target.file_path?.split("/").pop() ?? "—"}
                  </Campo>
                </div>
              )}
            </div>

            <div className="rounded-lg border p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-xs font-semibold uppercase text-muted-foreground">Validação Digital</div>
                {aceiteBadge()}
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Campo label="Data do Aceite">{fmtDataHora(detalhes.data?.aceite?.aceito_em)}</Campo>
                <Campo label="Aceito Por">{nome(detalhes.data?.aceite?.aceito_por)}</Campo>
                <Campo label="Assinatura no Arquivo">
                  {detalhes.data?.doc?.assinatura_detectada ? "Detectada" : "Não detectada"}
                </Campo>
              </div>
            </div>

            <div className="rounded-lg border p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
                <History className="h-3.5 w-3.5" /> Log de Alterações
              </div>
              {(detalhes.data?.eventos ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma alteração registrada para este documento.</p>
              ) : (
                <ul className="space-y-2">
                  {(detalhes.data?.eventos ?? []).map((e: any) => (
                    <li key={e.id} className="rounded-md border bg-muted/20 p-2 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="text-[11px]">
                          {ACOES_LABEL[e.acao] ?? e.acao}
                        </Badge>
                        <span className="font-mono text-xs text-muted-foreground">{fmtDataHora(e.created_at)}</span>
                        <span className="text-xs text-muted-foreground">· {nome(e.autor_id)}</span>
                      </div>
                      {e.motivo && <p className="mt-1 text-xs text-muted-foreground">Motivo: {e.motivo}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" onClick={props.onPreview} disabled={!target?.file_path}>
            <Eye className="mr-1 h-4 w-4 text-primary" /> Ver
          </Button>
          <Button variant="outline" onClick={props.onDownload} disabled={!target?.file_path}>
            <Download className="mr-1 h-4 w-4" /> Baixar
          </Button>
          <Button variant="outline" onClick={props.onSubstituir}>
            <Replace className="mr-1 h-4 w-4" /> Substituir
          </Button>
          <Button variant="outline" className="text-destructive" onClick={props.onExcluir}>
            <Trash2 className="mr-1 h-4 w-4" /> Excluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
