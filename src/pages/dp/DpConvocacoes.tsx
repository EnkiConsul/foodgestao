import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { BellRing, CalendarClock, Check, Clock, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { useDpConvocacoes, type NovaConvocacao } from "@/hooks/useDpConvocacoes";
import { useDpColaboradores } from "@/hooks/useDpColaboradores";
import { useDpTurnos } from "@/hooks/useDpTurnos";
import {
  STATUS_META, horasAceitas, snapshotDaConvocacao, statusEfetivo, validarConvocacao,
} from "@/lib/dp/convocacoes";
import { formatarHoras } from "@/lib/dp/jornada-utils";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const hoje = () => new Date().toISOString().slice(0, 10);
const emDias = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const rotuloData = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });

const FORM_INICIAL = {
  colaborador_id: "",
  unidade_id: null as string | null,
  turno_id: null as string | null,
  data: hoje(),
  entrada: "17:00",
  saida: "23:00",
  intervalo_minutos: 60,
  prazo_resposta: "" as string,
  observacao: "" as string,
};

export default function DpConvocacoes() {
  const [inicio, setInicio] = useState(hoje);
  const [fim, setFim] = useState(() => emDias(30));
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState(FORM_INICIAL);

  const { rows, isLoading, criar, cancelar, remover } = useDpConvocacoes(inicio, fim);
  const colaboradores = useDpColaboradores();
  const turnos = useDpTurnos();

  const intermitentes = useMemo(
    () => (colaboradores.data ?? []).filter((c: any) => c.regime === "intermitente" && c.ativo !== false),
    [colaboradores.data],
  );

  const selecionado = intermitentes.find((c: any) => c.id === form.colaborador_id) as any;
  const snap = snapshotDaConvocacao(form);

  const salvar = () => {
    const erros = validarConvocacao({
      colaboradorId: form.colaborador_id || null,
      regime: selecionado?.regime ?? null,
      input: form,
      existentes: rows.filter((r) => r.colaborador_id === form.colaborador_id) as any,
    });
    if (erros.length) {
      toast.error(erros[0].mensagem);
      return;
    }
    const payload: NovaConvocacao = {
      colaborador_id: form.colaborador_id,
      unidade_id: selecionado?.unidade_id ?? null,
      turno_id: form.turno_id,
      data: form.data,
      entrada: form.entrada,
      saida: form.saida,
      intervalo_minutos: form.intervalo_minutos,
      prazo_resposta: form.prazo_resposta ? new Date(form.prazo_resposta).toISOString() : null,
      observacao: form.observacao.trim() || null,
    };
    criar.mutate(payload, {
      onSuccess: () => {
        toast.success("Convocação enviada.");
        setAberto(false);
        setForm(FORM_INICIAL);
      },
      onError: (e: any) => toast.error(e.message ?? "Não foi possível enviar a convocação."),
    });
  };

  const aplicarTurno = (id: string) => {
    const t = (turnos.data ?? []).find((x) => x.id === id);
    setForm((f) => ({
      ...f,
      turno_id: id,
      entrada: t ? String(t.entrada).slice(0, 5) : f.entrada,
      saida: t ? String(t.saida).slice(0, 5) : f.saida,
      intervalo_minutos: t?.intervalo_minutos ?? f.intervalo_minutos,
    }));
  };

  const totalAceito = horasAceitas(rows as any);

  return (
    <DpPage>
      <Helmet><title>Convocações — Pessoas 360°</title></Helmet>
      <DpPageHeader
        icon={BellRing}
        title="Convocações"
        description="Chame colaboradores intermitentes para um dia e turno específicos."
        actions={
          <Button onClick={() => setAberto(true)} className="gap-2" disabled={!intermitentes.length}>
            <Plus className="h-4 w-4" /> Nova Convocação
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">Período</p>
          <div className="flex items-center gap-2 mt-2">
            <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="h-9" />
            <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className="h-9" />
          </div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">Convocações no período</p>
          <p className="text-2xl font-semibold mt-1">{rows.length}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">Horas aceitas</p>
          <p className="text-2xl font-semibold mt-1">{formatarHoras(totalAceito)}</p>
        </div>
      </div>

      <div className="grid gap-3 mt-4">
        {isLoading ? (
          <div className="bg-card border border-border rounded-2xl p-12 text-center text-muted-foreground">
            Carregando…
          </div>
        ) : !rows.length ? (
          <div className="bg-card border border-border rounded-2xl p-12 text-center text-muted-foreground">
            {intermitentes.length
              ? "Nenhuma convocação no período selecionado."
              : "Nenhum colaborador com contrato intermitente cadastrado."}
          </div>
        ) : (
          rows.map((c) => {
            const st = statusEfetivo(c as any);
            const meta = STATUS_META[st];
            return (
              <div key={c.id} className="bg-card border border-border rounded-2xl p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{c.dp_colaboradores?.nome ?? "Colaborador"}</p>
                    <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                      <CalendarClock className="h-4 w-4" /> {rotuloData(c.data)}
                      <Clock className="h-4 w-4 ml-2" />
                      {String(c.entrada).slice(0, 5)} → {String(c.saida).slice(0, 5)}
                      {c.termina_no_dia_seguinte ? " (+1)" : ""}
                      <span className="ml-2">{formatarHoras(Number(c.carga_prevista_horas))}</span>
                    </p>
                    {c.motivo_recusa ? (
                      <p className="text-sm text-destructive mt-1">Recusa: {c.motivo_recusa}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn("rounded-full", meta.className)}>{meta.label}</Badge>
                    {st === "pendente" ? (
                      <Button
                        size="sm" variant="outline" className="gap-1"
                        onClick={() => cancelar.mutate(c.id)} aria-label="Cancelar convocação"
                      >
                        <X className="h-4 w-4" /> Cancelar
                      </Button>
                    ) : null}
                    <Button
                      size="icon" variant="ghost" aria-label="Excluir convocação"
                      onClick={() => remover.mutate(c.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova Convocação</DialogTitle>
            <DialogDescription>
              O colaborador recebe a convocação no portal e pode aceitar ou recusar dentro do prazo.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Colaborador intermitente</Label>
              <Select value={form.colaborador_id} onValueChange={(v) => setForm((f) => ({ ...f, colaborador_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {intermitentes.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Turno (opcional)</Label>
              <Select value={form.turno_id ?? ""} onValueChange={aplicarTurno}>
                <SelectTrigger><SelectValue placeholder="Preencher a partir de um turno" /></SelectTrigger>
                <SelectContent>
                  {(turnos.data ?? []).filter((t) => t.ativo).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.nome} · {String(t.entrada).slice(0, 5)}–{String(t.saida).slice(0, 5)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Data</Label>
                <Input type="date" value={form.data} onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Prazo de resposta</Label>
                <Input
                  type="datetime-local" value={form.prazo_resposta}
                  onChange={(e) => setForm((f) => ({ ...f, prazo_resposta: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label>Entrada</Label>
                <Input type="time" value={form.entrada} onChange={(e) => setForm((f) => ({ ...f, entrada: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Saída</Label>
                <Input type="time" value={form.saida} onChange={(e) => setForm((f) => ({ ...f, saida: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Intervalo (min)</Label>
                <Input
                  type="number" min={0} value={form.intervalo_minutos}
                  onChange={(e) => setForm((f) => ({ ...f, intervalo_minutos: Number(e.target.value) }))}
                />
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              Carga prevista: <strong>{formatarHoras(snap.carga_prevista_horas)}</strong>
              {snap.termina_no_dia_seguinte ? " · termina no dia seguinte" : ""}
            </p>

            <div className="grid gap-2">
              <Label>Observação</Label>
              <Textarea
                rows={2} value={form.observacao}
                onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))}
                placeholder="Ex.: evento, reforço de equipe…"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={criar.isPending} className="gap-2">
              <Check className="h-4 w-4" /> Enviar convocação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DpPage>
  );
}
