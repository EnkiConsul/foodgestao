import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Briefcase, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDpCargos } from "@/hooks/useDpCadastros";
import {
  OPCOES_DOMINGOS_DIFERENCIADOS,
  rotuloDomingos,
  useDpFolgaDomingoCargos,
} from "@/hooks/useDpFolgaDomingoCargos";

const SEMANAS_POR_MES = 4.33;

type Props = {
  unidadeId: string | null;
  semanasHomens: number;
  semanasMulheres: number;
  diasConsiderados: string;
};

type ColabRow = { id: string; nome: string; sexo: string | null; cargo_id: string | null; domingos_folga_mes: number | null };

const fmtSemanas = (s: number) => (s > 0 ? `a cada ${s.toFixed(s % 1 ? 1 : 0)} semana(s)` : "sem exigência");

/**
 * Folgas dominicais diferenciadas por cargo ou colaborador, dentro da regra da
 * unidade. Grava direto pelo servidor e compara com a regra de homens/mulheres.
 */
export function FolgasDiferenciadasPanel({ unidadeId, semanasHomens, semanasMulheres, diasConsiderados }: Props) {
  const qc = useQueryClient();
  const { selectedCompanyId } = useCompany();
  const { data: cargos = [] } = useDpCargos();
  const { data: regrasCargo = [] } = useDpFolgaDomingoCargos(selectedCompanyId);
  const [novo, setNovo] = useState(false);
  const [alvo, setAlvo] = useState<"cargo" | "colaborador">("cargo");
  const [alvoId, setAlvoId] = useState("");
  const [domingos, setDomingos] = useState("2");
  const [salvando, setSalvando] = useState(false);

  const { data: colabs = [] } = useQuery({
    queryKey: ["dp-folgas-diferenciadas-colabs", unidadeId],
    enabled: !!unidadeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_colaboradores")
        .select("id, nome, sexo, cargo_id, domingos_folga_mes")
        .eq("unidade_id", unidadeId!)
        .eq("ativo", true)
        .is("deleted_at", null)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as ColabRow[];
    },
  });

  const nomeCargo = (id: string | null) => cargos.find((c) => c.id === id)?.nome ?? "—";
  const daUnidade = regrasCargo.filter((r) => r.unidade_id === unidadeId);
  const individuais = colabs.filter((c) => c.domingos_folga_mes != null);

  const comparativo = useMemo(() => {
    const n = Number(domingos);
    const semanasExc = SEMANAS_POR_MES / n;
    const sel = alvo === "colaborador" ? colabs.find((c) => c.id === alvoId) : null;
    const referencia = sel?.sexo === "F" ? semanasMulheres : semanasHomens;
    const legal = sel?.sexo === "F" ? 2 : 3;
    return {
      texto: `${rotuloDomingos(n)} ≈ 1 domingo a cada ${semanasExc.toFixed(1)} semana(s)`,
      maisFavoravel: referencia <= 0 || semanasExc <= referencia,
      abaixoLei: semanasExc > legal + 0.01,
    };
  }, [domingos, alvo, alvoId, colabs, semanasHomens, semanasMulheres]);

  const recarregar = () => {
    void qc.invalidateQueries({ queryKey: ["dp_folga_domingo_cargos"] });
    void qc.invalidateQueries({ queryKey: ["dp-folgas-diferenciadas-colabs"] });
    void qc.invalidateQueries({ queryKey: ["dp_config_resolvida"] });
  };

  const gravar = async (tipo: "cargo" | "colaborador", id: string, valor: number | null) => {
    setSalvando(true);
    const { error } =
      tipo === "cargo"
        ? await supabase.rpc("dp_folga_domingo_cargo_definir" as never, {
            _unidade_id: unidadeId, _cargo_id: id, _domingos: valor,
          } as never)
        : await supabase.rpc("dp_colaborador_definir_domingos_folga" as never, {
            _colaborador_id: id, _domingos: valor,
          } as never);
    setSalvando(false);
    if (error) {
      toast.error(error.message || "Não foi possível salvar");
      return false;
    }
    toast.success(valor ? "Folga diferenciada salva" : "Volta a seguir a regra da unidade");
    recarregar();
    return true;
  };

  if (!unidadeId) {
    return (
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Folgas Diferenciadas (por Cargo ou Colaborador)</h3>
        <p className="text-xs text-muted-foreground">Salve a unidade primeiro para cadastrar folgas diferenciadas.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Folgas Diferenciadas (por Cargo ou Colaborador)</h3>
          <p className="text-xs text-muted-foreground">
            Quando um cargo ou uma pessoa folga domingos com frequência diferente da regra acima.
            A regra do colaborador prevalece sobre a do cargo. Dias considerados: {diasConsiderados || "Domingo"}.
          </p>
        </div>
        {!novo && (
          <Button variant="outline" className="gap-2" onClick={() => { setNovo(true); setAlvoId(""); }}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar folga diferenciada
          </Button>
        )}
      </div>

      {novo && (
        <div className="space-y-3 rounded-lg border p-3">
          <ToggleGroup type="single" value={alvo} onValueChange={(v) => { if (v) { setAlvo(v as typeof alvo); setAlvoId(""); } }} className="justify-start">
            <ToggleGroupItem value="cargo" className="gap-1"><Briefcase className="h-4 w-4" />Cargo</ToggleGroupItem>
            <ToggleGroupItem value="colaborador" className="gap-1"><User className="h-4 w-4" />Colaborador</ToggleGroupItem>
          </ToggleGroup>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{alvo === "cargo" ? "Cargo" : "Colaborador"}</Label>
              <Select value={alvoId} onValueChange={setAlvoId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {alvo === "cargo"
                    ? cargos.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)
                    : colabs.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Frequência de domingos</Label>
              <Select value={domingos} onValueChange={setDomingos}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OPCOES_DOMINGOS_DIFERENCIADOS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1 rounded-md bg-muted/50 p-2 text-xs">
            <p>Regra da unidade — Homens: {fmtSemanas(semanasHomens)} · Mulheres: {fmtSemanas(semanasMulheres)}</p>
            <p className="font-medium">Folga diferenciada: {comparativo.texto}</p>
            {comparativo.abaixoLei ? (
              <Badge variant="destructive">Abaixo do mínimo legal</Badge>
            ) : comparativo.maisFavoravel ? (
              <Badge variant="secondary">Igual ou mais favorável que a regra da unidade</Badge>
            ) : (
              <Badge variant="outline">Menos folgas que a regra da unidade (dentro da lei)</Badge>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setNovo(false)}>Cancelar</Button>
            <Button
              disabled={!alvoId || salvando || comparativo.abaixoLei}
              onClick={async () => { if (await gravar(alvo, alvoId, Number(domingos))) setNovo(false); }}
            >
              Salvar folga diferenciada
            </Button>
          </div>
        </div>
      )}

      {daUnidade.length === 0 && individuais.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma folga diferenciada: todos seguem a regra da unidade.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {daUnidade.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 p-3 text-sm">
              <span className="flex items-center gap-2"><Briefcase className="h-4 w-4 text-muted-foreground" />
                <span><strong>{nomeCargo(r.cargo_id)}</strong> · {rotuloDomingos(r.domingos_mes)}</span></span>
              <Button size="icon" variant="ghost" aria-label="Remover" disabled={salvando} onClick={() => void gravar("cargo", r.cargo_id, null)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </li>
          ))}
          {individuais.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 p-3 text-sm">
              <span className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" />
                <span><strong>{c.nome}</strong> · {rotuloDomingos(c.domingos_folga_mes!)}</span></span>
              <Button size="icon" variant="ghost" aria-label="Remover" disabled={salvando} onClick={() => void gravar("colaborador", c.id, null)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
