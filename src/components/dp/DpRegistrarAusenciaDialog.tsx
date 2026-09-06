import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useAuth } from "@/hooks/useAuth";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Database } from "@/integrations/supabase/types";

type Tipo = Database["public"]["Enums"]["dp_solicitacao_tipo"];

const TIPO_LABEL: Record<Tipo, string> = {
  folga: "Folga",
  ferias: "Férias",
  atestado: "Atestado",
  adiantamento: "Adiantamento",
  outros: "Outros",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Data inicial sugerida (AAAA-MM-DD), ex.: vinda do calendário de folgas. */
  dataInicial?: string | null;
}

/**
 * Registro direto de ausência pelo gestor, a partir da tela de Operação.
 * Férias, atestados e outros afastamentos entram já aprovados e aparecem na
 * Operação; pedidos de folga continuam pendentes de aprovação.
 */
export function DpRegistrarAusenciaDialog({ open, onOpenChange, dataInicial }: Props) {
  const { selectedCompanyId } = useCompanyContext();
  const { user } = useAuth();
  const qc = useQueryClient();
  const colabs = useDpColaboradores();
  const [form, setForm] = useState({
    colaborador_id: "",
    tipo: "atestado" as Tipo,
    data_alvo: "",
    data_fim: "",
    motivo: "",
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      colaborador_id: "",
      tipo: "atestado",
      data_alvo: dataInicial ?? "",
      data_fim: dataInicial ?? "",
      motivo: "",
    });
  }, [open, dataInicial]);

  useEffect(() => {
    if (!open) return;
    if (!form.data_fim || !form.data_alvo) return;
    if (form.data_fim < form.data_alvo) setForm((f) => ({ ...f, data_fim: f.data_alvo }));
  }, [open, form.data_alvo, form.data_fim]);

  const salvar = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) throw new Error("Empresa não selecionada");
      if (!form.colaborador_id) throw new Error("Selecione um colaborador");
      if (!form.data_alvo) throw new Error("Informe a data inicial");
      if (form.motivo.length > 500) throw new Error("Observações muito longas (máx. 500)");
      const aprovada = form.tipo !== "folga";
      const { error } = await supabase.from("dp_solicitacoes").insert({
        company_id: selectedCompanyId,
        colaborador_id: form.colaborador_id,
        tipo: form.tipo,
        data_alvo: form.data_alvo,
        data_fim: form.data_fim || null,
        motivo: form.motivo.trim() || null,
        criado_por: user?.id,
        status: aprovada ? "aprovada" : "pendente",
      });
      if (error) throw error;
      return aprovada;
    },
    onSuccess: (aprovada) => {
      toast.success(aprovada ? "Ausência registrada" : "Pedido de folga criado", {
        description: aprovada
          ? "Já aparece na Operação do dia."
          : "Ficará pendente até a aprovação do gestor.",
      });
      qc.invalidateQueries({ queryKey: ["dp_solicitacoes"] });
      qc.invalidateQueries({ queryKey: ["dp_folgas"] });
      qc.invalidateQueries({ queryKey: ["dp_panorama_base"] });
      qc.invalidateQueries({ queryKey: ["dp_home_stats"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error("Erro", { description: e instanceof Error ? e.message : String(e) }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar Ausência</DialogTitle>
          <DialogDescription>
            Férias, atestados e afastamentos entram direto na Operação do dia. Pedidos de folga
            ficam pendentes de aprovação.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-1.5">
            <Label>Colaborador *</Label>
            <Select
              value={form.colaborador_id}
              onValueChange={(v) => setForm({ ...form, colaborador_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {(colabs.data ?? [])
                  .filter((c) => c.ativo !== false)
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                {(colabs.data ?? []).filter((c) => c.ativo !== false).length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    Nenhum colaborador ativo. Cadastre em Colaboradores.
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Tipo *</Label>
            <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as Tipo })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TIPO_LABEL) as Tipo[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {TIPO_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Data inicial *</Label>
              <Input
                type="date"
                value={form.data_alvo}
                onChange={(e) => setForm({ ...form, data_alvo: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Data final</Label>
              <Input
                type="date"
                min={form.data_alvo || undefined}
                value={form.data_fim}
                onChange={(e) => setForm({ ...form, data_fim: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Justificativa</Label>
            <Textarea
              rows={3}
              maxLength={500}
              placeholder="Motivo, contexto ou observação (opcional)"
              value={form.motivo}
              onChange={(e) => setForm({ ...form, motivo: e.target.value })}
            />
            <div className="text-right text-[10px] text-muted-foreground">
              {form.motivo.length}/500
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={salvar.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            {salvar.isPending ? "Salvando..." : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
