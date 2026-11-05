import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Store, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/contexts/CompanyContext";

/** Estado vazio: sugere criar a primeira loja com os dados da empresa (mesmo CNPJ). */
export function CriarUnidadeInicial({ onManual }: { onManual: () => void }) {
  const { companies, selectedCompanyId } = useCompanyContext() as unknown as {
    companies: { id: string; name: string; trade_name?: string | null }[];
    selectedCompanyId?: string | null;
  };
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const empresa = companies.find((c) => c.id === selectedCompanyId) ?? companies[0];

  const criar = async () => {
    if (!empresa) return;
    setLoading(true);
    const { error } = await supabase.rpc("dp_criar_unidade_inicial", { p_company_id: empresa.id });
    setLoading(false);
    if (error) {
      toast.error(error.message.includes("sem_permissao") ? "Você não tem permissão para cadastrar unidades." : "Não foi possível criar a unidade.");
      return;
    }
    toast.success("Unidade criada com os dados da empresa.");
    qc.invalidateQueries({ queryKey: ["dp_unidades"] });
  };

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <Store className="h-8 w-8 text-primary" />
      <p className="text-sm font-medium text-foreground">Nenhuma unidade cadastrada.</p>
      {empresa && (
        <p className="text-xs text-muted-foreground max-w-sm">
          A loja usa o mesmo CNPJ e endereço de {empresa.trade_name || empresa.name}? Crie a primeira unidade em um toque.
        </p>
      )}
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
        {empresa && (
          <Button onClick={criar} disabled={loading} className="min-h-11">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Usar Dados da Empresa
          </Button>
        )}
        <Button variant="outline" onClick={onManual} className="min-h-11">Cadastrar Outra Unidade</Button>
      </div>
    </div>
  );
}
