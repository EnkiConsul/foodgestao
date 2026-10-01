import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserCog } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DpContentCard } from "@/components/dp/DpPage";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDpUnidades } from "@/hooks/useDpCadastros";

interface ColabRow {
  id: string;
  nome: string;
  sexo: string | null;
  unidade_id: string | null;
  domingos_folga_mes: number | null;
}

const SEXO_LABEL: Record<string, string> = { F: "Feminino", M: "Masculino", outro: "Outro" };

/**
 * Exceções individuais de domingos de folga por mês, cadastradas junto das
 * regras da unidade para que regra e exceção fiquem na mesma tela.
 */
export function ExcecoesDomingoPanel() {
  const qc = useQueryClient();
  const { data: unidades = [] } = useDpUnidades();
  const [unidade, setUnidade] = useState("todas");
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState<string | null>(null);

  const { data: colabs = [], isLoading } = useQuery({
    queryKey: ["dp-excecoes-domingo"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_colaboradores")
        .select("id, nome, sexo, unidade_id, domingos_folga_mes")
        .eq("ativo", true)
        .is("deleted_at", null)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as ColabRow[];
    },
  });

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return colabs.filter(
      (c) =>
        (unidade === "todas" || c.unidade_id === unidade) &&
        (!t || c.nome.toLowerCase().includes(t)),
    );
  }, [colabs, unidade, busca]);

  const ativas = colabs.filter((c) => c.domingos_folga_mes != null).length;

  const definir = async (c: ColabRow, v: string) => {
    const valor = v === "padrao" ? null : Number(v);
    setSalvando(c.id);
    const { error } = await supabase.rpc("dp_colaborador_definir_domingos_folga" as never, {
      _colaborador_id: c.id,
      _domingos: valor,
    } as never);
    setSalvando(null);
    if (error) {
      toast.error(error.message || "Não foi possível salvar a exceção");
      return;
    }
    toast.success(valor ? `${c.nome}: ${valor} domingo(s) por mês` : `${c.nome}: segue a regra da unidade`);
    void qc.invalidateQueries({ queryKey: ["dp-excecoes-domingo"] });
  };

  const nomeUnidade = (id: string | null) => unidades.find((u) => u.id === id)?.nome ?? "—";

  return (
    <DpContentCard contentClassName="space-y-4 p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <UserCog className="h-4 w-4" aria-hidden="true" />
            Exceções por Colaborador
          </h2>
          <p className="text-xs text-muted-foreground">
            Domingos de folga por mês que valem para a pessoa no lugar da regra da unidade
            (ex.: 2 por mês pelo Art. 386 da CLT). A ficha do colaborador apenas sinaliza a exceção.
          </p>
        </div>
        <Badge variant="secondary">{ativas} exceção(ões) ativa(s)</Badge>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Select value={unidade} onValueChange={setUnidade}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as unidades</SelectItem>
            {unidades.map((u) => (
              <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input placeholder="Buscar colaborador" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : filtrados.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum colaborador encontrado.</p>
      ) : (
        <ul className="max-h-[420px] divide-y overflow-y-auto rounded-md border">
          {filtrados.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{c.nome}</p>
                <p className="text-xs text-muted-foreground">
                  {nomeUnidade(c.unidade_id)} · {c.sexo ? SEXO_LABEL[c.sexo] ?? c.sexo : "Gênero não informado"}
                </p>
              </div>
              <Select
                value={c.domingos_folga_mes != null ? String(c.domingos_folga_mes) : "padrao"}
                onValueChange={(v) => void definir(c, v)}
                disabled={salvando === c.id}
              >
                <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="padrao">Regra da unidade</SelectItem>
                  <SelectItem value="1">Exceção: 1 por mês</SelectItem>
                  <SelectItem value="2">Exceção: 2 por mês</SelectItem>
                </SelectContent>
              </Select>
            </li>
          ))}
        </ul>
      )}
    </DpContentCard>
  );
}
