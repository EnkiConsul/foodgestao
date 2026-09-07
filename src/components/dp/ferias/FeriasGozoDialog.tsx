import { useEffect, useMemo, useState } from "react";
import { format, parseISO, differenceInCalendarDays, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { FeriasGozo, FeriasPeriodo, GozoInput } from "@/hooks/useDpFerias";
import {
  FRACIONAMENTO_PADRAO, avaliarFracionamento, descreverFracionamento,
  type FracionamentoRegra,
} from "@/lib/dp/ferias-fracionamento";
import { FERIAS_ERRO_TEXTO } from "@/lib/dp/ferias-direito";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  periodos: FeriasPeriodo[];
  editing: FeriasGozo | null;
  defaultPeriodoId?: string | null;
  saving: boolean;
  /** Antecedência mínima do aviso definida pela empresa (dias). */
  antecedenciaDias: number;
  /** Regra de divisão das férias em períodos. */
  fracionamento?: FracionamentoRegra;
  /** Férias já marcadas (não canceladas) por período aquisitivo. */
  fracoesPorPeriodo?: Record<string, { id: string; dias: number }[]>;
  onSubmit: (input: GozoInput & { justificativa?: string | null }) => void;
};

const emptyForm: GozoInput = {
  periodo_id: "",
  colaborador_id: "",
  data_inicio: "",
  data_fim: "",
  dias_abono: 0,
  adiantar_13: false,
  aviso_em: null,
  status: "planejado",
  observacao: null,
};

export function FeriasGozoDialog({
  open, onOpenChange, periodos, editing, defaultPeriodoId, saving, antecedenciaDias,
  fracionamento = FRACIONAMENTO_PADRAO, fracoesPorPeriodo = {}, onSubmit,
}: Props) {
  const [form, setForm] = useState<GozoInput>(emptyForm);
  const [justificativa, setJustificativa] = useState("");

  useEffect(() => {
    if (!open) return;
    setJustificativa("");
    if (editing) {
      setForm({
        id: editing.id,
        periodo_id: editing.periodo_id,
        colaborador_id: editing.colaborador_id,
        data_inicio: editing.data_inicio,
        data_fim: editing.data_fim,
        dias_abono: editing.dias_abono ?? 0,
        adiantar_13: editing.adiantar_13 ?? false,
        aviso_em: editing.aviso_em,
        status: editing.status,
        observacao: editing.observacao,
      });
      return;
    }
    const p = periodos.find((x) => x.id === defaultPeriodoId) ?? null;
    setForm({
      ...emptyForm,
      periodo_id: p?.id ?? "",
      colaborador_id: p?.colaborador_id ?? "",
    });
  }, [open, editing, defaultPeriodoId, periodos]);

  const periodoSel = useMemo(
    () => periodos.find((p) => p.id === form.periodo_id) ?? null,
    [periodos, form.periodo_id],
  );

  const dias = useMemo(() => {
    if (!form.data_inicio || !form.data_fim) return 0;
    const d = differenceInCalendarDays(parseISO(form.data_fim), parseISO(form.data_inicio)) + 1;
    return d > 0 ? d : 0;
  }, [form.data_inicio, form.data_fim]);

  const totalConsumido = dias + (Number(form.dias_abono) || 0);
  const saldoPeriodo = periodoSel
    ? (periodoSel.dias_saldo ?? 0) + (editing ? (editing.dias ?? 0) + (editing.dias_abono ?? 0) : 0)
    : 0;
  const excede = !!periodoSel && totalConsumido > saldoPeriodo;

  const fracoesExistentes = useMemo(
    () =>
      (fracoesPorPeriodo[form.periodo_id] ?? []).filter((f) => !editing || f.id !== editing.id),
    [fracoesPorPeriodo, form.periodo_id, editing],
  );

  const avaliacaoFracao = useMemo(
    () =>
      avaliarFracionamento(
        dias,
        fracoesExistentes,
        Math.max(saldoPeriodo - totalConsumido, 0),
        fracionamento,
      ),
    [dias, fracoesExistentes, saldoPeriodo, totalConsumido, fracionamento],
  );
  const erroFracao =
    !excede && avaliacaoFracao.codigo ? FERIAS_ERRO_TEXTO[avaliacaoFracao.codigo] : null;

  const diasDeAviso = useMemo(() => {
    if (!form.data_inicio) return null;
    return differenceInCalendarDays(parseISO(form.data_inicio), new Date());
  }, [form.data_inicio]);
  const emCimaDaHora =
    !editing && diasDeAviso !== null && diasDeAviso < antecedenciaDias;
  const faltaJustificativa = emCimaDaHora && justificativa.trim().length < 3;

  const selectPeriodo = (id: string) => {
    const p = periodos.find((x) => x.id === id);
    setForm((f) => ({ ...f, periodo_id: id, colaborador_id: p?.colaborador_id ?? f.colaborador_id }));
  };

  const setInicio = (v: string) => {
    setForm((f) => {
      const next = { ...f, data_inicio: v };
      if (!f.data_fim && v) next.data_fim = format(addDays(parseISO(v), 29), "yyyy-MM-dd");
      if (f.data_fim && v && f.data_fim < v) next.data_fim = v;
      if (!f.aviso_em && v) next.aviso_em = format(addDays(parseISO(v), -30), "yyyy-MM-dd");
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar férias" : "Agendar férias"}</DialogTitle>
          <DialogDescription>
            As datas são validadas contra o saldo do período aquisitivo selecionado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Período aquisitivo</Label>
            <Select value={form.periodo_id} onValueChange={selectPeriodo} disabled={!!editing}>
              <SelectTrigger><SelectValue placeholder="Selecione o período" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {periodos.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.colaborador_nome ?? "Colaborador"} — {format(parseISO(p.inicio_aquisitivo), "dd/MM/yyyy")} a{" "}
                    {format(parseISO(p.fim_aquisitivo), "dd/MM/yyyy")} ({p.dias_saldo}d)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {periodoSel && (
              <p className="text-xs text-muted-foreground">
                Limite para gozo: {format(parseISO(periodoSel.limite_concessivo), "dd/MM/yyyy", { locale: ptBR })} · Saldo
                disponível: {saldoPeriodo} dias
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Início</Label>
              <Input type="date" value={form.data_inicio} onChange={(e) => setInicio(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Fim</Label>
              <Input
                type="date"
                min={form.data_inicio || undefined}
                value={form.data_fim}
                onChange={(e) => setForm((f) => ({ ...f, data_fim: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Abono pecuniário (dias)</Label>
              <Input
                type="number" min={0} max={10}
                value={form.dias_abono}
                onChange={(e) => setForm((f) => ({ ...f, dias_abono: Number(e.target.value) || 0 }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Aviso de férias em</Label>
              <Input
                type="date"
                value={form.aviso_em ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, aviso_em: e.target.value || null }))}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border p-3">
            <div>
              <p className="text-sm font-medium">Adiantar 13º salário</p>
              <p className="text-xs text-muted-foreground">Primeira parcela paga junto às férias.</p>
            </div>
            <Switch
              checked={form.adiantar_13}
              onCheckedChange={(v) => setForm((f) => ({ ...f, adiantar_13: v }))}
            />
          </div>

          {emCimaDaHora && (
            <div className="space-y-2 rounded-xl border border-amber-400/60 bg-amber-500/10 p-3">
              <p className="text-sm font-medium text-amber-700">
                Aviso com {diasDeAviso} dia(s) de antecedência — a empresa pede {antecedenciaDias}.
              </p>
              <Label>Justificativa</Label>
              <Textarea
                rows={2}
                value={justificativa}
                placeholder="Explique por que estas férias estão sendo marcadas em cima da hora."
                onChange={(e) => setJustificativa(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Observação</Label>
            <Textarea
              rows={2}
              value={form.observacao ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))}
            />
          </div>

          <div className="rounded-xl bg-muted/50 p-3 text-sm">
            <span className="font-semibold">{dias}</span> dias de gozo
            {form.dias_abono > 0 && <> + <span className="font-semibold">{form.dias_abono}</span> de abono</> } ={" "}
            <span className="font-semibold">{totalConsumido}</span> dias do período.
            {excede && (
              <p className="mt-1 text-destructive">Excede o saldo disponível ({saldoPeriodo} dias).</p>
            )}
            {periodoSel && (
              <p className="mt-1 text-xs text-muted-foreground">
                {avaliacaoFracao.totalFracoes}º período deste ano de férias ·{" "}
                {descreverFracionamento(fracionamento)}
              </p>
            )}
            {erroFracao && <p className="mt-1 text-destructive">{erroFracao}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={
              saving || excede || faltaJustificativa || !!erroFracao ||
              !form.periodo_id || !form.data_inicio || !form.data_fim
            }
            onClick={() => onSubmit({ ...form, justificativa: justificativa.trim() || null })}
          >
            {saving ? "Salvando…" : editing ? "Salvar" : "Programar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
