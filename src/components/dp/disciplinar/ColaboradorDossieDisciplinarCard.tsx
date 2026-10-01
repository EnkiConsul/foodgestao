import { useQuery } from "@tanstack/react-query";
import { Download, Eye, Lock, FileCheck2, FileClock } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DocumentPreview } from "@/components/dp/DocumentPreview";

const TIPO_LABEL: Record<string, string> = {
  advertencia_verbal: "Advertência Verbal",
  advertencia_escrita: "Advertência Escrita",
  suspensao: "Suspensão",
  elogio: "Elogio",
  observacao: "Observação",
};
const FORMAIS = ["advertencia_escrita", "suspensao"];

interface Linha {
  id: string;
  tipo: string;
  data: string;
  motivo: string | null;
  descricao: string | null;
  suspensao_dias: number | null;
  pdf_storage_path: string | null;
  via_assinada_path: string | null;
  via_assinada_em: string | null;
  created_at: string;
}

const fmt = (d?: string | null) => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "—");
const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function situacao(l: Linha) {
  if (!FORMAIS.includes(l.tipo)) return { label: "Registro Interno", icon: Lock, variant: "secondary" as const };
  if (l.via_assinada_path) return { label: "Via Assinada No Portal", icon: FileCheck2, variant: "default" as const };
  return { label: "Aguardando Via Assinada", icon: FileClock, variant: "outline" as const };
}

/** Dossiê disciplinar interno do colaborador — visível só ao DP/gestão. */
export function ColaboradorDossieDisciplinarCard({
  colaboradorId,
  colaboradorNome,
  colaboradorCpf,
}: {
  colaboradorId: string | null;
  colaboradorNome?: string | null;
  colaboradorCpf?: string | null;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const { data = [], isLoading } = useQuery({
    queryKey: ["dp_dossie_disciplinar", colaboradorId],
    enabled: !!colaboradorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_registros_disciplinares")
        .select("id, tipo, data, motivo, descricao, suspensao_dias, pdf_storage_path, via_assinada_path, via_assinada_em, created_at")
        .eq("colaborador_id", colaboradorId!)
        .is("removido_em", null)
        .order("data", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Linha[];
    },
  });

  const baixarDossie = () => {
    const linhas = [...data].sort((a, b) => (a.data < b.data ? -1 : 1));
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Dossiê Disciplinar — ${esc(colaboradorNome)}</title>
<style>body{font-family:Arial,sans-serif;font-size:12px;color:#111;margin:32px}h1{font-size:18px;margin:0 0 4px}
table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #999;padding:6px;text-align:left;vertical-align:top}
th{background:#eee}.muted{color:#555}</style></head><body>
<h1>DOSSIÊ DISCIPLINAR</h1>
<div>Colaborador: <strong>${esc(colaboradorNome)}</strong>${colaboradorCpf ? ` — CPF ${esc(colaboradorCpf)}` : ""}</div>
<div class="muted">Emitido em ${esc(new Date().toLocaleString("pt-BR"))}. Documento interno e confidencial da empresa.</div>
<table><thead><tr><th>Data</th><th>Tipo</th><th>Dias</th><th>Descrição Dos Fatos</th><th>Situação</th></tr></thead><tbody>
${linhas
  .map(
    (l) => `<tr><td>${esc(fmt(l.data))}</td><td>${esc(TIPO_LABEL[l.tipo] ?? l.tipo)}</td><td>${esc(l.suspensao_dias ?? "")}</td>
<td>${esc(l.descricao || l.motivo || "—")}</td><td>${esc(situacao(l).label)}${l.via_assinada_em ? ` em ${esc(fmt(l.via_assinada_em))}` : ""}</td></tr>`,
  )
  .join("")}
</tbody></table>
<p class="muted">Total de registros: ${linhas.length}.</p>
<script>window.onload=function(){window.print()}</script></body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  if (isLoading) return <p className="col-span-full text-sm text-muted-foreground">Carregando dossiê…</p>;

  return (
    <div className="col-span-full space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Uso interno do DP/gestão. O colaborador vê apenas as vias físicas assinadas de advertência escrita e suspensão.
        </p>
        <Button size="sm" variant="outline" disabled={data.length === 0} onClick={baixarDossie}>
          <Download className="mr-2 h-4 w-4" /> Baixar Dossiê
        </Button>
      </div>
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum registro disciplinar.</p>
      ) : (
        <div className="space-y-2">
          {data.map((l) => {
            const s = situacao(l);
            const Icon = s.icon;
            const arquivo = l.via_assinada_path ?? l.pdf_storage_path;
            return (
              <div key={l.id} className="rounded-lg border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold">
                    {fmt(l.data)} · {TIPO_LABEL[l.tipo] ?? l.tipo}
                    {l.suspensao_dias ? ` (${l.suspensao_dias} dia${l.suspensao_dias > 1 ? "s" : ""})` : ""}
                  </div>
                  <Badge variant={s.variant} className="gap-1">
                    <Icon className="h-3 w-3" /> {s.label}
                  </Badge>
                </div>
                {(l.descricao || l.motivo) && (
                  <p className="mt-1 whitespace-pre-line text-muted-foreground">{l.descricao || l.motivo}</p>
                )}
                {arquivo && (
                  <Button size="sm" variant="ghost" className="mt-1 h-8 px-2" onClick={() => setPreview(arquivo)}>
                    <Eye className="mr-1 h-4 w-4" /> {l.via_assinada_path ? "Ver Via Assinada" : "Ver Modelo"}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
      <DocumentPreview
        open={!!preview}
        onOpenChange={(v) => !v && setPreview(null)}
        title="Registro Disciplinar"
        bucket="dp-disciplinar"
        path={preview ?? undefined}
      />
    </div>
  );
}
