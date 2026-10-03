import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, Loader2, Plus, ShieldAlert, Trash2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useDpFolgaLimites } from "@/hooks/useDpFolgaLimites";
import { useDpSetores } from "@/hooks/useDpSetores";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { notifyError } from "@/lib/notifyError";

type Props = {
  companyId: string;
  data: string; // yyyy-MM-dd
  /** Unidade já definida pelo calendário (filtro da tela ou seletor único do diálogo). */
  unidadeId: string;
};

const NOME_RESTRICAO = "Restrição do dia";

type RegraLimite = ReturnType<typeof useDpFolgaLimites>["regras"][number];

function useBaseDia(companyId: string, unidadeId: string) {
  const colabsQ = useQuery({
    queryKey: ["restricoes_dia_colabs", companyId, unidadeId],
    enabled: !!unidadeId,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("dp_colaboradores")
        .select("id, nome")
        .eq("company_id", companyId)
        .eq("unidade_id", unidadeId)
        .is("deleted_at", null)
        .order("nome");
      if (error) throw error;
      return rows ?? [];
    },
  });

  const cargosQ = useQuery({
    queryKey: ["restricoes_dia_cargos", companyId],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("dp_cargos")
        .select("id, nome")
        .eq("company_id", companyId)
        .order("nome");
      if (error) throw error;
      return rows ?? [];
    },
  });

  return { colabs: colabsQ.data ?? [], cargos: cargosQ.data ?? [] };
}

function useDescreverRegra(
  colabs: { id: string; nome: string }[],
  cargos: { id: string; nome: string }[],
  setores: { id: string; nome: string }[],
) {
  const nomeColab = (id: string) => colabs.find((c) => c.id === id)?.nome;
  return (r: RegraLimite) => {
    if (r.tipo === "colaboradores") {
      const nomes = (r.colaborador_ids ?? []).map((id) => nomeColab(id) ?? "Colaborador").join(", ");
      return `Não folgam juntos: ${nomes}`;
    }
    const alvo =
      r.cargo_ids.length === 0 && r.setor_ids.length === 0
        ? "Todos"
        : r.setor_ids.length > 0 && r.cargo_ids.length === 0
        ? r.setor_ids.map((id) => setores.find((s) => s.id === id)?.nome ?? "Setor").join(", ")
        : r.cargo_ids.map((id) => cargos.find((c) => c.id === id)?.nome ?? "Cargo").join(", ");
    return r.maximo === 0
      ? `${alvo}: ninguém folga`
      : `${alvo}: no máximo ${r.maximo} ${r.maximo === 1 ? "pessoa" : "pessoas"} de folga`;
  };
}

/**
 * Vagas de folga da data por cargo ou setor: permite aumentar ou reduzir o
 * máximo de pessoas daquele cargo/setor em folga só neste dia
 * (regra de limite com vigência de um único dia; 0 = ninguém folga).
 * A unidade vem do calendário — este bloco não tem seletor próprio.
 */
export function VagasCargoSetorDia({ companyId, data, unidadeId }: Props) {
  const [escopo, setEscopo] = useState<"cargo" | "setor">("cargo");
  const [alvoSel, setAlvoSel] = useState("");
  const [maximo, setMaximo] = useState(1);
  const [formAberto, setFormAberto] = useState(false);

  const { regras, salvar, excluir } = useDpFolgaLimites(unidadeId || null);
  const setoresQ = useDpSetores(unidadeId || null);
  const { colabs, cargos } = useBaseDia(companyId, unidadeId);
  const setores = ((setoresQ as any).setores ?? []) as { id: string; nome: string }[];
  const descreverRegra = useDescreverRegra(colabs, cargos, setores);

  const restricoesDia = useMemo(
    () =>
      regras.filter(
        (r) =>
          r.vigencia_inicio === data &&
          r.vigencia_fim === data &&
          r.unidade_id === unidadeId &&
          r.tipo !== "colaboradores",
      ),
    [regras, data, unidadeId],
  );

  /** Regras permanentes da unidade que valem nesta data (por cargo, setor ou "não folgam juntos"). */
  const regrasFixas = useMemo(() => {
    const dow = new Date(`${data}T12:00:00`).getDay();
    return regras.filter(
      (r) =>
        r.ativo &&
        r.unidade_id === unidadeId &&
        (r.tipo === "colaboradores" || r.cargo_ids.length > 0 || r.setor_ids.length > 0) &&
        !(r.vigencia_inicio === data && r.vigencia_fim === data) &&
        (r.dia_semana == null || r.dia_semana === dow) &&
        (!r.vigencia_inicio || r.vigencia_inicio <= data) &&
        (!r.vigencia_fim || r.vigencia_fim >= data),
    );
  }, [regras, data, unidadeId]);

  const adicionarLimite = async () => {
    if (!alvoSel) return;
    try {
      await salvar.mutateAsync({
        tipo: escopo,
        nome: NOME_RESTRICAO,
        unidade_id: unidadeId,
        dia_semana: null,
        maximo: Math.max(0, maximo),
        vigencia_inicio: data,
        vigencia_fim: data,
        ativo: true,
        cargo_ids: escopo === "cargo" ? [alvoSel] : [],
        setor_ids: escopo === "setor" ? [alvoSel] : [],
        colaborador_ids: [],
      });
      toast.success("Vagas do dia ajustadas.");
      setAlvoSel("");
      setMaximo(1);
    } catch (e) {
      notifyError(e, { surface: "Calendário", action: "salvar o ajuste de vagas" });
    }
  };

  if (!unidadeId) {
    return <p className="text-xs text-muted-foreground">Escolha a unidade no topo do dia para ajustar vagas por cargo ou setor.</p>;
  }

  return (
    <div className="space-y-2">
      {regrasFixas.length > 0 && (
        <div className="space-y-2">
          {regrasFixas.map((r) => (
            <div key={r.id} className="rounded-xl border bg-card px-3 py-2 text-sm font-semibold">
              {descreverRegra(r)}
            </div>
          ))}
          <Link to="/dp/folgas?aba=regras" className="inline-flex text-xs font-bold text-primary underline underline-offset-2">
            Alterar regras da unidade
          </Link>
        </div>
      )}

      {restricoesDia.length > 0 && (
        <div className="space-y-2">
          <Label className="text-[10px] font-bold text-muted-foreground">Vagas ajustadas só nesta data</Label>
          {restricoesDia.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-xl border bg-card px-3 py-2 text-sm">
              <span className="font-semibold">{descreverRegra(r)}</span>
              <Button
                size="icon" variant="ghost" className="h-8 w-8 text-destructive"
                aria-label="Remover ajuste"
                disabled={excluir.isPending}
                onClick={() => excluir.mutate(r.id, { onSuccess: () => toast.success("Ajuste removido.") })}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Button variant="outline" className="h-10 w-full rounded-xl font-bold" onClick={() => setFormAberto((v) => !v)}>
        {formAberto ? "Fechar" : <><Users className="mr-2 h-4 w-4" /> Ajustar vagas por cargo ou setor</>}
      </Button>

      {formAberto && (
        <div className="space-y-2">
          <div className="grid grid-cols-[110px_1fr] gap-2">
            <Select value={escopo} onValueChange={(v) => { setEscopo(v as "cargo" | "setor"); setAlvoSel(""); }}>
              <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cargo">Cargo</SelectItem>
                <SelectItem value="setor">Setor</SelectItem>
              </SelectContent>
            </Select>
            <Select value={alvoSel} onValueChange={setAlvoSel}>
              <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder={escopo === "cargo" ? "Cargo" : "Setor"} /></SelectTrigger>
              <SelectContent>
                {(escopo === "cargo" ? cargos : setores).map((x) => (
                  <SelectItem key={x.id} value={x.id}>{x.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label className="mb-1 block text-[10px] text-muted-foreground">Máximo de folgas neste dia (0 = ninguém folga)</Label>
              <Input type="number" min={0} max={20} value={maximo} onChange={(e) => setMaximo(Number(e.target.value))} className="h-10 rounded-xl" />
            </div>
            <Button className="h-10 rounded-xl" disabled={!alvoSel || salvar.isPending} onClick={adicionarLimite}>
              <Plus className="mr-1 h-4 w-4" /> Adicionar
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Vale só para esta data: aumenta ou reduz as vagas daquele cargo ou setor sem mudar a regra fixa da unidade.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Impedimentos da data: impede um colaborador específico de folgar neste dia
 * (bloqueio individual em dp_bloqueios, início = fim = data). Portal, troca e
 * sorteio já respeitam o bloqueio. A unidade vem do calendário.
 */
export function ImpedimentosDoDia({ companyId, data, unidadeId }: Props) {
  const qc = useQueryClient();
  const [colabSel, setColabSel] = useState("");
  const [formAberto, setFormAberto] = useState(false);

  const { colabs } = useBaseDia(companyId, unidadeId);
  const nomeColab = (id: string) => colabs.find((c) => c.id === id)?.nome;

  const bloqueiosQ = useQuery({
    queryKey: ["restricoes_dia_bloqueios", companyId, data],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("dp_bloqueios")
        .select("id, colaborador_id, motivo, inicio, fim, tipo")
        .eq("company_id", companyId)
        .eq("ativo", true)
        .in("tipo", ["folga", "todos"])
        .lte("inicio", data)
        .or(`fim.is.null,fim.gte.${data}`);
      if (error) throw error;
      return rows ?? [];
    },
  });

  const bloqueiosDaUnidade = (bloqueiosQ.data ?? []).filter((b) => nomeColab(b.colaborador_id));

  const bloquearColab = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("dp_bloqueios").insert({
        company_id: companyId,
        colaborador_id: colabSel,
        tipo: "folga",
        motivo: "BLOQUEIO DE FOLGA NO DIA",
        inicio: data,
        fim: data,
        ativo: true,
        criado_por: u.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Colaborador impedido de folgar neste dia.");
      setColabSel("");
      qc.invalidateQueries({ queryKey: ["restricoes_dia_bloqueios"] });
    },
    onError: (e) => notifyError(e, { surface: "Calendário", action: "impedir o colaborador" }),
  });

  const liberarColab = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_bloqueios").update({ ativo: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Impedimento removido.");
      qc.invalidateQueries({ queryKey: ["restricoes_dia_bloqueios"] });
    },
    onError: (e) => notifyError(e, { surface: "Calendário", action: "remover o impedimento" }),
  });

  return (
    <div className="space-y-3 rounded-2xl border bg-muted/30 p-5">
      <h3 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">
        <ShieldAlert className="h-3.5 w-3.5" /> Impedimentos nesta Data
      </h3>

      {!unidadeId ? (
        <p className="text-xs text-muted-foreground">Escolha a unidade no topo do dia para ver e criar impedimentos.</p>
      ) : (
        <>
          {bloqueiosDaUnidade.length > 0 && (
            <div className="space-y-2">
              {bloqueiosDaUnidade.map((b) => (
                <div key={b.id} className="flex items-center justify-between rounded-xl border bg-card px-3 py-2 text-sm">
                  <span className="font-semibold">
                    {nomeColab(b.colaborador_id)}: não folga
                    {(b.inicio !== data || b.fim !== data) && (
                      <span className="ml-1 text-xs font-normal text-muted-foreground">(bloqueio por período)</span>
                    )}
                  </span>
                  <Button
                    size="icon" variant="ghost" className="h-8 w-8 text-destructive"
                    aria-label="Remover impedimento"
                    disabled={liberarColab.isPending}
                    onClick={() => liberarColab.mutate(b.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <Button variant="outline" className="h-10 w-full rounded-xl font-bold" onClick={() => setFormAberto((v) => !v)}>
            {formAberto ? "Fechar" : <><Ban className="mr-2 h-4 w-4" /> Impedir colaborador neste dia</>}
          </Button>

          {formAberto && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Select value={colabSel} onValueChange={setColabSel}>
                  <SelectTrigger className="h-10 flex-1 rounded-xl"><SelectValue placeholder="Colaborador" /></SelectTrigger>
                  <SelectContent>
                    {colabs.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button
                  className="h-10 rounded-xl"
                  disabled={!colabSel || bloquearColab.isPending}
                  onClick={() => bloquearColab.mutate()}
                >
                  {bloquearColab.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Vale só para esta data: o colaborador não consegue marcar nem pedir troca, e o sorteio não escolhe este dia para ele.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
