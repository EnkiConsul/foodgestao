import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCents, formatLimit } from "@/lib/billing";
import { useMinhasAssinaturas, type Modulo } from "@/hooks/useMinhaAssinatura";
import { cn } from "@/lib/utils";
import { ArrowRight, Check, MessageCircle, ShieldCheck, Sparkles } from "lucide-react";

const MODULO_ROTULO: Record<Modulo, string> = {
  financeiro: "Financeiro 360°",
  pessoas: "Pessoas 360°",
};

const WHATSAPP = "5562992365959";

/** Recursos exibidos no cartão, por módulo, na ordem de leitura. */
const RECURSOS: Record<Modulo, Array<{ campo: string; rotulo: string }>> = {
  financeiro: [
    { campo: "max_companies", rotulo: "empresas" },
    { campo: "max_users", rotulo: "usuários" },
    { campo: "max_open_finance", rotulo: "conexões bancárias" },
    { campo: "accountant_seats", rotulo: "acessos para a contabilidade" },
  ],
  pessoas: [
    { campo: "max_collaborators", rotulo: "colaboradores" },
    { campo: "max_units", rotulo: "unidades" },
    { campo: "max_users", rotulo: "usuários" },
    { campo: "accountant_seats", rotulo: "acessos para a contabilidade" },
  ],
};

/** Catálogo público de planos ativos. */
function usePlanosPublicos() {
  return useQuery({
    queryKey: ["planos-publicos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select("*")
        .eq("is_active", true)
        .eq("is_public", true)
        .order("module")
        .order("sort_order");
      if (error) throw error;
      return data as any[];
    },
  });
}

function CartaoPlano({
  plano,
  atual,
  temAssinatura,
}: {
  plano: any;
  atual: boolean;
  temAssinatura: boolean;
}) {
  const navigate = useNavigate();
  const f = plano.features ?? {};
  const modulo = plano.module as Modulo;
  const destaque = !!plano.is_featured && !atual;
  const msg = encodeURIComponent(
    `Olá! Tenho interesse no plano ${plano.name} do Aveto 360.`,
  );

  return (
    <Card
      className={cn(
        "relative flex flex-col",
        atual && "border-2 border-primary",
        destaque && "border-primary shadow-lg ring-1 ring-primary/30",
      )}
    >
      {destaque && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
          {plano.featured_label || "Mais Recomendado"}
        </Badge>
      )}
      <CardHeader className="space-y-1 pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{plano.name}</CardTitle>
          {atual && <Badge variant="secondary">Plano atual</Badge>}
        </div>
        <CardDescription className="min-h-[2.25rem]">{plano.description}</CardDescription>
        <div className="pt-1">
          {plano.is_enterprise ? (
            <span className="text-2xl font-bold">Sob consulta</span>
          ) : (
            <>
              <span className="text-2xl font-bold">{formatCents(plano.price_cents)}</span>
              <span className="text-sm text-muted-foreground">/mês</span>
            </>
          )}
        </div>
        {!plano.is_enterprise && plano.trial_days > 0 && (
          <p className="text-xs font-medium text-primary">
            {plano.trial_days} dias de teste grátis
          </p>
        )}
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4">
        <ul className="flex-1 space-y-2 text-sm">
          {RECURSOS[modulo].map(({ campo, rotulo }) => (
            <li key={campo} className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                {formatLimit(f[campo] ?? -1)} {rotulo}
              </span>
            </li>
          ))}
          <li className="flex gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>Suporte por WhatsApp</span>
          </li>
        </ul>

        {plano.is_enterprise ? (
          <Button variant="outline" asChild className="w-full">
            <a href={`https://wa.me/${WHATSAPP}?text=${msg}`} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="mr-2 h-4 w-4" /> Falar com um consultor
            </a>
          </Button>
        ) : atual ? (
          <Button variant="outline" className="w-full" disabled>
            Plano atual
          </Button>
        ) : (
          <Button className="w-full" onClick={() => navigate(`/checkout/${plano.slug}`)}>
            {temAssinatura ? "Mudar para este plano" : "Contratar"}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default function Planos() {
  const [params] = useSearchParams();
  const { data: planos, isLoading } = usePlanosPublicos();
  const { data: assinaturas } = useMinhasAssinaturas();

  const moduloInicial = (params.get("modulo") === "pessoas" ? "pessoas" : "financeiro") as Modulo;
  const [aba, setAba] = useState<Modulo>(moduloInicial);

  const porModulo = useMemo(() => {
    const mapa: Record<Modulo, any[]> = { financeiro: [], pessoas: [] };
    (planos ?? []).forEach((p: any) => {
      if (p.module === "financeiro" || p.module === "pessoas") mapa[p.module as Modulo].push(p);
    });
    return mapa;
  }, [planos]);

  const planoAtualPorModulo = useMemo(() => {
    const mapa: Partial<Record<Modulo, string>> = {};
    (assinaturas ?? []).forEach((a) => {
      const m = (a.module ?? a.plan?.module) as Modulo | undefined;
      if (m && a.plan?.id && !["canceled", "expired"].includes(a.status)) mapa[m] = a.plan.id;
    });
    return mapa;
  }, [assinaturas]);

  const isento = (assinaturas ?? []).some((a) => a.is_exempt);

  return (
    <div className="mx-auto max-w-6xl space-y-4 md:space-y-6">
      <Helmet>
        <title>Planos e Preços — Aveto 360</title>
        <meta
          name="description"
          content="Conheça os planos do Financeiro 360° e do Pessoas 360°, com 7 dias de teste grátis."
        />
      </Helmet>

      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight md:text-2xl">
          <Sparkles className="h-5 w-5 text-primary" /> Planos e Preços
        </h1>
        <p className="text-xs text-muted-foreground md:text-sm">
          Escolha o plano de cada módulo. Você pode mudar de plano ou ampliar limites quando quiser.
        </p>
      </div>

      {isento && (
        <p className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          Sua conta está liberada como cortesia hoje. Você pode conhecer os planos sem nenhuma cobrança
          automática.
        </p>
      )}

      <Tabs value={aba} onValueChange={(v) => setAba(v as Modulo)}>
        <TabsList>
          <TabsTrigger value="financeiro">{MODULO_ROTULO.financeiro}</TabsTrigger>
          <TabsTrigger value="pessoas">{MODULO_ROTULO.pessoas}</TabsTrigger>
        </TabsList>

        {(["financeiro", "pessoas"] as Modulo[]).map((m) => (
          <TabsContent key={m} value={m} className="mt-4">
            {isLoading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-72 w-full" />
                ))}
              </div>
            ) : porModulo[m].length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum plano disponível neste momento.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {porModulo[m].map((p: any) => (
                  <CartaoPlano
                    key={p.id}
                    plano={p}
                    atual={planoAtualPorModulo[m] === p.id}
                    temAssinatura={!!planoAtualPorModulo[m]}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="text-sm font-medium">Precisa apenas de mais limites?</p>
            <p className="text-xs text-muted-foreground">
              Contrate unidades, colaboradores ou conexões bancárias extras sem trocar de plano.
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link to="/assinatura">Ver meu plano e adicionais</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
