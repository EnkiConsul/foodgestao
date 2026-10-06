import { ModoImpressaoEscolha } from "@/components/dp/documentos/ModoImpressaoEscolha";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileSignature, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { AssinaturaCaptura } from "@/components/dp/AssinaturaCaptura";
import { dataBr as fmt } from "@/lib/dp/formato";
import { textoErroFerias } from "@/lib/dp/ferias-direito";
import { AVETO_LOGO_DATA_URL } from "@/lib/dp/aveto-logo-data";
import { imprimirHtmlEmQuadro } from "@/lib/print/imprimirHtml";

export type TermoDados = {
  empresa: string | null;
  colaborador_nome: string | null;
  colaborador_cpf: string | null;
  solicitacao: null | {
    status: string; criado_em: string; respondido_em: string | null; resposta_admin: string | null;
    data_inicio: string; data_fim: string; dias: number; dias_abono: number; adiantar_13: boolean;
    observacao: string | null; ajuste_gestor_de: { data_inicio: string; data_fim: string; motivo: string } | null;
    assinatura: string | null; assinado_em: string | null; hash: string | null;
  };
  aviso: null | {
    data_inicio: string; data_fim: string; dias_abono: number; aviso_em: string | null;
    ajustado_pelo_gestor: boolean; ciente_em: string | null; assinatura: string | null;
  };
};

const cpfMask = (c?: string | null) => {
  const d = (c ?? "").replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : "Não informado";
};
const dataHora = (s?: string | null) => (s ? new Date(s).toLocaleString("pt-BR") : "—");
const dias = (a: string, b: string) =>
  Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86_400_000) + 1;

const STATUS: Record<string, string> = {
  pendente: "Em Análise", aprovada: "Aprovado", recusada: "Recusado", cancelada: "Cancelado",
};

/** Texto do Termo de Solicitação (usado na prévia antes de assinar). */
export function textoSolicitacao(p: {
  nome: string; inicio: string; fim: string; abono: number; adiantar13: boolean;
}) {
  return [
    `Eu, ${p.nome || "colaborador(a)"}, solicito à empresa a concessão das minhas férias no período de ${fmt(p.inicio)} a ${fmt(p.fim)} (${dias(p.inicio, p.fim)} dias).`,
    p.abono > 0
      ? `Requeiro a conversão de ${p.abono} dia(s) em abono pecuniário (Art. 143 da CLT).`
      : "Não requeiro abono pecuniário (venda de dias).",
    p.adiantar13 ? "Requeiro o adiantamento da 1ª parcela do 13º salário (Lei 4.749/1965)." : "",
    "Estou ciente de que a definição da época das férias cabe à empresa (Art. 136 da CLT) e que o gestor pode aprovar, recusar ou ajustar as datas deste pedido.",
  ].filter(Boolean);
}

const LINHA: React.CSSProperties = { width: 260, margin: "0 auto", borderTop: "1px solid #444", paddingTop: 4, fontSize: 12 };

function Assinatura({ img, legenda, manual, nome, cpf }: { img: string | null; legenda: string; manual?: boolean; nome?: string | null; cpf?: string | null }) {
  if (manual) {
    return (
      <div style={{ marginTop: 24, textAlign: "center" }}>
        <div style={{ height: 56 }} />
        <div style={LINHA}>
          <b>{nome ?? ""}</b><br />CPF {cpfMask(cpf ?? null)}<br />Data: ____ / ____ / ________
        </div>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 16, textAlign: "center" }}>
      {img ? <img src={img} alt="Assinatura" style={{ margin: "0 auto", height: 64, objectFit: "contain" }} /> : <div style={{ height: 64 }} />}
      <div style={LINHA}>{legenda}</div>
    </div>
  );
}

/** Visualização imprimível dos termos de férias (solicitação e aviso). */
export function FeriasTermoDialog({
  open, onOpenChange, solicitacaoId, gozoId,
}: { open: boolean; onOpenChange: (v: boolean) => void; solicitacaoId?: string | null; gozoId?: string | null }) {
  const q = useQuery({
    queryKey: ["dp_ferias_termo", solicitacaoId ?? null, gozoId ?? null],
    enabled: open && !!(solicitacaoId || gozoId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dp_ferias_termo_obter" as never, {
        _solicitacao_id: solicitacaoId ?? null, _gozo_id: gozoId ?? null,
      } as never);
      if (error) throw error;
      return data as unknown as TermoDados;
    },
  });
  const t = q.data;
  const s = t?.solicitacao;
  const a = t?.aviso;
  const [manual, setManual] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92dvh] overflow-y-auto">
        <DialogHeader className="print:hidden">
          <DialogTitle>Termos de Férias</DialogTitle>
          <DialogDescription>Solicitação, decisão do gestor e ciência do colaborador.</DialogDescription>
        </DialogHeader>
        {q.isLoading ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Carregando o termo…</p>
        ) : q.isError || !t ? (
          <p className="p-6 text-center text-sm text-destructive">
            {textoErroFerias((q.error as Error)?.message) || "Não foi possível abrir o termo. Tente novamente em instantes."}
          </p>
        ) : (
          <>
          <div className="print:hidden"><ModoImpressaoEscolha manual={manual} onChange={setManual} /></div>
          <div id="termo-ferias-print" className="space-y-6 text-sm">
            <div style={{ borderBottom: "3px solid #EB6119", paddingBottom: 10, marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <img src={AVETO_LOGO_DATA_URL} alt="AVETO 360" style={{ height: 36 }} />
              <span style={{ fontSize: 12, fontWeight: 600, textAlign: "right" }}>{t.empresa}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Colaborador: <b>{t.colaborador_nome}</b> · CPF {cpfMask(t.colaborador_cpf)}
            </p>
            {s && (
              <section className="rounded-xl border p-4">
                <h3 className="mb-2 font-semibold">Termo de Solicitação de Férias</h3>
                {textoSolicitacao({
                  nome: t.colaborador_nome ?? "",
                  inicio: s.ajuste_gestor_de?.data_inicio ?? s.data_inicio,
                  fim: s.ajuste_gestor_de?.data_fim ?? s.data_fim,
                  abono: s.dias_abono, adiantar13: s.adiantar_13,
                }).map((l) => <p key={l} className="mb-1">{l}</p>)}
                {s.observacao && <p className="mt-1 italic">Observação: “{s.observacao}”</p>}
                <Assinatura manual={manual} nome={t.colaborador_nome} cpf={t.colaborador_cpf} img={s.assinatura} legenda={`${t.colaborador_nome ?? ""} · ${s.assinado_em ? `Assinado em ${dataHora(s.assinado_em)}` : "Pedido anterior sem assinatura"}`} />
                {!manual && <div className="mt-4 rounded-lg bg-muted/40 p-3">
                  <p><b>Decisão do Gestor:</b> {STATUS[s.status] ?? s.status}{s.respondido_em ? ` em ${dataHora(s.respondido_em)}` : ""}</p>
                  {s.ajuste_gestor_de && (
                    <p>Datas ajustadas pela empresa para {fmt(s.data_inicio)} a {fmt(s.data_fim)}. Motivo: {s.ajuste_gestor_de.motivo}</p>
                  )}
                  {s.resposta_admin && !s.ajuste_gestor_de && <p>Resposta: {s.resposta_admin}</p>}
                </div>}
                {!manual && s.hash && <p className="mt-2 break-all text-[10px] text-muted-foreground">Código de integridade: {s.hash}</p>}
              </section>
            )}
            {a && (
              <section className="rounded-xl border p-4">
                <h3 className="mb-2 font-semibold">Aviso de Férias (Art. 135 da CLT)</h3>
                <p>
                  Comunicamos que suas férias serão gozadas de <b>{fmt(a.data_inicio)}</b> a <b>{fmt(a.data_fim)}</b> ({dias(a.data_inicio, a.data_fim)} dias)
                  {a.dias_abono > 0 ? `, com ${a.dias_abono} dia(s) de abono pecuniário` : ""}.
                  {!manual && a.aviso_em ? ` Aviso emitido em ${fmt(a.aviso_em)}.` : ""}
                </p>
                {a.ajustado_pelo_gestor && <p className="mt-1">As datas foram definidas pela empresa, conforme o Art. 136 da CLT.</p>}
                <p className="mt-1">Declaro ciência do período de férias acima.</p>
                {manual ? (
                  <div className="assin-par" style={{ display: "flex", gap: 24, justifyContent: "space-between", flexWrap: "wrap" }}>
                    <div style={{ flex: "1 1 220px", textAlign: "center", marginTop: 48 }}>
                      <div style={{ borderTop: "1px solid #444", paddingTop: 4, fontSize: 12 }}>
                        <b>{t.empresa ?? ""}</b><br />Empresa (Empregador)<br />Data: ____ / ____ / ________
                      </div>
                    </div>
                    <div style={{ flex: "1 1 220px", textAlign: "center", marginTop: 48 }}>
                      <div style={{ borderTop: "1px solid #444", paddingTop: 4, fontSize: 12 }}>
                        <b>{t.colaborador_nome ?? ""}</b><br />CPF {cpfMask(t.colaborador_cpf)} · Ciência<br />Data: ____ / ____ / ________
                      </div>
                    </div>
                  </div>
                ) : (
                  <Assinatura nome={t.colaborador_nome} cpf={t.colaborador_cpf} img={a.assinatura} legenda={`${t.colaborador_nome ?? ""} · ${a.ciente_em ? `Ciente em ${dataHora(a.ciente_em)}` : "Aguardando ciência"}`} />
                )}
              </section>
            )}
          </div>
          </>
        )}
        <DialogFooter className="print:hidden">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button disabled={!t} onClick={() => imprimir()}><Printer className="mr-1 size-4" /> {manual ? "Imprimir Para Assinar à Mão" : "Imprimir / PDF"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function imprimir() {
  const el = document.getElementById("termo-ferias-print");
  if (!el) return;
  imprimirHtmlEmQuadro(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Termos de Férias</title><style>body{font-family:Arial,sans-serif;font-size:13px;padding:24px;color:#0F1B3D}section{border:1px solid #ccc;border-radius:8px;padding:16px;margin-bottom:16px;page-break-inside:avoid}h3{color:#EB6119;margin:0 0 8px}p{margin:0 0 4px}img{max-height:64px}</style></head><body>${el.innerHTML}</body></html>`);
}

/** Captura de assinatura com o texto do termo, usada no pedido e na ciência. */
export function FeriasAssinarDialog({
  open, onOpenChange, titulo, paragrafos, nome, confirmarTexto, enviando, onConfirmar,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; titulo: string; paragrafos: string[];
  nome: string; confirmarTexto: string; enviando?: boolean; onConfirmar: (png: string) => void;
}) {
  const [png, setPng] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setPng(null); onOpenChange(v); }}>
      <DialogContent className="w-[calc(100%-1rem)] max-w-md max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileSignature className="size-5 text-primary" /> {titulo}</DialogTitle>
          <DialogDescription>Leia o termo e assine para concluir.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 rounded-xl bg-muted/40 p-3 text-sm">
          {paragrafos.map((p) => <p key={p}>{p}</p>)}
        </div>
        <AssinaturaCaptura nomePadrao={nome} onChange={setPng} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Voltar</Button>
          <Button disabled={!png || enviando} onClick={() => png && onConfirmar(png)}>
            {enviando ? "Enviando…" : confirmarTexto}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
