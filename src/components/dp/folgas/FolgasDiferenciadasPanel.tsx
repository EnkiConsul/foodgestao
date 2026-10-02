import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Briefcase, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDpCargos } from "@/hooks/useDpCadastros";
import { useDpFolgaDomingoCargos } from "@/hooks/useDpFolgaDomingoCargos";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Scale } from "lucide-react";
import {
  DIAS_SEMANA, JUSTIFICATIVA_ISONOMIA_MIN, classificarIsonomia, cienciaIsonomiaValida,
  rotuloFolgaDiferenciada, semanasEquivalentes,
} from "@/lib/dp/folga-isonomia";

const SEMANAS_POR_MES = 4.33;

type Props = {
  unidadeId: string | null;
  semanasHomens: number;
  semanasMulheres: number;
  diasConsiderados: string;
};

type ColabRow = {
  id: string; nome: string; sexo: string | null; cargo_id: string | null; sindicato_id: string | null;
  domingos_folga_mes: number | null; folga_dif_modo: "semanas" | "por_mes" | null;
  folga_dif_periodicidade: number | null; folga_dif_dias: number[] | null;
};

const fmtSemanas = (s: number) => (s > 0 ? `a cada ${s.toFixed(s % 1 ? 1 : 0)} semana(s)` : "sem exigência");

/**
 * Folgas dominicais diferenciadas por cargo ou colaborador, dentro da regra da
 * unidade. Grava direto pelo servidor e compara com a regra de homens/mulheres.
 */
export function FolgasDiferenciadasPanel({ unidadeId, semanasHomens, semanasMulheres, diasConsiderados }: Props) {
  const qc = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  const { data: cargos = [] } = useDpCargos();
  const { data: regrasCargo = [] } = useDpFolgaDomingoCargos(selectedCompanyId);
  const [novo, setNovo] = useState(false);
  const [alvo, setAlvo] = useState<"cargo" | "colaborador">("cargo");
  const [alvoId, setAlvoId] = useState("");
  const [modo, setModo] = useState<"semanas" | "por_mes">("por_mes");
  const [qtd, setQtd] = useState("2");
  const [diasProprios, setDiasProprios] = useState(false);
  const [dias, setDias] = useState<number[]>([0]);
  const [justificativa, setJustificativa] = useState("");
  const [ciente, setCiente] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const { data: sindicatos = [] } = useQuery({
    queryKey: ["dp-sindicatos-nomes", selectedCompanyId],
    enabled: !!selectedCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("dp_sindicatos").select("id, nome").eq("company_id", selectedCompanyId!);
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string }[];
    },
  });
  const nomeSind = (id: string | null) => (id ? sindicatos.find((x) => x.id === id)?.nome ?? "Sindicato" : "sem sindicato cadastrado");

  const { data: colabs = [] } = useQuery({
    queryKey: ["dp-folgas-diferenciadas-colabs", unidadeId],
    enabled: !!unidadeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_colaboradores")
        .select("id, nome, sexo, cargo_id, sindicato_id, domingos_folga_mes, folga_dif_modo, folga_dif_periodicidade, folga_dif_dias")
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
  const daUnidadeIds = new Set(daUnidade.map((r) => r.cargo_id));

  const afetados = useMemo(
    () => (alvo === "colaborador" ? colabs.filter((c) => c.id === alvoId) : colabs.filter((c) => c.cargo_id === alvoId)),
    [alvo, alvoId, colabs],
  );

  const comparativo = useMemo(() => {
    const n = Number(qtd);
    const semanasExc = semanasEquivalentes(modo, n);
    const temMulher = afetados.some((c) => c.sexo === "F");
    const referencia = temMulher ? semanasMulheres : semanasHomens;
    const legal = temMulher ? 2 : 3;
    return {
      texto: `${rotuloFolgaDiferenciada(modo, n, diasProprios ? dias : null)} ≈ 1 domingo a cada ${(semanasExc).toFixed(1)} semana(s) (${(SEMANAS_POR_MES / semanasExc).toFixed(1)} por mês)`,
      maisFavoravel: referencia <= 0 || semanasExc <= referencia,
      abaixoLei: semanasExc > legal + 0.01,
    };
  }, [qtd, modo, afetados, diasProprios, dias, semanasHomens, semanasMulheres]);

  const isonomia = useMemo(() => {
    if (!alvoId) return null;
    const ids = new Set(afetados.map((c) => c.id));
    const colegas = colabs.filter((c) => !ids.has(c.id) && c.domingos_folga_mes == null
      && !daUnidadeIds.has(c.cargo_id ?? ""));
    return classificarIsonomia(afetados, colegas);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alvoId, afetados, colabs, regrasCargo]);

  const diasValidos = !diasProprios || dias.length > 0;
  const podeSalvar = !!alvoId && !salvando && !comparativo.abaixoLei && diasValidos && cienciaIsonomiaValida(ciente, justificativa);

  const recarregar = () => {
    void qc.invalidateQueries({ queryKey: ["dp_folga_domingo_cargos"] });
    void qc.invalidateQueries({ queryKey: ["dp-folgas-diferenciadas-colabs"] });
    void qc.invalidateQueries({ queryKey: ["dp_config_resolvida"] });
  };

  const gravar = async (tipo: "cargo" | "colaborador", id: string, valor: number | null) => {
    setSalvando(true);
    const extra = valor == null ? {} : {
      _modo: modo,
      _dias: diasProprios ? dias : null,
      _justificativa: justificativa.trim(),
      _ciencia: ciente,
      _contexto: isonomia ? {
        cenario: isonomia.cenario,
        sindicatos_alvo: isonomia.sindicatosAlvo,
        sindicatos_colegas: isonomia.sindicatosColegas,
        colegas_regra_padrao: isonomia.colegasNaRegraPadrao,
        mensagem: isonomia.mensagem,
      } : null,
    };
    const { error } =
      tipo === "cargo"
        ? await supabase.rpc("dp_folga_domingo_cargo_definir" as never, {
            _unidade_id: unidadeId, _cargo_id: id, _domingos: valor, ...extra,
          } as never)
        : await supabase.rpc("dp_colaborador_definir_domingos_folga" as never, {
            _colaborador_id: id, _domingos: valor, ...extra,
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
          <Button variant="outline" className="gap-2" onClick={() => { setNovo(true); setAlvoId(""); setJustificativa(""); setCiente(false); setDiasProprios(false); setDias([0]); }}>
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
              <Label>Modelo de frequência</Label>
              <ToggleGroup type="single" value={modo} onValueChange={(v) => { if (v) { setModo(v as typeof modo); setQtd("2"); } }} className="justify-start">
                <ToggleGroupItem value="semanas">A cada X semanas</ToggleGroupItem>
                <ToggleGroupItem value="por_mes">X por mês</ToggleGroupItem>
              </ToggleGroup>
              <Select value={qtd} onValueChange={setQtd}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {modo === "semanas" ? (n === 1 ? "Toda semana" : `A cada ${n} semanas`) : `${n} por mês`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Dias considerados</Label>
            <ToggleGroup type="single" value={diasProprios ? "proprios" : "unidade"} onValueChange={(v) => { if (v) setDiasProprios(v === "proprios"); }} className="justify-start">
              <ToggleGroupItem value="unidade">Seguir os dias da unidade</ToggleGroupItem>
              <ToggleGroupItem value="proprios">Escolher dias</ToggleGroupItem>
            </ToggleGroup>
            {diasProprios && (
              <div className="flex flex-wrap gap-2">
                {DIAS_SEMANA.map((d, i) => (
                  <label key={d} className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
                    <Checkbox
                      checked={dias.includes(i)}
                      onCheckedChange={(v) => setDias((cur) => (v ? [...cur, i] : cur.filter((x) => x !== i)).sort())}
                    />
                    {d}
                  </label>
                ))}
              </div>
            )}
            {!diasValidos && <p className="text-xs text-destructive">Escolha ao menos um dia.</p>}
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
          {isonomia && (
            <div className={`space-y-2 rounded-lg border-2 p-3 text-xs ${isonomia.afirmativo ? "border-destructive/50 bg-destructive/5" : "border-primary/40 bg-primary/5"}`}>
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <Scale className="h-4 w-4" aria-hidden="true" /> {isonomia.titulo}
              </p>
              <p>{isonomia.mensagem}</p>
              <p className="text-muted-foreground">
                Quem recebe: {isonomia.sindicatosAlvo.map(nomeSind).join(", ") || "—"} · Colegas na regra padrão ({isonomia.colegasNaRegraPadrao}): {isonomia.sindicatosColegas.map(nomeSind).join(", ") || "nenhum"}
              </p>
              <div className="space-y-1">
                <Label htmlFor="isonomia-just">Justificativa objetiva *</Label>
                <Textarea id="isonomia-just" rows={2} value={justificativa} onChange={(e) => setJustificativa(e.target.value)}
                  placeholder="Ex.: cláusula 12 da CCT 2026 garante 2 domingos ao pizzaiolo." />
                <p className="text-[11px] text-muted-foreground">Mínimo de {JUSTIFICATIVA_ISONOMIA_MIN} caracteres. Fica registrada no histórico de regras.</p>
              </div>
              <label className="flex items-start gap-2">
                <Checkbox checked={ciente} onCheckedChange={(v) => setCiente(v === true)} />
                <span>Estou ciente dos riscos ao Princípio da Isonomia e de que existe motivo objetivo documentado para esta diferenciação.</span>
              </label>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setNovo(false)}>Cancelar</Button>
            <Button
              disabled={!podeSalvar}
              onClick={async () => { if (await gravar(alvo, alvoId, Number(qtd))) setNovo(false); }}
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
                <span><strong>{nomeCargo(r.cargo_id)}</strong> · {rotuloFolgaDiferenciada(r.modo_frequencia ?? "por_mes", r.modo_frequencia === "semanas" ? (r.periodicidade_semanas ?? 2) : r.domingos_mes, r.dias_descanso)}</span></span>
              <Button size="icon" variant="ghost" aria-label="Remover" disabled={salvando} onClick={() => void gravar("cargo", r.cargo_id, null)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </li>
          ))}
          {individuais.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 p-3 text-sm">
              <span className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" />
                <span><strong>{c.nome}</strong> · {rotuloFolgaDiferenciada(c.folga_dif_modo ?? "por_mes", c.folga_dif_periodicidade ?? c.domingos_folga_mes!, c.folga_dif_dias)}</span></span>
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
