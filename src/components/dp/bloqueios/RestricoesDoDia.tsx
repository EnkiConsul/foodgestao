import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, Loader2, Plus, ShieldAlert, Trash2 } from "lucide-react";
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
  unidadeIdInicial: string | null;
  unidades: { id: string; nome: string }[];
};

const NOME_RESTRICAO = "Restrição do dia";

/**
 * Restrições pontuais de uma data, gravadas nos mesmos cadastros oficiais:
 * - colaborador específico → bloqueio individual (dp_bloqueios, tipo folga);
 * - cargo/setor → regra de limite com vigência de um único dia (0 = ninguém folga).
 * Portal, aprovação e sorteio já respeitam ambos.
 */
export function RestricoesDoDia({ companyId, data, unidadeIdInicial, unidades }: Props) {
  const qc = useQueryClient();
  const [unidadeId, setUnidadeId] = useState<string>(unidadeIdInicial ?? "");
  useEffect(() => setUnidadeId(unidadeIdInicial ?? ""), [unidadeIdInicial]);

  const [colabSel, setColabSel] = useState("");
  const [escopo, setEscopo] = useState<"cargo" | "setor">("cargo");
  const [alvoSel, setAlvoSel] = useState("");
  const [maximo, setMaximo] = useState(0);

  const { regras, salvar, excluir } = useDpFolgaLimites(unidadeId || null);
  const setoresQ = useDpSetores(unidadeId || null);

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

  const colabs = colabsQ.data ?? [];
  const nomeColab = (id: string) => colabs.find((c) => c.id === id)?.nome;
  const bloqueiosDaUnidade = (bloqueiosQ.data ?? []).filter((b) => nomeColab(b.colaborador_id));
  const setores = ((setoresQ as any).setores ?? []) as { id: string; nome: string }[];
  const cargos = cargosQ.data ?? [];

  const restricoesDia = useMemo(
    () => regras.filter((r) => r.vigencia_inicio === data && r.vigencia_fim === data && r.unidade_id === unidadeId),
    [regras, data, unidadeId],
  );

  /** Regras permanentes da unidade que valem nesta data (por cargo, setor ou "não folgam juntos"). */
  const regrasFixas = useMemo(() => {
    const dow = new Date(`${data}T12:00:00`).getDay();
    return regras.filter(
      (r) =>
        r.ativo &&
        r.unidade_id === unidadeId &&
        r.tipo !== "quantidade" &&
        !(r.vigencia_inicio === data && r.vigencia_fim === data) &&
        (r.dia_semana == null || r.dia_semana === dow) &&
        (!r.vigencia_inicio || r.vigencia_inicio <= data) &&
        (!r.vigencia_fim || r.vigencia_fim >= data),
    );
  }, [regras, data, unidadeId]);

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
      toast.success("Colaborador bloqueado para folgar neste dia.");
      setColabSel("");
      qc.invalidateQueries({ queryKey: ["restricoes_dia_bloqueios"] });
    },
    onError: (e) => notifyError(e, { surface: "Calendário", action: "bloquear o colaborador" }),
  });

  const liberarColab = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dp_bloqueios").update({ ativo: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Bloqueio removido.");
      qc.invalidateQueries({ queryKey: ["restricoes_dia_bloqueios"] });
    },
    onError: (e) => notifyError(e, { surface: "Calendário", action: "remover o bloqueio" }),
  });

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
      toast.success("Restrição do dia adicionada.");
      setAlvoSel("");
      setMaximo(0);
    } catch (e) {
      notifyError(e, { surface: "Calendário", action: "salvar a restrição" });
    }
  };

  const descreverRegra = (r: (typeof restricoesDia)[number]) => {
    if (r.tipo === "colaboradores") {
      const nomes = (r.colaborador_ids ?? []).map((id) => nomeColab(id) ?? "Colaborador").join(", ");
      return `Não folgam juntos: ${nomes}`;
    }
    const alvo =
      r.tipo === "setor"
        ? r.setor_ids.map((id) => setores.find((s) => s.id === id)?.nome ?? "Setor").join(", ")
        : r.cargo_ids.map((id) => cargos.find((c) => c.id === id)?.nome ?? "Cargo").join(", ");
    return r.maximo === 0
      ? `${alvo}: ninguém folga`
      : `${alvo}: no máximo ${r.maximo} ${r.maximo === 1 ? "pessoa" : "pessoas"} de folga`;
  };

  return (
    <div className="space-y-4 rounded-2xl border bg-muted/30 p-5">
      <h3 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">
        <ShieldAlert className="h-3.5 w-3.5" /> Restrições da Data
      </h3>

      <div className="space-y-1.5">
        <Label className="text-[10px] font-bold text-muted-foreground">Unidade</Label>
        <Select value={unidadeId} onValueChange={setUnidadeId}>
          <SelectTrigger className="h-10 rounded-xl"><SelectValue placeholder="Escolha a unidade" /></SelectTrigger>
          <SelectContent>
            {unidades.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {!unidadeId ? (
        <p className="text-xs text-muted-foreground">Escolha a unidade para ver e criar restrições.</p>
      ) : (
        <>
          <div className="space-y-2">
            <Label className="text-[10px] font-bold text-muted-foreground">Regras da unidade que valem neste dia</Label>
            {regrasFixas.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma regra por cargo, setor ou pessoas nesta unidade.</p>
            ) : (
              regrasFixas.map((r) => (
                <div key={r.id} className="rounded-xl border bg-card px-3 py-2 text-sm font-semibold">
                  {descreverRegra(r)}
                </div>
              ))
            )}
            <Link to="/dp/folgas?aba=regras" className="inline-flex text-xs font-bold text-primary underline underline-offset-2">
              Alterar regras da unidade
            </Link>
          </div>

          {/* A. Colaborador específico */}
          <div className="space-y-2">
            <Label className="text-[10px] font-bold text-muted-foreground">
              Impedir folga de um colaborador neste dia
            </Label>
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
            {bloqueiosDaUnidade.map((b) => (
              <div key={b.id} className="flex items-center justify-between rounded-xl border bg-card px-3 py-2 text-sm">
                <span className="font-semibold">
                  {nomeColab(b.colaborador_id)}
                  {(b.inicio !== data || b.fim !== data) && (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">(bloqueio por período)</span>
                  )}
                </span>
                <Button
                  size="icon" variant="ghost" className="h-8 w-8 text-destructive"
                  aria-label="Remover bloqueio"
                  disabled={liberarColab.isPending}
                  onClick={() => liberarColab.mutate(b.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          {/* B. Cargo / setor */}
          <div className="space-y-2">
            <Label className="text-[10px] font-bold text-muted-foreground">
              Bloquear ou limitar por cargo ou setor neste dia
            </Label>
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
                <Label className="mb-1 block text-[10px] text-muted-foreground">Máximo de folgas (0 = ninguém folga)</Label>
                <Input type="number" min={0} max={20} value={maximo} onChange={(e) => setMaximo(Number(e.target.value))} className="h-10 rounded-xl" />
              </div>
              <Button className="h-10 rounded-xl" disabled={!alvoSel || salvar.isPending} onClick={adicionarLimite}>
                <Plus className="mr-1 h-4 w-4" /> Adicionar
              </Button>
            </div>
            {restricoesDia.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-xl border bg-card px-3 py-2 text-sm">
                <span className="font-semibold">{descreverRegra(r)}</span>
                <Button
                  size="icon" variant="ghost" className="h-8 w-8 text-destructive"
                  aria-label="Remover restrição"
                  disabled={excluir.isPending}
                  onClick={() => excluir.mutate(r.id, { onSuccess: () => toast.success("Restrição removida.") })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Valem só para esta data: o colaborador não consegue marcar nem pedir troca, e o sorteio não escolhe este dia.
          </p>
        </>
      )}
    </div>
  );
}
