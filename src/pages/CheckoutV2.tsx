import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatCents } from "@/lib/billing";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { AlertTriangle, Check, MessageCircle } from "lucide-react";

type Modulo = "financeiro" | "pessoas";
type Ciclo = "mensal" | "anual";
type Forma = "pix" | "boleto" | "cartao";
type Json = Record<string, any>;

const MODULOS: { id: Modulo; nome: string; texto: string }[] = [
  { id: "financeiro", nome: "Financeiro 360°", texto: "Contas, conciliação, fluxo de caixa e relatórios." },
  { id: "pessoas", nome: "Pessoas 360°", texto: "Colaboradores, documentos, folgas, escalas e portal." },
];
const FORMAS: { id: Forma; nome: string }[] = [
  { id: "pix", nome: "Pix" }, { id: "boleto", nome: "Boleto" }, { id: "cartao", nome: "Cartão de Crédito" },
];

async function chamar(body: Json) {
  const { data, error } = await supabase.functions.invoke("billing-v2-contratar", { body });
  if (error) {
    let msg = error.message;
    try { msg = (await (error as any).context?.json())?.error ?? msg; } catch { /* */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

function Passo({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">{n}</span>
          {titulo}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

function Opcao({ ativo, onClick, children, disabled, testid }: { ativo: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean; testid?: string }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} data-testid={testid}
      className={cn("w-full rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        ativo ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50")}>
      {children}
    </button>
  );
}

/** Checkout v2: só é montado com checkout_v2 = 'v2' (PlanosGate). Valores sempre vêm do servidor. */
export default function CheckoutV2() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { selectedCompanyId, companies } = useCompanyContext();
  const companyId = params.get("empresa") || selectedCompanyId;
  const empresaNome = (companies as any[]).find((c) => c.id === companyId)?.name;

  const [modulo, setModulo] = useState<Modulo | null>((params.get("modulo") as Modulo) || null);
  const [plano, setPlano] = useState<string | null>(params.get("plano"));
  const [ciclo, setCiclo] = useState<Ciclo>("mensal");
  const [modo, setModo] = useState<"empresa" | "grupo">("empresa");
  const [adicionais, setAdicionais] = useState<Record<string, number>>({});
  const [doc, setDoc] = useState("");
  const [email, setEmail] = useState("");
  const [forma, setForma] = useState<Forma>("pix");
  const [parcelas, setParcelas] = useState(1);
  const [aceite, setAceite] = useState(false);

  const catalogo = useQuery({
    queryKey: ["checkout-v2-catalogo"],
    queryFn: async () => {
      const [p, l, a] = await Promise.all([
        supabase.from("plans").select("*").eq("is_active", true).eq("is_public", true).order("sort_order"),
        supabase.from("plan_limits").select("*"),
        supabase.from("plan_addons").select("*").eq("is_active", true),
      ]);
      if (p.error) throw p.error;
      return { planos: (p.data ?? []) as Json[], limites: (l.data ?? []) as Json[], addons: (a.data ?? []) as Json[] };
    },
  });

  const conta = useQuery({
    queryKey: ["checkout-v2-conta", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data: v } = await supabase.from("billing_account_companies" as any).select("billing_account_id")
        .eq("company_id", companyId!).is("removed_at", null).maybeSingle();
      if (!v) return null;
      const id = (v as any).billing_account_id;
      const [{ data: ba }, { count }] = await Promise.all([
        supabase.from("billing_accounts" as any).select("id,nome,tipo,documento_pagador,email_cobranca,asaas_customer_id").eq("id", id).maybeSingle(),
        supabase.from("billing_account_companies" as any).select("company_id", { count: "exact", head: true }).eq("billing_account_id", id).is("removed_at", null),
      ]);
      return { ...(ba as any), empresas: count ?? 1 } as Json;
    },
  });

  useEffect(() => {
    if (conta.data) {
      setDoc((d) => d || conta.data!.documento_pagador || "");
      setEmail((e) => e || conta.data!.email_cobranca || "");
    }
  }, [conta.data]);

  const planos = useMemo(() => (catalogo.data?.planos ?? []).filter((p) => p.module === modulo), [catalogo.data, modulo]);
  const planoSel = planos.find((p) => p.slug === plano);
  const limEmpresas = catalogo.data?.limites.find((l) => l.plan_id === planoSel?.id && l.recurso === "empresas");
  const permiteGrupo = !!planoSel && ((limEmpresas?.incluido ?? 1) > 1 || !!limEmpresas?.permite_adicional);
  const gerenciaveis = useQuery({
    queryKey: ["checkout-v2-gerenciaveis"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("billing_v2_empresas_gerenciaveis");
      if (error) throw error;
      return (data ?? []) as Json[];
    },
  });
  // Grupo: aparece com 2+ empresas gerenciadas e plano multiempresa, mesmo que hoje estejam em contas separadas
  const empresasGer = (gerenciaveis.data ?? []).filter((e) => !!e.billing_account_id);
  const contaGrupo = empresasGer.length >= 2;
  const [selGrupo, setSelGrupo] = useState<string[]>([]);
  useEffect(() => { if (companyId) setSelGrupo((s) => (s.includes(companyId) ? s : [companyId, ...s])); }, [companyId]);
  const empresasCobertas = modo === "grupo" ? Math.max(1, selGrupo.length) : 1;
  const addons = (catalogo.data?.addons ?? []).filter((a) => a.module === modulo && a.code !== "empresas"
    && (!a.allowed_plan_slugs || (plano && a.allowed_plan_slugs.includes(plano))));
  const listaAdicionais = Object.entries(adicionais).filter(([, q]) => q > 0).map(([code, qtd]) => ({ code, qtd }));

  useEffect(() => { if (!permiteGrupo || !contaGrupo) setModo("empresa"); }, [permiteGrupo, contaGrupo]);
  useEffect(() => { if (ciclo !== "anual" || forma !== "cartao") setParcelas(1); }, [ciclo, forma]);

  const itens = { modulos: [{ plano, empresas: empresasCobertas, adicionais: listaAdicionais }] };
  const cotacao = useQuery({
    queryKey: ["checkout-v2-quote", conta.data?.id, plano, ciclo, empresasCobertas, JSON.stringify(listaAdicionais)],
    enabled: !!conta.data?.id && !!plano,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("billing_v2_quote", {
        _billing_account_id: conta.data!.id, _itens: itens, _billing_cycle: ciclo === "anual" ? "yearly" : "monthly",
      });
      if (error) throw error;
      return data as Json;
    },
  });
  // Economia anual mostrada no passo do ciclo (cotação do plano puro nos dois ciclos)
  const economia = useQuery({
    queryKey: ["checkout-v2-economia", conta.data?.id, plano],
    enabled: !!conta.data?.id && !!plano,
    queryFn: async () => {
      const it = { modulos: [{ plano, empresas: 1, adicionais: [] }] };
      const [m, a] = await Promise.all(["monthly", "yearly"].map((c) =>
        (supabase as any).rpc("billing_v2_quote", { _billing_account_id: conta.data!.id, _itens: it, _billing_cycle: c })));
      return { mensal: m.data?.total_ciclo_cents ?? 0, anual: a.data?.total_ciclo_cents ?? 0 };
    },
  });
  const parcelamento = useQuery({
    queryKey: ["checkout-v2-parcelas", cotacao.data?.total_ciclo_cents],
    enabled: ciclo === "anual" && forma === "cartao" && !!cotacao.data?.ok,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("billing_v2_parcelamento", { _valor_cents: cotacao.data!.total_ciclo_cents });
      if (error) throw error;
      return data as { parcelas: number; valor_parcela_cents: number; total_cents: number; juros_cents: number }[];
    },
  });

  const docLimpo = doc.replace(/\D/g, "");
  const docOk = docLimpo.length === 11 || docLimpo.length === 14;
  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());
  const pronto = !!planoSel && cotacao.data?.ok && docOk && emailOk && aceite && (modo !== "grupo" || selGrupo.length >= 2);

  const enviar = useMutation({
    mutationFn: () => chamar({
      acao: "contratar", company_id: companyId, plano, ciclo, forma, modo,
      empresas: modo === "grupo" ? selGrupo : undefined,
      parcelas: parcelas > 1 ? parcelas : undefined, adicionais: listaAdicionais,
      pagador: { documento: docLimpo, email: email.trim() },
    }),
    onSuccess: () => { toast.success("Contratação registrada. A cobrança foi enviada para o e-mail do pagador."); navigate("/assinatura"); },
    onError: (e: Error) => toast.error(e.message || "Não foi possível concluir. Tente novamente."),
  });

  if (!companyId) {
    return <Alert><AlertDescription>Selecione uma empresa para contratar. <Link className="underline" to="/empresas">Abrir Empresas</Link></AlertDescription></Alert>;
  }
  if (catalogo.isLoading || conta.isLoading) return <Skeleton className="h-96 w-full" />;
  if (!conta.data) {
    return <Alert><AlertDescription>Esta empresa ainda não tem conta de cobrança. Fale com o suporte para liberar a contratação.</AlertDescription></Alert>;
  }

  const anualParc = parcelamento.data?.find((o) => o.parcelas === parcelas);

  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Contratar</h1>
          <p className="text-sm text-muted-foreground">Empresa: <span className="font-medium text-foreground">{empresaNome ?? "—"}</span> · Conta de cobrança: {conta.data.nome}</p>
        </div>

        <Passo n={1} titulo="Módulo">
          <div className="grid gap-2 sm:grid-cols-2">
            {MODULOS.map((m) => (
              <Opcao key={m.id} testid={`modulo-${m.id}`} ativo={modulo === m.id} onClick={() => { setModulo(m.id); setPlano(null); setAdicionais({}); }}>
                <p className="font-medium">{m.nome}</p><p className="text-xs text-muted-foreground">{m.texto}</p>
              </Opcao>
            ))}
          </div>
        </Passo>

        {modulo && (
          <Passo n={2} titulo="Plano">
            <div className="grid gap-2 sm:grid-cols-2">
              {planos.map((p) => p.is_enterprise ? (
                <div key={p.slug} className="rounded-lg border p-3">
                  <p className="font-medium">{p.name}</p>
                  <a className="mt-1 inline-flex items-center gap-1 text-xs text-primary underline" href="https://wa.me/5562992365959" target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="h-3 w-3" /> Fale com nosso especialista
                  </a>
                </div>
              ) : (
                <Opcao key={p.slug} testid={`plano-${p.slug}`} ativo={plano === p.slug} onClick={() => { setPlano(p.slug); setAdicionais({}); }}>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-sm">{formatCents(p.price_monthly_cents)}<span className="text-xs text-muted-foreground">/mês</span></p>
                </Opcao>
              ))}
            </div>
          </Passo>
        )}

        {planoSel && (
          <>
            <Passo n={3} titulo="Ciclo">
              <div className="grid gap-2 sm:grid-cols-2">
                <Opcao testid="ciclo-mensal" ativo={ciclo === "mensal"} onClick={() => setCiclo("mensal")}>
                  <p className="font-medium">Mensal</p><p className="text-xs text-muted-foreground">{formatCents(economia.data?.mensal)}/mês</p>
                </Opcao>
                <Opcao testid="ciclo-anual" ativo={ciclo === "anual"} onClick={() => setCiclo("anual")}>
                  <p className="font-medium">Anual</p>
                  <p className="text-xs text-muted-foreground">{formatCents(economia.data?.anual)}/ano</p>
                  {!!economia.data && economia.data.mensal * 12 > economia.data.anual && (
                    <Badge variant="secondary" className="mt-1">Economia de {formatCents(economia.data.mensal * 12 - economia.data.anual)} no ano</Badge>
                  )}
                </Opcao>
              </div>
            </Passo>

            <Passo n={4} titulo="Empresas Cobertas">
              <div className="grid gap-2 sm:grid-cols-2">
                <Opcao testid="modo-empresa" ativo={modo === "empresa"} onClick={() => setModo("empresa")}>
                  <p className="font-medium">Por Empresa</p><p className="text-xs text-muted-foreground">Cobre somente {empresaNome ?? "esta empresa"}.</p>
                </Opcao>
                {permiteGrupo && contaGrupo && (
                  <Opcao testid="modo-grupo" ativo={modo === "grupo"} onClick={() => setModo("grupo")}>
                    <p className="font-medium">Grupo</p><p className="text-xs text-muted-foreground">Uma assinatura para as empresas que você escolher.</p>
                  </Opcao>
                )}
              </div>
              {!permiteGrupo && <p className="text-xs text-muted-foreground">Este plano cobre uma única empresa.</p>}
              {modo === "grupo" && (
                <div className="space-y-1 rounded-lg border p-3" data-testid="grupo-empresas">
                  <p className="text-sm font-medium">Empresas do grupo</p>
                  {empresasGer.map((e) => (
                    <label key={e.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={selGrupo.includes(e.id)} disabled={e.id === companyId}
                        onChange={(ev) => setSelGrupo((s) => ev.target.checked ? [...s, e.id] : s.filter((x) => x !== e.id))} />
                      {e.nome}{e.billing_account_id !== conta.data?.id ? " · hoje em conta própria (será agrupada)" : ""}
                    </label>
                  ))}
                  <p className="text-xs text-muted-foreground">Só as empresas marcadas entram no grupo. Nenhuma empresa é juntada sem a sua escolha.</p>
                </div>
              )}
              {modo === "grupo" && (
                <Alert><AlertTriangle className="h-4 w-4" /><AlertDescription>
                  Aviso fiscal: no modo Grupo a cobrança e a nota fiscal saem em nome de um único pagador (o CPF/CNPJ informado abaixo), mesmo cobrindo várias empresas. Confirme com sua contabilidade.
                </AlertDescription></Alert>
              )}
            </Passo>

            <Passo n={5} titulo="Adicionais (opcional)">
              {addons.length === 0 && <p className="text-sm text-muted-foreground">Nenhum adicional para este plano.</p>}
              {addons.map((a) => (
                <div key={a.code} className="flex items-center justify-between gap-3">
                  <div><p className="text-sm font-medium">{a.name}</p><p className="text-xs text-muted-foreground">{formatCents(a.price_cents)}/mês cada</p></div>
                  <Input type="number" min={0} max={500} className="w-24" value={adicionais[a.code] ?? 0} aria-label={a.name}
                    onChange={(e) => setAdicionais((s) => ({ ...s, [a.code]: Math.max(0, Math.min(500, Number(e.target.value) || 0)) }))} />
                </div>
              ))}
            </Passo>

            <Passo n={6} titulo="Dados do Pagador">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="doc">CNPJ ou CPF</Label>
                  <Input id="doc" value={doc} onChange={(e) => setDoc(e.target.value)} disabled={!!conta.data.asaas_customer_id} />
                  {doc && !docOk && <p className="text-xs text-destructive">Informe 11 (CPF) ou 14 (CNPJ) dígitos.</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="email">E-mail de Cobrança</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!!conta.data.asaas_customer_id} />
                </div>
              </div>
              {conta.data.asaas_customer_id && <p className="text-xs text-muted-foreground">Pagador já cadastrado nesta conta de cobrança.</p>}
            </Passo>

            <Passo n={7} titulo="Forma de Pagamento">
              <div className="grid gap-2 sm:grid-cols-3">
                {FORMAS.map((f) => (
                  <Opcao key={f.id} testid={`forma-${f.id}`} ativo={forma === f.id} onClick={() => setForma(f.id)}><p className="font-medium">{f.nome}</p></Opcao>
                ))}
              </div>
              {ciclo === "anual" && forma === "cartao" && (
                <div className="space-y-1" data-testid="parcelas">
                  <p className="text-sm font-medium">Parcelas</p>
                  {parcelamento.isLoading && <Skeleton className="h-24" />}
                  <div className="grid gap-1 sm:grid-cols-2">
                    {(parcelamento.data ?? []).map((o) => (
                      <Opcao key={o.parcelas} testid={`parcela-${o.parcelas}`} ativo={parcelas === o.parcelas} onClick={() => setParcelas(o.parcelas)}>
                        <p className="text-sm"><span className="font-medium">{o.parcelas}x de {formatCents(o.valor_parcela_cents)}</span></p>
                        <p className="text-xs text-muted-foreground">Total {formatCents(o.total_cents)}{o.juros_cents > 0 ? ` (juros do cartão ${formatCents(o.juros_cents)})` : " sem juros"}</p>
                      </Opcao>
                    ))}
                  </div>
                </div>
              )}
            </Passo>
          </>
        )}
      </div>

      <div className="lg:sticky lg:top-4 lg:self-start">
        <Card data-testid="resumo">
          <CardHeader><CardTitle className="text-base">Resumo</CardTitle><CardDescription>Valores calculados pelo servidor.</CardDescription></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {!planoSel && <p className="text-muted-foreground">Escolha o módulo e o plano.</p>}
            {cotacao.isLoading && <Skeleton className="h-24" />}
            {cotacao.data && (
              <>
                {(cotacao.data.itens ?? []).map((i: Json, k: number) => (
                  <div key={k} className="flex justify-between gap-2">
                    <span>{i.descricao}{i.quantidade > 1 ? ` × ${i.quantidade}` : ""}</span>
                    <span className="whitespace-nowrap">{formatCents(i.total_cents)}</span>
                  </div>
                ))}
                {(cotacao.data.erros ?? []).map((e: string) => <p key={e} className="text-xs text-destructive">{e}</p>)}
                {(cotacao.data.sugestoes_upgrade ?? []).map((s: Json) => <p key={s.para} className="text-xs text-muted-foreground">{s.mensagem}</p>)}
                <div className="flex justify-between border-t pt-2 font-semibold">
                  <span>Total {ciclo === "anual" ? "do ano" : "por mês"}</span>
                  <span data-testid="total">{formatCents(cotacao.data.total_ciclo_cents)}</span>
                </div>
                {anualParc && parcelas > 1 && (
                  <p className="text-xs" data-testid="resumo-parcelas">{parcelas}x de {formatCents(anualParc.valor_parcela_cents)} · total no cartão {formatCents(anualParc.total_cents)}</p>
                )}
              </>
            )}
            <label className="flex items-start gap-2 text-xs">
              <Checkbox checked={aceite} onCheckedChange={(v) => setAceite(!!v)} aria-label="Aceite" />
              <span>Li e aceito os <Link to="/termos" className="underline" target="_blank">Termos de Uso</Link> e autorizo a cobrança {ciclo === "anual" ? "anual" : "mensal"} recorrente.</span>
            </label>
            <Button className="w-full" disabled={!pronto || enviar.isPending} onClick={() => enviar.mutate()} data-testid="confirmar">
              {enviar.isPending ? "Enviando..." : <><Check className="mr-1 h-4 w-4" /> Confirmar Contratação</>}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
