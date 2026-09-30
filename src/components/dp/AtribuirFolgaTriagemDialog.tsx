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

type Modo = "substituir_fds" | "troca_semanal" | "extra";

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

  useEffect(() => {
    if (!open) return;
    setModo("extra");
    setFolgaSubstituir("");
    setDataTrabalho("");
    setMotivo("");
  }, [open, dataIso, colaboradorId]);

  const atribuir = useMutation({
    mutationFn: async () => {
      if (modo === "substituir_fds" && !folgaSubstituir)
        throw new Error("Escolha a folga que será substituída.");
      if (modo === "troca_semanal" && !dataTrabalho)
        throw new Error("Escolha o dia em que o colaborador vai trabalhar.");
      const { data, error } = await supabase.rpc("dp_folga_atribuir_admin_v2" as any, {
        p_colaborador: colaboradorId,
        p_data: dataIso,
        p_modo: modo,
        p_folga_substituir_id: modo === "substituir_fds" ? folgaSubstituir : null,
        p_data_trabalho: modo === "troca_semanal" ? dataTrabalho : null,
        p_motivo: motivo.trim() || null,
      });
      if (error) {
        const raw = error.message ?? "";
        if (raw.includes("FOLGA_LIMITE_DIA"))
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
      const res = (data ?? {}) as { ok?: boolean; mensagem?: string };
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
    onError: (e: any) =>
      toast.error("Erro ao atribuir folga", {
        description: e instanceof Error ? e.message : String(e),
      }),
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
                <SelectItem
                  value="substituir_fds"
                  disabled={(folgasQuery.data ?? []).length === 0}
                >
                  Troca de uma folga já marcada
                </SelectItem>
                <SelectItem value="troca_semanal" disabled={diasSemanaFixos.length === 0}>
                  Troca da folga semanal da semana
                </SelectItem>
                <SelectItem value="extra">Folga extra</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              {modo === "substituir_fds"
                ? "A folga escolhida abaixo é cancelada e esta entra no lugar dela."
                : modo === "troca_semanal"
                  ? "O colaborador trabalha no dia da folga semanal e folga neste dia no lugar dele."
                  : "Folga adicional: a folga semanal e as folgas já marcadas continuam como estão."}
            </p>
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
            onClick={() => atribuir.mutate()}
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
