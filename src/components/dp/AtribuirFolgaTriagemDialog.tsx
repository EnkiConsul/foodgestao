/**
 * Triagem da atribuição manual de folga pelo gestor.
 *
 * Marcar um dia de folga para alguém pode significar três coisas diferentes, e
 * cada uma tem efeito distinto na escala. O diálogo obriga a escolha para que o
 * gestor não precise cancelar a folga anterior na mão depois.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Modo = "substituir_fds" | "troca_semanal" | "extra" | "compensatoria";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  colaboradorId: string;
  colaboradorNome: string;
  /** Dia que receberá a folga (ISO). */
  dataIso: string;
  onDone?: () => void;
}

const descreverDia = (iso: string) =>
  format(parseISO(iso), "EEEE, dd/MM/yyyy", { locale: ptBR });

export function AtribuirFolgaTriagemDialog({
  open,
  onOpenChange,
  companyId,
  colaboradorId,
  colaboradorNome,
  dataIso,
  onDone,
}: Props) {
  const qc = useQueryClient();
  const [modo, setModo] = useState<Modo>("extra");
  const [folgaSubstituir, setFolgaSubstituir] = useState("");
  const [dataTrabalho, setDataTrabalho] = useState("");
  const [motivo, setMotivo] = useState("");

  const mesInicio = dataIso ? `${dataIso.slice(0, 7)}-01` : "";
  const mesFim = useMemo(() => {
    if (!dataIso) return "";
    const d = parseISO(`${dataIso.slice(0, 7)}-01`);
    return format(new Date(d.getFullYear(), d.getMonth() + 1, 0), "yyyy-MM-dd");
  }, [dataIso]);

  /** Folgas ativas do colaborador no mês: candidatas a serem substituídas. */
  const folgasQuery = useQuery({
    queryKey: ["dp_triagem_folgas", colaboradorId, mesInicio],
    enabled: open && !!colaboradorId && !!mesInicio,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dp_folgas")
        .select("id, data, tipo, extra, status")
        .eq("colaborador_id", colaboradorId)
        .gte("data", mesInicio)
        .lte("data", mesFim)
        .neq("status", "cancelada")
        .order("data");
      if (error) throw error;
      return (data ?? []).filter((f: any) => f.data !== dataIso);
    },
  });

  /** Dias fixos de folga do colaborador, para oferecer a troca da folga semanal. */
  const fixosQuery = useQuery({
    queryKey: ["dp_triagem_fixos", colaboradorId],
    enabled: open && !!colaboradorId,
    queryFn: async (): Promise<number[]> => {
      const { data: cfg } = await supabase
        .from("dp_colaborador_config_trabalho")
        .select("id")
        .eq("colaborador_id", colaboradorId)
        .order("vigencia_inicio", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cfg?.id) return [];
      const { data: dias } = await supabase
        .from("dp_colaborador_config_dias")
        .select("dow, trabalha")
        .eq("config_id", cfg.id);
      return (dias ?? [])
        .filter((d: any) => d.trabalha === false)
        .map((d: any) => Number(d.dow));
    },
  });

  /** Datas da semana do dia escolhido em que o colaborador folga por regra fixa. */
  const diasSemanaFixos = useMemo(() => {
    const fixos = fixosQuery.data ?? [];
    if (!dataIso || !fixos.length) return [] as string[];
    const inicio = startOfWeek(parseISO(dataIso), { weekStartsOn: 1 });
    const out: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(inicio, i);
      const iso = format(d, "yyyy-MM-dd");
      if (iso === dataIso) continue;
      if (fixos.includes(d.getDay())) out.push(iso);
    }
    return out;
  }, [fixosQuery.data, dataIso]);

  /** Intermitente não participa de folga fixa, troca semanal nem escolha de fim de semana. */
  const regimeQuery = useQuery({
    queryKey: ["dp_triagem_regime", colaboradorId],
    enabled: open && !!colaboradorId,
    queryFn: async () => {
      const { data } = await supabase
        .from("dp_colaboradores")
        .select("regime_trabalho, unidade_id")
        .eq("id", colaboradorId)
        .maybeSingle();
      const row = data as { regime_trabalho?: string; unidade_id?: string } | null;
      let compensa = false;
      if (row?.unidade_id) {
        const { data: u } = await supabase.from("dp_unidades").select("compensa_feriados").eq("id", row.unidade_id).maybeSingle();
        compensa = !!(u as { compensa_feriados?: boolean } | null)?.compensa_feriados;
      }
      return { regime: row?.regime_trabalho ?? null, compensa };
    },
  });
  const intermitente = regimeQuery.data?.regime === "intermitente";
  const temCompensacao = !!regimeQuery.data?.compensa && !intermitente;

  const [limiteMsg, setLimiteMsg] = useState<string | null>(null);
  const [justificativa, setJustificativa] = useState("");

  useEffect(() => {
    if (!open) return;
    setModo("extra");
    setFolgaSubstituir("");
    setDataTrabalho("");
    setMotivo("");
    setLimiteMsg(null);
    setJustificativa("");
  }, [open, dataIso, colaboradorId]);

  const atribuir = useMutation({
    mutationFn: async (autorizar: boolean = false) => {
      if (intermitente && modo !== "extra")
        throw new Error("Intermitente não participa de trocas de folga fixa ou de fim de semana.");
      if (modo === "substituir_fds" && !folgaSubstituir)
        throw new Error("Escolha a folga que será substituída.");
      if (modo === "troca_semanal" && !dataTrabalho)
        throw new Error("Escolha o dia em que o colaborador vai trabalhar.");
      if (autorizar && justificativa.trim().length < 15)
        throw new Error("Descreva o motivo da exceção (mínimo 15 caracteres).");
      const { data, error } = await supabase.rpc("dp_folga_atribuir_admin_v2" as any, {
        p_colaborador: colaboradorId,
        p_data: dataIso,
        p_modo: modo === "compensatoria" ? "extra" : modo,
        p_folga_substituir_id: modo === "substituir_fds" ? folgaSubstituir : null,
        p_data_trabalho: modo === "troca_semanal" ? dataTrabalho : null,
        p_motivo:
          modo === "compensatoria"
            ? `FOLGA COMPENSATÓRIA${motivo.trim() ? ` — ${motivo.trim()}` : ""}`
            : motivo.trim() || null,
        p_autorizar_excedente: autorizar,
        p_justificativa_excedente: autorizar ? justificativa.trim() : null,
      });
      if (error) {
        const raw = error.message ?? "";
        if (raw.includes("FORBIDDEN_UNIDADE"))
          throw new Error("Você não tem permissão para gerenciar folgas desta unidade.");
        if (raw.includes("INTERMITENTE"))
          throw new Error("Intermitente não participa de trocas de folga fixa ou de fim de semana.");
        if (raw.includes("JUSTIFICATIVA_OBRIGATORIA"))
          throw new Error("Descreva o motivo da exceção (mínimo 15 caracteres).");
        if (raw.includes("FOLGA_LIMITE_DIA") || raw.includes("Limite diário"))
          throw new Error("Este dia já atingiu o limite de pessoas em folga.");
        if (raw.includes("DUPLICATE_REQUEST"))
          throw new Error("Este colaborador já tem folga registrada neste dia.");
        if (raw.includes("NOT_FOUND"))
          throw new Error("A folga escolhida para substituição não está mais ativa.");
        if (raw.includes("INVALID_INPUT"))
          throw new Error("O dia de trabalho precisa ser um dia de folga semanal do colaborador.");
        if (raw.includes("FORBIDDEN"))
          throw new Error("Só responsáveis da empresa podem lançar folgas.");
        throw new Error(raw || "Não foi possível atribuir a folga.");
      }
      const res = (data ?? {}) as { ok?: boolean; mensagem?: string; limite_atingido?: boolean };
      if (res.ok === false && res.limite_atingido) {
        setLimiteMsg(res.mensagem ?? "Este dia já atingiu o limite de pessoas em folga.");
        throw new Error("LIMITE_SILENCIOSO");
      }
      if (res.ok === false)
        throw new Error(res.mensagem ?? "Não foi possível atribuir a folga neste dia.");
    },
    onSuccess: () => {
      toast.success("Folga atribuída", {
        description:
          modo === "substituir_fds"
            ? "A folga anterior foi cancelada automaticamente."
            : modo === "troca_semanal"
              ? "O dia de folga semanal foi registrado como trabalho por troca."
              : "Folga extra registrada sem alterar as folgas do mês.",
      });
      qc.invalidateQueries({ queryKey: ["dp_folgas"] });
      qc.invalidateQueries({ queryKey: ["dp_folgas_efetivadas"] });
      qc.invalidateQueries({ queryKey: ["dp_solicitacoes"] });
      qc.invalidateQueries({ queryKey: ["dp_panorama_base"] });
      qc.invalidateQueries({ queryKey: ["dp_home_stats"] });
      onOpenChange(false);
      onDone?.();
    },
    onError: (e: any) => {
      if (e instanceof Error && e.message === "LIMITE_SILENCIOSO") return;
      toast.error("Erro ao atribuir folga", {
        description: e instanceof Error ? e.message : String(e),
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black">Atribuir folga</DialogTitle>
          <DialogDescription>
            {colaboradorNome} vai folgar em <b>{dataIso && descreverDia(dataIso)}</b>. Diga o que esta
            folga significa na escala.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Tipo de folga</Label>
            <Select value={modo} onValueChange={(v) => setModo(v as Modo)}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {!intermitente && (
                  <SelectItem
                    value="substituir_fds"
                    disabled={(folgasQuery.data ?? []).length === 0}
                  >
                    Troca de uma folga já marcada
                  </SelectItem>
                )}
                {!intermitente && (
                  <SelectItem value="troca_semanal" disabled={diasSemanaFixos.length === 0}>
                    Troca da folga semanal da semana
                  </SelectItem>
                )}
                {!intermitente && <SelectItem value="compensatoria">Folga compensatória</SelectItem>}
                <SelectItem value="extra">Folga extra</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              {modo === "substituir_fds"
                ? "A folga escolhida abaixo é cancelada e esta entra no lugar dela."
                : modo === "troca_semanal"
                  ? "O colaborador trabalha no dia da folga semanal e folga neste dia no lugar dele."
                  : modo === "compensatoria"
                    ? "Compensa feriado trabalhado ou horas negociadas. Fica registrada como folga compensatória."
                    : "Folga adicional: a folga semanal e as folgas já marcadas continuam como estão."}
            </p>
            {modo === "extra" && temCompensacao && (
              <p className="mt-2 rounded-lg border border-warning/40 bg-warning/10 p-2 text-xs">
                Este colaborador pode ter folga compensatória (a unidade compensa feriados trabalhados). Confirme se não é o caso antes de lançar como folga extra.
              </p>
            )}
          </div>

          {modo === "substituir_fds" && (
            <div>
              <Label>Folga que será substituída</Label>
              <Select value={folgaSubstituir} onValueChange={setFolgaSubstituir}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Escolha a folga" />
                </SelectTrigger>
                <SelectContent>
                  {(folgasQuery.data ?? []).map((f: any) => (
                    <SelectItem key={f.id} value={f.id}>
                      {descreverDia(f.data)}
                      {f.extra ? " — extra" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {modo === "troca_semanal" && (
            <div>
              <Label>Dia em que vai trabalhar</Label>
              <Select value={dataTrabalho} onValueChange={setDataTrabalho}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Escolha o dia" />
                </SelectTrigger>
                <SelectContent>
                  {diasSemanaFixos.map((iso) => (
                    <SelectItem key={iso} value={iso}>
                      {descreverDia(iso)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label className="flex items-center gap-2">
              Motivo
              <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <Textarea
              rows={3}
              className="rounded-xl"
              placeholder="Registre o combinado com o colaborador"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>

          {intermitente && (
            <p className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              Intermitente não participa de folga fixa, troca semanal nem escolha de fim de semana.
            </p>
          )}

          {limiteMsg && (
            <div className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3">
              <p className="text-sm font-semibold text-destructive">{limiteMsg}</p>
              <p className="text-xs text-muted-foreground">
                Só Dono ou Administrador pode autorizar acima do limite. A justificativa fica registrada na
                auditoria.
              </p>
              <Textarea
                rows={2}
                className="rounded-xl"
                placeholder="Justificativa da exceção (mínimo 15 caracteres)"
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
              />
              <Button
                variant="destructive"
                className="min-h-10 w-full"
                disabled={atribuir.isPending || justificativa.trim().length < 15}
                onClick={() => atribuir.mutate(true)}
              >
                Autorizar Acima do Limite
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="min-h-10 w-full sm:w-auto"
          >
            Cancelar
          </Button>
          <Button
            onClick={() => atribuir.mutate(false)}
            disabled={atribuir.isPending}
            className="min-h-10 w-full sm:w-auto"
          >
            {atribuir.isPending ? "Atribuindo..." : "Confirmar folga"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
