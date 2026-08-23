import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DpDialogShell } from "@/components/dp/DpDialogShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { motivoBloqueioSocio } from "@/lib/dp/socio-bloqueios";

export interface SocioBloqueioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  /** Nome do sócio, usado no motivo do bloqueio. */
  nome: string;
  /** Datas (ISO) da folga ou de todo o período de férias. */
  datas: string[];
  /** Unidade do sócio — vem pré-marcada. */
  unidadeId?: string | null;
  unidades: { id: string; nome: string }[];
  tipo?: "folga" | "ferias";
}

/**
 * Depois que um sócio marca folga ou férias, pergunta se o dia (ou período)
 * deve ser bloqueado para os demais colaboradores e em quais unidades.
 * O colaborador continua podendo pedir exceção em data bloqueada.
 */
export function SocioBloqueioDialog({
  open,
  onOpenChange,
  companyId,
  nome,
  datas,
  unidadeId,
  unidades,
  tipo = "folga",
}: SocioBloqueioDialogProps) {
  const qc = useQueryClient();
  const [selecionadas, setSelecionadas] = useState<string[]>([]);

  const unica = unidades.length <= 1;

  useEffect(() => {
    if (!open) return;
    setSelecionadas(unidadeId ? [unidadeId] : unidades.map((u) => u.id));
  }, [open, unidadeId, unidades]);

  const rotuloPeriodo = useMemo(() => {
    if (!datas.length) return "";
    const fmt = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR");
    return datas.length === 1 ? fmt(datas[0]) : `${fmt(datas[0])} a ${fmt(datas[datas.length - 1])}`;
  }, [datas]);

  const bloquear = useMutation({
    mutationFn: async () => {
      const alvo = unica ? unidades.map((u) => u.id) : selecionadas;
      if (!alvo.length) throw new Error("Escolha pelo menos uma unidade.");
      const { data: userRes } = await supabase.auth.getUser();
      const rows = datas.flatMap((data) =>
        alvo.map((uid) => ({
          company_id: companyId,
          data,
          unidade_id: uid,
          liberada: false,
          motivo: motivoBloqueioSocio(nome),
          criado_por: userRes.user?.id ?? null,
        })),
      );
      const { error } = await supabase
        .from("dp_datas_bloqueadas")
        .upsert(rows, { onConflict: "company_id,unidade_id,data" });
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} data(s) bloqueada(s) para os demais colaboradores.`);
      ["dp_datas_bloqueadas", "dp_datas_bloqueadas_admin", "dp_datas_bloqueadas_geral"].forEach((k) =>
        qc.invalidateQueries({ queryKey: [k] }),
      );
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      const err = e as { code?: string; message?: string };
      if (err?.code === "42501") {
        toast.error("Somente o DP pode bloquear datas. Peça ao administrador para aplicar o bloqueio.");
        return;
      }
      toast.error(err?.message ?? "Não foi possível bloquear.");
    },
  });

  const alternar = (id: string) =>
    setSelecionadas((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));

  return (
    <DpDialogShell
      open={open}
      onOpenChange={onOpenChange}
      icon={CalendarOff}
      title={tipo === "ferias" ? "Bloquear o Período Para os Demais?" : "Bloquear Este Dia Para os Demais?"}
      description={`${nome} — ${rotuloPeriodo}`}
      size="sm"
      footer={
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={bloquear.isPending}>
            Não bloquear
          </Button>
          <Button onClick={() => bloquear.mutate()} disabled={bloquear.isPending}>
            {bloquear.isPending ? "Bloqueando..." : "Bloquear"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Com o bloqueio, os demais colaboradores não conseguem marcar folga{" "}
          {tipo === "ferias" ? "neste período" : "neste dia"} — mas seguem podendo pedir exceção, que o DP
          aprova ou recusa.
        </p>

        {!unica && (
          <div className="space-y-2">
            <Label>Unidades que recebem o bloqueio</Label>
            <div className="space-y-2 rounded-md border p-3">
              {unidades.map((u) => (
                <label key={u.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={selecionadas.includes(u.id)} onCheckedChange={() => alternar(u.id)} />
                  {u.nome}
                </label>
              ))}
            </div>
          </div>
        )}

        {datas.length > 1 && (
          <p className="text-xs text-muted-foreground">{datas.length} dia(s) serão bloqueados.</p>
        )}
      </div>
    </DpDialogShell>
  );
}
