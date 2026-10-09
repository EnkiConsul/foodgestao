import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Button } from "@/components/ui/button";
import type { ModuloAcesso } from "@/hooks/useModuleAccess";

type Opcoes = {
  pode_gerenciar: boolean;
  assinatura?: { plano: string; empresas_cobertas: number } | null;
  opcoes?: string[];
  custo_mensal_cents?: number;
  prorata_cents?: number;
  sugestao_upgrade?: { plano: string; nome: string; preco_mensal_cents: number | null; enterprise: boolean } | null;
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
          up.enterprise ? (
            <Opcao titulo={`Upgrade para ${up.nome}`} texto="Fale com nosso especialista." href="https://wa.me/5562992365959" />
          ) : (
            <Opcao titulo={`Upgrade para ${up.nome}`} texto={`${brl(up.preco_mensal_cents)}/mês`} to={`${base}&acao=upgrade&plano=${up.plano}`} />
          )
        )}
        {ops.includes("conta_separada") && (
          <Opcao titulo="Contratar Separadamente" texto="Assinatura própria só para esta empresa." to={`${base}&acao=conta_separada`} />
        )}
      </div>
    </div>
  );
}

function Opcao({ titulo, texto, to, href }: { titulo: string; texto: string; to?: string; href?: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <p className="text-sm font-semibold">{titulo}</p>
      <p className="flex-1 text-xs text-muted-foreground">{texto}</p>
      <Button asChild size="sm" variant="outline">
        {href ? <a href={href} target="_blank" rel="noopener noreferrer">Falar Agora</a> : <Link to={to!}>Escolher</Link>}
      </Button>
    </div>
  );
}
