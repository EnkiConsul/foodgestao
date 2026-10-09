import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCents } from "@/lib/billing";
import { toast } from "sonner";
import { notifyError } from "@/lib/notifyError";

type Json = Record<string, any>;
const MODULO: Record<string, string> = { financeiro: "Financeiro 360°", pessoas: "Pessoas 360°" };
const STATUS: Record<string, string> = {
  active: "Ativa", trialing: "Em teste", grace: "Em carência", past_due: "Em atraso", canceled: "Cancelada", expired: "Expirada",
};
const FATURA: Record<string, string> = { draft: "Rascunho", open: "Em aberto", paid: "Paga", overdue: "Vencida", canceled: "Cancelada", refunded: "Estornada" };
const GRANT: Record<string, string> = { cortesia_total: "Cortesia Integral", desconto_percentual: "Desconto", carencia: "Carência" };
const RECURSO: Record<string, string> = { empresas: "Empresas", usuarios: "Usuários", colaboradores: "Colaboradores", unidades: "Unidades", open_finance: "Open Finance", contadores: "Contadores", usuarios_contador: "Usuários Contador" };
const data = (v?: string | null) => (v ? new Date(v).toLocaleDateString("pt-BR") : "—");
const ciclo = (c: string) => (c === "anual" ? "Anual" : "Mensal");

type Acao =
  | { tipo: "adicional"; sub: Json }
  | { tipo: "plano"; sub: Json }
  | { tipo: "cancelar"; sub: Json }
  | { tipo: "desfazer_cancelamento"; sub: Json }
  | { tipo: "cancelar_agendamento"; sub: Json };

async function contratar(body: Json) {
  const { data, error } = await supabase.functions.invoke("billing-v2-contratar", { body });
  if (error) {
    let msg = error.message;
    try { msg = (await (error as any).context?.json())?.error ?? msg; } catch { /* */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export default function MinhaAssinaturaV2() {
  const { selectedCompanyId } = useCompanyContext();
  const qc = useQueryClient();
  const [acao, setAcao] = useState<Acao | null>(null);
  const [editPagador, setEditPagador] = useState(false);

  const q = useQuery({
    queryKey: ["minha-assinatura-v2", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("billing_v2_minha_assinatura", { _company_id: selectedCompanyId });
      if (error) throw error;
      return data as Json;
    },
  });

  if (!selectedCompanyId) {
    return <Vazio texto="Selecione uma empresa para ver a assinatura." link />;
  }
  if (q.isLoading) return <div className="space-y-3 p-4"><Skeleton className="h-24" /><Skeleton className="h-48" /></div>;
  if (q.error) {
    return (
      <div className="p-4"><Card><CardContent className="space-y-3 p-6">
        <p className="font-medium">Não foi possível carregar sua assinatura agora.</p>
        <p className="text-sm text-muted-foreground">Verifique sua conexão e tente de novo. Se continuar, fale com o suporte.</p>
        <Button onClick={() => q.refetch()}>Tentar Novamente</Button>
      </CardContent></Card></div>
    );
  }
  const d = q.data ?? {};
  const conta = d.conta as Json | null;
  const subs = (d.assinaturas ?? []) as Json[];
  const faturas = (d.faturas ?? []) as Json[];

  if (!conta || !subs.length) {
    return <Vazio texto="Esta empresa ainda não tem assinatura ativa." planos />;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div>
        <h1 className="text-2xl font-semibold">Minha Assinatura</h1>
        <p className="text-sm text-muted-foreground">Planos, adicionais, faturas e notas fiscais da sua conta de cobrança.</p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Conta de Cobrança</CardTitle>
          <CardDescription>{conta.tipo === "grupo" ? "Grupo (várias empresas na mesma cobrança)" : "Por empresa"}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <Campo r="Nome" v={conta.nome} />
          <Campo r="Documento do pagador" v={conta.documento_pagador} />
          <Campo r="E-mail de cobrança" v={conta.email_cobranca} />
          <Campo r="Empresas na conta" v={(conta.empresas ?? []).map((e: Json) => e.nome).join(", ")} />
          {subs.some((x) => x.pode_gerir) && (
            <div className="sm:col-span-2">
              <Button size="sm" variant="outline" data-testid="editar-pagador" onClick={() => setEditPagador(true)}>Alterar Dados do Pagador</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {editPagador && (
        <PagadorDialog conta={conta} companyId={selectedCompanyId} onClose={() => setEditPagador(false)}
          onDone={() => { setEditPagador(false); qc.invalidateQueries({ queryKey: ["minha-assinatura-v2"] }); }} />
      )}

      {subs.map((s) => <AssinaturaCard key={s.id} s={s} onAcao={setAcao} />)}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Histórico de Pagamentos e Notas Fiscais</CardTitle></CardHeader>
        <CardContent>
          {!faturas.length ? <p className="text-sm text-muted-foreground">Nenhuma fatura ainda.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground"><tr>
                  <th className="py-1 pr-3">Vencimento</th><th className="pr-3">Módulo</th><th className="pr-3">Valor</th>
                  <th className="pr-3">Situação</th><th className="pr-3">Pago em</th><th>Nota Fiscal</th>
                </tr></thead>
                <tbody>
                  {faturas.map((f) => (
                    <tr key={f.id} className="border-t">
                      <td className="py-1 pr-3 whitespace-nowrap">{data(f.vencimento)}</td>
                      <td className="pr-3">{MODULO[f.modulo] ?? "—"}</td>
                      <td className="pr-3 whitespace-nowrap">{formatCents(f.valor_cents)}</td>
                      <td className="pr-3">
                        {FATURA[f.status] ?? f.status}
                        {f.link && ["open", "overdue"].includes(f.status) && <> · <a className="text-primary underline" href={f.link} target="_blank" rel="noreferrer">Pagar</a></>}
                      </td>
                      <td className="pr-3">{data(f.pago_em)}</td>
                      <td>{f.nf_pdf ? <a className="text-primary underline" href={f.nf_pdf} target="_blank" rel="noreferrer">Nº {f.nf_numero ?? "—"}</a> : (f.nf_status ?? "—")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {acao && <AcaoDialog acao={acao} companyId={selectedCompanyId} onClose={() => setAcao(null)}
        onDone={() => { setAcao(null); qc.invalidateQueries({ queryKey: ["minha-assinatura-v2"] }); }} />}
    </div>
  );
}

function Vazio({ texto, link, planos }: { texto: string; link?: boolean; planos?: boolean }) {
  return (
    <div className="p-4"><Card><CardContent className="space-y-3 p-6">
      <p className="font-medium">{texto}</p>
      {link && <Button asChild variant="outline"><Link to="/empresas">Ir para Empresas</Link></Button>}
      {planos && <Button asChild><Link to="/planos">Conhecer os Planos</Link></Button>}
    </CardContent></Card></div>
  );
}

function Campo({ r, v }: { r: string; v?: string | null }) {
  return <div><p className="text-xs text-muted-foreground">{r}</p><p>{v || "—"}</p></div>;
}

function AssinaturaCard({ s, onAcao }: { s: Json; onAcao: (a: Acao) => void }) {
  const pend = s.pending_plan_change as Json | null;
  const uso = useQuery({
    queryKey: ["uso-assinatura-v2", s.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("billing_v2_uso_assinatura", { _subscription_id: s.id });
      if (error) throw error;
      return (data ?? []) as Json[];
    },
  });
  const recursos = uso.data ?? [];
  // valor da renovação: com troca agendada vale o plano destino; pró-ratas pendentes somam
  const destino = useQuery({
    queryKey: ["destino-v2", s.id, pend?.plano, pend?.ciclo], enabled: !!pend?.plano && s.pode_gerir,
    queryFn: async () => {
      const { data } = await (supabase as any).rpc("billing_v2_plan_change_quote", { _subscription_id: s.id, _plan_slug: pend!.plano, _billing_cycle: pend!.ciclo ?? s.ciclo });
      return data as Json;
    },
  });
  const nomes = useQuery({
    queryKey: ["planos-nomes", s.module],
    queryFn: async () => {
      const { data } = await supabase.from("plans").select("slug,name").eq("module", s.module);
      return Object.fromEntries(((data ?? []) as Json[]).map((p) => [p.slug, p.name])) as Record<string, string>;
    },
  });
  const cobr = useQuery({
    queryKey: ["cobrancas-assinatura-v2", s.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("billing_v2_cobrancas_assinatura", { _subscription_id: s.id });
      if (error) throw error;
      return data as Json;
    },
  });
  const pendentes = ((cobr.data?.pendentes ?? []) as Json[]);
  const excedentes = ((cobr.data?.excedentes ?? []) as Json[]);
  const pendProrata = ((s.proratas_pendentes ?? []) as Json[]).reduce((t, p) => t + (p.valor_cents ?? 0), 0);
  const valorRenovacao = (pend?.plano ? destino.data?.valor_ciclo_novo_cents : null) ?? s.valor_ciclo_cents;
  const ativa = !["canceled", "expired"].includes(s.status);
  return (
    <Card data-testid={`assinatura-${s.module}`}>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">{MODULO[s.module] ?? s.module} · {s.plano?.nome}</CardTitle>
          <Badge variant={s.status === "active" ? "default" : "secondary"}>{STATUS[s.status] ?? s.status}</Badge>
          {s.cancel_at_period_end && <Badge variant="destructive">Cancela em {data(s.current_period_end)}</Badge>}
        </div>
        <CardDescription>
          {ciclo(s.ciclo)} · {formatCents(s.valor_ciclo_cents)} por {s.ciclo === "anual" ? "ano" : "mês"} · ciclo de {data(s.current_period_start)} a {data(s.current_period_end)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <Bloco t="Empresas Cobertas">{(s.empresas ?? []).join(", ") || "—"}</Bloco>

        {!!recursos.length && (
          <Bloco t="Uso do Mês">
            <div className="grid gap-1 sm:grid-cols-2">
              {recursos.map((v) => (
                <span key={v.recurso} data-testid={`uso-${v.recurso}`} className={v.limite != null && v.uso > v.limite ? "text-destructive" : undefined}>
                  {RECURSO[v.recurso] ?? v.recurso}: {v.uso ?? 0} de {v.limite == null || v.limite < 0 ? "ilimitado" : v.limite}
                  {v.adicional ? ` (${v.incluido} do plano + ${v.adicional} adicional)` : ""}
                </span>
              ))}
            </div>
          </Bloco>
        )}

        <Bloco t="Adicionais">
          {(s.adicionais ?? []).length ? (s.adicionais as Json[]).map((a) => (
            <div key={a.id}>{a.nome} × {a.quantidade}{a.cortesia ? " (cortesia)" : ` · ${formatCents(a.preco_cents)}`}</div>
          )) : "Nenhum"}
        </Bloco>

        {!!(s.concessoes ?? []).length && (
          <Bloco t="Concessões">
            {(s.concessoes as Json[]).map((g, i) => (
              <div key={i}>{GRANT[g.tipo] ?? g.tipo}{g.percentual && g.tipo === "desconto_percentual" ? ` de ${g.percentual}%` : ""} · até {g.ends_at ? data(g.ends_at) : "sem data de fim"}</div>
            ))}
          </Bloco>
        )}

        {!!(s.proratas_pendentes ?? []).length && (
          <Bloco t="Pró-ratas Pendentes">
            {(s.proratas_pendentes as Json[]).map((p, i) => (
              <div key={i} data-testid="prorata">{p.adicional}: {formatCents(p.valor_cents)} · entra na próxima fatura</div>
            ))}
          </Bloco>
        )}

        {!!pendentes.length && (
          <Bloco t="Itens da Próxima Fatura">
            {pendentes.map((p, i) => (
              <div key={i} data-testid="item-pendente">{p.descricao}: {formatCents(p.valor_cents)} · {p.cobrado_em ? `somado à mensalidade em ${data(p.cobrado_em)}` : "aguardando a próxima mensalidade"}</div>
            ))}
          </Bloco>
        )}

        {!!excedentes.length && (
          <Bloco t="Colaboradores Excedentes">
            {excedentes.map((e, i) => (
              <div key={i} data-testid="excedente">
                {String(e.competencia).slice(5, 7)}/{String(e.competencia).slice(0, 4)}: {e.contados} contados de {e.limite} da franquia
                {e.excedente > 0 ? ` · ${e.excedente} excedente(s) = ${formatCents(e.valor_cents)}${e.forma === "avulsa" ? " (cobrança avulsa)" : e.forma === "cortesia" ? " (cortesia)" : " (na próxima fatura)"}` : " · sem excedente"}
                {e.detalhe?.variaveis_fora ? ` · ${e.detalhe.variaveis_fora} intermitente(s)/freelancer(s) sem convocação ou escala não contados` : ""}
              </div>
            ))}
          </Bloco>
        )}

        {pend && (
          <Bloco t="Troca Agendada">
            <div data-testid="troca-agendada">
              Para {nomes.data?.[pend.plano] ?? pend.plano ?? "outro plano"} ({ciclo(pend.ciclo ?? s.ciclo)}) na renovação de {data(pend.efetivo_em ?? s.current_period_end)}
            </div>
          </Bloco>
        )}

        <Bloco t="Próxima Fatura">
          {s.proxima_fatura ? (
            <div data-testid="proxima-fatura">
              {formatCents(s.proxima_fatura.valor_cents)} · vence em {data(s.proxima_fatura.vencimento)} · {FATURA[s.proxima_fatura.status] ?? s.proxima_fatura.status}
              {s.proxima_fatura.link && <> · <a className="text-primary underline" href={s.proxima_fatura.link} target="_blank" rel="noreferrer">Pagar</a></>}
            </div>
          ) : <div data-testid="proxima-fatura">{s.cancel_at_period_end ? "Sem próxima fatura (cancelamento agendado)" : `${formatCents((valorRenovacao ?? 0) + pendProrata)} em ${data(s.next_charge_date ?? s.current_period_end)}${pend ? " (já com o plano novo)" : ""}${pendProrata ? ` · inclui ${formatCents(pendProrata)} de pró-rata` : ""}`}</div>}
        </Bloco>

        {s.pode_gerir && ativa && (
          <div className="flex flex-wrap gap-2 border-t pt-3">
            <Button size="sm" variant="outline" onClick={() => onAcao({ tipo: "adicional", sub: s })}>Contratar Adicional</Button>
            <Button size="sm" variant="outline" onClick={() => onAcao({ tipo: "plano", sub: s })}>Trocar Plano ou Ciclo</Button>
            {pend && <Button size="sm" variant="outline" onClick={() => onAcao({ tipo: "cancelar_agendamento", sub: s })}>Cancelar Troca Agendada</Button>}
            {s.cancel_at_period_end
              ? <Button size="sm" variant="outline" onClick={() => onAcao({ tipo: "desfazer_cancelamento", sub: s })}>Manter Assinatura</Button>
              : <Button size="sm" variant="ghost" onClick={() => onAcao({ tipo: "cancelar", sub: s })}>Cancelar no Fim do Ciclo</Button>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Bloco({ t, children }: { t: string; children: React.ReactNode }) {
  return <div><p className="mb-1 text-xs font-medium uppercase text-muted-foreground">{t}</p><div>{children}</div></div>;
}

function AcaoDialog({ acao, companyId, onClose, onDone }: { acao: Acao; companyId: string; onClose: () => void; onDone: () => void }) {
  const s = acao.sub;
  const [code, setCode] = useState<string>((s.adicionais_disponiveis?.[0]?.code as string) ?? "");
  const [qtd, setQtd] = useState(1);
  const [plano, setPlano] = useState<string>(s.plano.slug);
  const [cic, setCic] = useState<string>(s.ciclo);

  const planos = useQuery({
    queryKey: ["planos-modulo", s.module], enabled: acao.tipo === "plano",
    queryFn: async () => {
      const { data } = await supabase.from("plans").select("slug,name,price_monthly_cents,sort_order").eq("module", s.module).eq("is_active", true).order("sort_order");
      return (data ?? []) as Json[];
    },
  });

  const cot = useQuery({
    queryKey: ["cotacao", acao.tipo, s.id, code, qtd, plano, cic],
    enabled: (acao.tipo === "adicional" && !!code) || (acao.tipo === "plano" && (plano !== s.plano.slug || cic !== s.ciclo)),
    queryFn: async () => {
      const r = acao.tipo === "adicional"
        ? await (supabase as any).rpc("billing_v2_addon_quote", { _subscription_id: s.id, _code: code, _qtd: qtd })
        : await (supabase as any).rpc("billing_v2_plan_change_quote", { _subscription_id: s.id, _plan_slug: plano, _billing_cycle: cic });
      if (r.error) throw r.error;
      return r.data as Json;
    },
  });

  const confirmar = useMutation({
    mutationFn: async () => {
      const base = { company_id: companyId, subscription_id: s.id };
      if (acao.tipo === "adicional") return contratar({ ...base, acao: "adicional", code, qtd });
      if (acao.tipo === "plano") return contratar({ ...base, acao: "trocar_plano", plano, ciclo: cic });
      if (acao.tipo === "cancelar_agendamento") return contratar({ ...base, acao: "cancelar_agendamento" });
      return contratar({ ...base, acao: "cancelar_fim_ciclo", desfazer: acao.tipo === "desfazer_cancelamento" });
    },
    onSuccess: () => { toast.success("Assinatura atualizada."); onDone(); },
    onError: (e) => notifyError(e, { surface: "Assinatura", action: "atualizar a assinatura", fallback: "Não foi possível concluir. Tente de novo." }),
  });

  const c = cot.data;
  const precisaCotacao = acao.tipo === "adicional" || acao.tipo === "plano";
  const podeConfirmar = !precisaCotacao || (c?.ok && !cot.isFetching);
  const titulo = {
    adicional: "Contratar Adicional", plano: "Trocar Plano ou Ciclo", cancelar: "Cancelar no Fim do Ciclo",
    desfazer_cancelamento: "Manter Assinatura", cancelar_agendamento: "Cancelar Troca Agendada",
  }[acao.tipo];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{MODULO[s.module]} · {s.plano.nome} ({ciclo(s.ciclo)})</DialogDescription>
        </DialogHeader>

        {acao.tipo === "adicional" && (
          <div className="space-y-2">
            <Select value={code} onValueChange={setCode}>
              <SelectTrigger><SelectValue placeholder="Escolha o adicional" /></SelectTrigger>
              <SelectContent>{(s.adicionais_disponiveis ?? []).map((a: Json) => (
                <SelectItem key={a.code} value={a.code}>{a.nome} · {formatCents(a.preco_cents)}/mês</SelectItem>
              ))}</SelectContent>
            </Select>
            <Input type="number" min={1} max={500} value={qtd} onChange={(e) => setQtd(Math.max(1, Number(e.target.value) || 1))} />
          </div>
        )}
        {acao.tipo === "plano" && (
          <div className="grid gap-2 sm:grid-cols-2">
            <Select value={plano} onValueChange={setPlano}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(planos.data ?? []).map((p) => <SelectItem key={p.slug} value={p.slug}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={cic} onValueChange={setCic}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="mensal">Mensal</SelectItem><SelectItem value="anual">Anual</SelectItem></SelectContent>
            </Select>
          </div>
        )}

        {precisaCotacao && (
          <div className="rounded-md border p-3 text-sm" data-testid="cotacao">
            {cot.isFetching ? "Calculando…" : cot.error ? "Não foi possível calcular o valor agora." : !c ? "Escolha uma opção para ver o valor." : !c.ok ? (
              <span className="text-destructive">{(c.erros ?? c.impeditivos ?? []).map((e: any) => (typeof e === "string" ? e : e.mensagem ?? JSON.stringify(e))).join(" · ") || "Opção não disponível."}</span>
            ) : acao.tipo === "adicional" ? (
              <>
                <div>Valor atual: {formatCents(c.valor_ciclo_atual_cents)} · novo valor: {formatCents(c.valor_ciclo_novo_cents)} por {c.ciclo === "anual" ? "ano" : "mês"}</div>
                <div>Proporcional deste ciclo: {formatCents(c.prorata_cents)} {c.cobranca === "imediata" ? "(cobrado agora)" : c.cobranca === "nenhuma" ? "(cortesia, sem cobrança)" : "(somado à próxima mensalidade)"}</div>
              </>
            ) : (
              <>
                <div>Novo valor: {formatCents(c.valor_ciclo_novo_cents)} por {cic === "anual" ? "ano" : "mês"}</div>
                {!c.imediato ? (
                  <div>Vale a partir de {data(c.efetivo_em ?? s.current_period_end)}, na renovação. Nada é cobrado agora.</div>
                ) : (
                  <div>Crédito do ciclo atual: {formatCents(c.credito_cents)} · cobrado agora: {formatCents(c.cobrar_agora_cents)}</div>
                )}
              </>
            )}
          </div>
        )}
        {acao.tipo === "cancelar" && <p className="text-sm">A assinatura segue ativa até {data(s.current_period_end)} e depois é encerrada. Nada mais será cobrado.</p>}
        {acao.tipo === "desfazer_cancelamento" && <p className="text-sm">O cancelamento agendado é desfeito e a assinatura renova normalmente em {data(s.current_period_end)}.</p>}
        {acao.tipo === "cancelar_agendamento" && <p className="text-sm">A troca agendada é desfeita e o plano atual continua na renovação.</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Voltar</Button>
          <Button disabled={!podeConfirmar || confirmar.isPending} onClick={() => confirmar.mutate()}>Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function docValido(d: string): boolean {
  if (/^(\d)\1+$/.test(d)) return false;
  if (d.length === 11) {
    const dv = (n: number) => { const r = (d.slice(0, n).split("").reduce((t, x, i) => t + Number(x) * (n + 1 - i), 0) * 10) % 11; return r === 10 ? 0 : r; };
    return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
  }
  if (d.length === 14) {
    const calc = (n: number) => { const w = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const r = d.slice(0, n).split("").reduce((t, x, i) => t + Number(x) * w[i], 0) % 11; return r < 2 ? 0 : 11 - r; };
    return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
  }
  return false;
}

function PagadorDialog({ conta, companyId, onClose, onDone }: { conta: Json; companyId: string; onClose: () => void; onDone: () => void }) {
  const [doc, setDoc] = useState<string>(conta.documento_pagador ?? "");
  const [email, setEmail] = useState<string>(conta.email_cobranca ?? "");
  const limpo = doc.replace(/\D/g, "");
  const ok = docValido(limpo) && /^\S+@\S+\.\S+$/.test(email.trim());
  const m = useMutation({
    mutationFn: () => contratar({ acao: "atualizar_pagador", company_id: companyId, documento: limpo, email: email.trim() }),
    onSuccess: () => { toast.success("Dados do pagador atualizados."); onDone(); },
    onError: (e: Error) => toast.error(e.message || "Não foi possível atualizar. Tente novamente."),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Alterar Dados do Pagador</DialogTitle>
          <DialogDescription>As próximas cobranças e notas fiscais saem com estes dados.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><label className="text-sm font-medium" htmlFor="pg-doc">CPF ou CNPJ do pagador</label>
            <Input id="pg-doc" value={doc} onChange={(e) => setDoc(e.target.value)} />
            {!!limpo && !docValido(limpo) && <p className="text-xs text-destructive">Documento inválido. Confira os números.</p>}
          </div>
          <div className="space-y-1"><label className="text-sm font-medium" htmlFor="pg-email">E-mail de cobrança</label>
            <Input id="pg-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Voltar</Button>
          <Button disabled={!ok || m.isPending} onClick={() => m.mutate()}>{m.isPending ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
