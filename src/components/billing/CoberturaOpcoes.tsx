import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Button } from "@/components/ui/button";
import type { ModuloAcesso } from "@/hooks/useModuleAccess";
import { resolverOpcaoUpgrade, type PlanoCatalogo, type SugestaoUpgrade } from "@/lib/billing/coberturaUpgrade";

type Opcoes = {
  pode_gerenciar: boolean;
  assinatura?: { plano: string; empresas_cobertas: number } | null;
  opcoes?: string[];
  custo_mensal_cents?: number;
  prorata_cents?: number;
  sugestao_upgrade?: SugestaoUpgrade | null;
};

const brl = (c?: number | null) =>
  c == null ? "" : (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Opções reais (plan_rule_check) para cobrir a empresa no módulo. */
export function CoberturaOpcoes({ modulo }: { modulo: ModuloAcesso }) {
  const { selectedCompanyId } = useCompanyContext();
  const q = useQuery({
    queryKey: ["coverage-options", selectedCompanyId, modulo],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_company_coverage_options" as any, {
        _company_id: selectedCompanyId,
        _module: modulo,
      });
      if (error) throw error;
      return data as unknown as Opcoes;
    },
  });

  const slugUp = q.data?.sugestao_upgrade?.plano ?? null;
  // O catálogo decide se o upgrade é direto (inclusive Enterprise por colaborador) ou sob consulta.
  const planoUp = useQuery({
    queryKey: ["coverage-upgrade-plano", slugUp],
    enabled: !!slugUp,
    queryFn: async () => {
      const { data, error } = await supabase.from("plans")
        .select("slug,is_enterprise,price_monthly_cents,features").eq("slug", slugUp!).maybeSingle();
      if (error) throw error;
      return (data ?? null) as PlanoCatalogo | null;
    },
  });

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Carregando opções...</p>;
  const d = q.data;
  if (!d) return null;
  if (!d.pode_gerenciar) {
    return (
      <p className="rounded-lg border bg-muted/40 p-4 text-sm">
        Procure o responsável pela empresa para liberar o acesso a este módulo.
      </p>
    );
  }

  const base = `/planos?modulo=${modulo}&empresa=${selectedCompanyId}`;
  const ops = d.opcoes ?? ["conta_separada"];
  const up = d.sugestao_upgrade;

  return (
    <div className="space-y-3">
      {d.assinatura && (
        <p className="text-sm text-muted-foreground">
          Plano atual: <span className="font-medium text-foreground">{d.assinatura.plano}</span> ·{" "}
          {d.assinatura.empresas_cobertas} {d.assinatura.empresas_cobertas === 1 ? "empresa coberta" : "empresas cobertas"}
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {ops.includes("franquia") && (
          <Opcao titulo="Incluir na Franquia" texto="Sem custo adicional: seu plano comporta esta empresa." to={`${base}&acao=franquia`} />
        )}
        {ops.includes("adicional") && (
          <Opcao
            titulo="Empresa Adicional"
            texto={`${brl(d.custo_mensal_cents)}/mês · proporcional nesta fatura: ${brl(d.prorata_cents)}`}
            to={`${base}&acao=adicional`}
          />
        )}
        {ops.includes("upgrade") && up && (
          <OpcaoUpgradeCard up={up} carregando={planoUp.isLoading} catalogo={planoUp.data} to={`${base}&acao=upgrade&plano=${up.plano}`} />
        )}
        {ops.includes("conta_separada") && (
          <Opcao titulo="Contratar Separadamente" texto="Assinatura própria só para esta empresa." to={`${base}&acao=conta_separada`} />
        )}
      </div>
    </div>
  );
}

function OpcaoUpgradeCard({ up, catalogo, carregando, to }: { up: SugestaoUpgrade; catalogo: PlanoCatalogo | null | undefined; carregando: boolean; to: string }) {
  if (carregando) return <Opcao titulo={`Upgrade para ${up.nome}`} texto="Carregando valores..." />;
  const r = resolverOpcaoUpgrade(up, catalogo);
  return r.tipo === "direto"
    ? <Opcao titulo={`Upgrade para ${up.nome}`} texto={r.texto} to={to} />
    : <Opcao titulo={`Upgrade para ${up.nome}`} texto={r.texto} href="https://wa.me/5562992365959" />;
}

function Opcao({ titulo, texto, to, href }: { titulo: string; texto: string; to?: string; href?: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <p className="text-sm font-semibold">{titulo}</p>
      <p className="flex-1 text-xs text-muted-foreground">{texto}</p>
      <Button asChild size="sm" variant="outline" disabled={!href && !to}>
        {href ? <a href={href} target="_blank" rel="noopener noreferrer">Falar Agora</a> : to ? <Link to={to}>Escolher</Link> : <span>Aguarde</span>}
      </Button>
    </div>
  );
}
