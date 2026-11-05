import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, FileUp, Send, UserPlus, Store, Rocket } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Button } from "@/components/ui/button";

/**
 * Primeiros passos do Pessoas 360°: aparece só enquanto a empresa não tem
 * nenhum colaborador. Destaque para a Importação de Fichas (equipe existente);
 * Pré-Admissão e cadastro manual continuam disponíveis.
 */
export function DpPrimeirosPassosCard() {
  const { selectedCompanyId } = useCompanyContext();
  const { data } = useQuery({
    queryKey: ["dp-primeiros-passos", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const [col, uni] = await Promise.all([
        supabase.from("dp_colaboradores").select("id", { count: "exact", head: true }).eq("company_id", selectedCompanyId!),
        supabase.from("dp_unidades").select("id", { count: "exact", head: true }).eq("company_id", selectedCompanyId!),
      ]);
      if (col.error) throw col.error;
      return { colaboradores: col.count ?? 0, unidades: uni.count ?? 0 };
    },
  });

  if (!data || data.colaboradores > 0) return null;
  const temUnidade = data.unidades > 0;

  return (
    <section aria-label="Primeiros passos" className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold text-foreground">
          <Rocket className="h-5 w-5 text-primary" aria-hidden="true" /> Primeiros passos
        </h2>
        <span className="text-xs text-muted-foreground">Passo {temUnidade ? 2 : 1} de 2</span>
      </div>

      <div className="flex items-start gap-3 rounded-lg bg-background p-3">
        {temUnidade
          ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          : <Store className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">1. Loja cadastrada</p>
          {!temUnidade && (
            <Button asChild size="sm" variant="outline" className="mt-2 h-10">
              <Link to="/dp/unidades">Cadastrar loja</Link>
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-lg bg-background p-3 space-y-2">
        <p className="text-sm font-medium text-foreground">2. Traga sua equipe</p>
        <Button asChild size="lg" className="h-12 w-full justify-start">
          <Link to="/dp/colaboradores/importar-ficha">
            <FileUp className="mr-2 h-5 w-5" aria-hidden="true" />
            <span className="flex flex-col items-start leading-tight">
              <span>Importar Fichas de Registro</span>
              <span className="text-xs font-normal opacity-90">Mais rápido: envie as fichas da contabilidade</span>
            </span>
          </Link>
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button asChild variant="outline" className="h-11">
            <Link to="/dp/colaboradores/pre-admissoes"><Send className="mr-1.5 h-4 w-4" />Pré-Admissão</Link>
          </Button>
          <Button asChild variant="outline" className="h-11">
            <Link to="/dp/colaboradores"><UserPlus className="mr-1.5 h-4 w-4" />Cadastro manual</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
