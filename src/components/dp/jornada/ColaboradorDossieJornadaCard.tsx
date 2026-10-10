import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { escapeHtml, imprimirHtmlEmQuadro } from "@/lib/print/imprimirHtml";
import { TERMO_PORTAL_PARAGRAFOS, TERMO_PORTAL_TITULO } from "@/lib/dp/termoPortal";

const fmtD = (d?: string | null) => (d ? new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString("pt-BR") : "—");
const fmtDH = (d?: string | null) => (d ? new Date(d).toLocaleString("pt-BR") : "—");

const STATUS: Record<string, string> = {
  pendente: "Pendente", aguardando_colega: "Aguardando colega", aguardando_gestor: "Aguardando gestor",
  aprovada: "Aprovada", aprovado: "Aprovado", recusada: "Recusada", recusado: "Recusado",
  cancelada: "Cancelada", cancelado: "Cancelado", expirada: "Expirada", agendado: "Agendado",
  em_gozo: "Em gozo", concluido: "Concluído", solicitado: "Solicitado",
};
const st = (s?: string | null) => (s ? STATUS[s] ?? s.replace(/_/g, " ") : "—");

type Aceite = {
  id: string; modelo: string | null; modelo_versao: string | null; aceito_em: string;
  ip: string | null; user_agent: string | null; conteudo_hash: string | null;
  documento_snapshot: { titulo?: string; versao?: string; paragrafos?: string[] } | null;
};

/** Comprovante imprimível do aceite do Termo do Portal (para auditoria). */
function imprimirTermo(a: Aceite, nome: string | null, cpf: string | null) {
  const snap = a.documento_snapshot ?? {};
  const titulo = snap.titulo ?? TERMO_PORTAL_TITULO;
  const pars = snap.paragrafos?.length ? snap.paragrafos : [...TERMO_PORTAL_PARAGRAFOS];
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(titulo)}</title>
<style>body{font-family:Arial,sans-serif;font-size:11pt;margin:28px;color:#111}h1{font-size:15pt}p{text-align:justify;line-height:1.4}
.box{border:1px solid #999;padding:12px;margin-top:20px;font-size:9.5pt}.box div{margin:3px 0}code{word-break:break-all}</style></head><body>
<h1>${escapeHtml(titulo)} (${escapeHtml(snap.versao ?? a.modelo_versao ?? "")})</h1>
${pars.map((p) => `<p>${escapeHtml(p)}</p>`).join("")}
<div class="box"><strong>Registro do aceite eletrônico</strong>
<div>Colaborador: ${escapeHtml(nome ?? "—")}${cpf ? ` — CPF ${escapeHtml(cpf)}` : ""}</div>
<div>Data e hora: ${escapeHtml(fmtDH(a.aceito_em))}</div>
<div>Endereço de internet (IP): ${escapeHtml(a.ip ?? "—")}</div>
<div>Dispositivo: ${escapeHtml(a.user_agent ?? "—")}</div>
<div>Impressão digital do texto (SHA-256): <code>${escapeHtml(a.conteudo_hash ?? "—")}</code></div>
<div>Identificador do registro: ${escapeHtml(a.id)}</div></div></body></html>`;
  imprimirHtmlEmQuadro(html, () => toast.error("Não foi possível abrir a impressão. Tente novamente."));
}

/** Dossiê de Jornada: trocas de folga, férias e termos aceitos no portal. */
export function ColaboradorDossieJornadaCard({
  colaboradorId, colaboradorNome, colaboradorCpf,
}: { colaboradorId: string | null; colaboradorNome: string | null; colaboradorCpf: string | null }) {
  const q = useQuery({
    queryKey: ["dp_dossie_jornada", colaboradorId],
    enabled: !!colaboradorId,
    queryFn: async () => {
      const id = colaboradorId!;
      const [trocas, ferias, aceites] = await Promise.all([
        supabase.from("dp_trocas")
          .select("id, solicitante_id, destino_id, data_original, data_proposta, motivo, status, created_at, solicitante:solicitante_id(nome), destino:destino_id(nome)")
          .or(`solicitante_id.eq.${id},destino_id.eq.${id}`)
          .order("data_original", { ascending: false }).limit(200),
        supabase.from("dp_ferias_gozos")
          .select("id, data_inicio, data_fim, dias, dias_abono, status, origem, created_at, aprovado_em, ciente_em")
          .eq("colaborador_id", id).order("data_inicio", { ascending: false }).limit(100),
        supabase.from("dp_documento_aceites")
          .select("id, modelo, modelo_versao, aceito_em, ip, user_agent, conteudo_hash, documento_snapshot")
          .eq("colaborador_id", id).not("modelo", "is", null).order("aceito_em", { ascending: false }),
      ]);
      if (trocas.error) throw trocas.error;
      if (ferias.error) throw ferias.error;
      return {
        trocas: (trocas.data ?? []) as unknown as Array<{
          id: string; solicitante_id: string; data_original: string; data_proposta: string | null;
          motivo: string | null; status: string; solicitante: { nome: string } | null; destino: { nome: string } | null;
        }>,
        ferias: ferias.data ?? [],
        aceites: ((aceites.data ?? []) as unknown as Aceite[]),
      };
    },
  });

  if (q.isLoading) return <p className="col-span-full text-sm text-muted-foreground">Carregando…</p>;
  if (q.isError) return <p className="col-span-full text-sm text-destructive">Não foi possível carregar o dossiê de jornada. Feche e abra a ficha novamente.</p>;
  const d = q.data!;

  return (
    <div className="col-span-full space-y-4">
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Trocas de folga ({d.trocas.length})</p>
        {d.trocas.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma troca registrada.</p> : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {d.trocas.map((t) => {
              const enviou = t.solicitante_id === colaboradorId;
              const colega = enviou ? t.destino?.nome : t.solicitante?.nome;
              return (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 p-2 text-sm">
                  <span>
                    {fmtD(t.data_original)} → {fmtD(t.data_proposta)} · {enviou ? "pediu para" : "recebeu de"} {colega ?? "—"}
                    {t.motivo ? <span className="text-muted-foreground"> · {t.motivo}</span> : null}
                  </span>
                  <Badge variant="outline">{st(t.status)}</Badge>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Férias ({d.ferias.length})</p>
        {d.ferias.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma férias registrada.</p> : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {d.ferias.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 p-2 text-sm">
                <span>
                  {fmtD(f.data_inicio)} a {fmtD(f.data_fim)} · {f.dias} dias{f.dias_abono ? ` + ${f.dias_abono} de abono` : ""}
                  <span className="text-muted-foreground"> · {f.origem === "solicitacao" ? "solicitada pelo colaborador" : "lançada pelo gestor"}{f.ciente_em ? ` · ciência em ${fmtD(f.ciente_em)}` : ""}</span>
                </span>
                <Badge variant="outline">{st(f.status)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Termos aceitos no portal</p>
        {d.aceites.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum termo aceito até agora.</p> : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {d.aceites.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 p-2 text-sm">
                <span>
                  {a.documento_snapshot?.titulo ?? (a.modelo === "termo_portal" ? TERMO_PORTAL_TITULO : a.modelo)} ({a.modelo_versao ?? "—"})
                  <span className="text-muted-foreground"> · aceito em {fmtDH(a.aceito_em)}</span>
                </span>
                <Button size="sm" variant="outline" className="h-7" onClick={() => imprimirTermo(a, colaboradorNome, colaboradorCpf)}>
                  <Printer className="mr-1 h-3.5 w-3.5" /> Comprovante
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-xs text-muted-foreground">Cada nova versão do termo exige novo aceite e aparece aqui separadamente.</p>
      </div>
    </div>
  );
}
