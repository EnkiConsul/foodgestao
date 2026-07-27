import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Clock, Plus, Trash2, CalendarOff, AlertTriangle, Info } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDpJornadas, useDpColaboradorJornadas } from "@/hooks/useDpJornadas";
import { TIPO_ESCALA_LABEL, TURNO_LABEL } from "@/lib/dp/dsr-rules";
import { contratoPolicy } from "@/lib/dp/contrato-policy";

import {
  calcularCargaComFolgaFixa,
  formatarHoras,
  resumoJornadaTexto,
  validarCargaSemanal,
} from "@/lib/dp/jornada-utils";


const DIAS_SEMANA = [
  { v: "0", label: "Domingo" }, { v: "1", label: "Segunda" }, { v: "2", label: "Terça" },
  { v: "3", label: "Quarta" }, { v: "4", label: "Quinta" }, { v: "5", label: "Sexta" },
  { v: "6", label: "Sábado" },
];

const hoje = () => new Date().toISOString().slice(0, 10);
const fmt = (d?: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR") : null);

interface Props {
  colaborador: { id: string; nome: string; regime?: string | null } | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

/** Vínculo de jornada do colaborador: vigências, histórico e overrides individuais. */
export function ColaboradorJornadaDialog({ colaborador, open, onOpenChange }: Props) {
  const { jornadas } = useDpJornadas();
  const { vinculos, isLoading, vincular, encerrar, remover, saving } = useDpColaboradorJornadas(colaborador?.id);
  // A jornada é sempre o padrão esperado; o contrato define como esse padrão é lido.
  const policy = contratoPolicy(colaborador?.regime);

  const [jornadaId, setJornadaId] = useState("");
  const [inicio, setInicio] = useState(hoje());
  const [folgaFixa, setFolgaFixa] = useState<string>("none");
  const [obs, setObs] = useState("");

  const jornadasAtivas = useMemo(() => jornadas.filter((j) => j.ativo), [jornadas]);
  const vigente = useMemo(
    () => vinculos.find((v) => !v.fim || v.fim >= hoje()),
    [vinculos],
  );
  const jornadaSelecionada = useMemo(
    () => jornadasAtivas.find((j) => j.id === jornadaId) ?? null,
    [jornadasAtivas, jornadaId],
  );

  /** Carga prevista só existe quando o contrato valida carga e há folga fixa escolhida. */
  const cargaPrevista = useMemo(() => {
    if (!policy.validaCargaSemanal || !jornadaSelecionada || folgaFixa === "none") return null;
    return validarCargaSemanal(
      calcularCargaComFolgaFixa(jornadaSelecionada.horarios, Number(folgaFixa)),
    );
  }, [policy.validaCargaSemanal, jornadaSelecionada, folgaFixa]);




  const limpar = () => {
    setJornadaId(""); setInicio(hoje()); setFolgaFixa("none"); setObs("");
  };

  const salvar = async () => {
    if (!jornadaId) { toast.error("Selecione uma jornada"); return; }
    try {
      // Encerra o vínculo aberto no dia anterior ao início do novo, preservando o histórico.
      if (vigente && !vigente.fim) {
        const d = new Date(`${inicio}T12:00:00`);
        d.setDate(d.getDate() - 1);
        await encerrar({ id: vigente.id, fim: d.toISOString().slice(0, 10) });
      }
      await vincular({
        jornada_id: jornadaId,
        inicio,
        folga_fixa_semana_override: folgaFixa === "none" ? null : Number(folgaFixa),
        observacoes: obs.trim() || null,
      });
      toast.success("Jornada vinculada");
      limpar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível vincular a jornada");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" aria-hidden="true" />
            {policy.jornadaLabel} de {colaborador?.nome}
          </DialogTitle>
          <DialogDescription>
            Vincule um modelo de escala com vigência. Restrições de menores de 18 anos são validadas ao salvar.
          </DialogDescription>
        </DialogHeader>

        {policy.jornadaHint && (
          <p className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span>
              <strong className="text-foreground">Contrato {policy.label}.</strong> {policy.jornadaHint}
            </span>
          </p>
        )}

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Novo vínculo</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cj-jornada">{policy.jornadaLabel}</Label>
              <Select value={jornadaId} onValueChange={setJornadaId}>
                <SelectTrigger id="cj-jornada">
                  <SelectValue placeholder={jornadasAtivas.length ? "Selecione" : "Nenhuma jornada ativa cadastrada"} />
                </SelectTrigger>
                <SelectContent>
                  {jornadasAtivas.map((j) => (
                    <SelectItem key={j.id} value={j.id}>
                      {j.nome} — {TIPO_ESCALA_LABEL[j.tipo_escala] ?? j.tipo_escala} · {TURNO_LABEL[j.turno] ?? j.turno}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cj-inicio">Início da vigência</Label>
              <Input id="cj-inicio" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </div>

            {policy.exigeFolgaSemanal && (
              <div className="space-y-1.5">
                <Label htmlFor="cj-folga">Folga semanal</Label>
                <Select value={folgaFixa} onValueChange={setFolgaFixa}>
                  <SelectTrigger id="cj-folga"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Folga variável conforme escala</SelectItem>
                    {DIAS_SEMANA.map((d) => <SelectItem key={d.v} value={d.v}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}


            {jornadaSelecionada && (
              <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-xs sm:col-span-2">
                <div>
                  <p className="font-medium text-foreground">
                    {policy.jornadaComoDisponibilidade ? "Disponibilidade habitual" : "Horários da jornada"}
                  </p>
                  <p className="text-muted-foreground">
                    {jornadaSelecionada.horarios.length
                      ? resumoJornadaTexto(jornadaSelecionada.horarios)
                      : "Nenhum horário cadastrado nesta jornada."}
                  </p>
                </div>
                {!policy.validaCargaSemanal ? (
                  <p className="text-muted-foreground">
                    {policy.jornadaComoDisponibilidade
                      ? "As horas devidas serão apuradas pelas convocações aceitas — este padrão não gera obrigação de trabalho."
                      : "Este vínculo não é validado pelos limites celetistas de carga semanal."}
                  </p>
                ) : folgaFixa === "none" ? (
                  <p className="text-muted-foreground">
                    Carga semanal calculada conforme a escala — apenas os dias efetivamente escalados são contados.
                  </p>
                ) : (
                  <>
                    <p className="text-foreground">
                      Folga semanal: <strong>{DIAS_SEMANA.find((d) => d.v === folgaFixa)?.label}</strong> · Carga
                      semanal prevista:{" "}
                      <strong className="tabular-nums">{formatarHoras(cargaPrevista?.carga ?? 0)}</strong>
                    </p>
                    {cargaPrevista?.excede && (
                      <p className="flex items-center gap-1.5 text-destructive">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        Acima de {cargaPrevista.limite}h semanais ({formatarHoras(cargaPrevista.excedente)} de
                        excedente). Revise a combinação antes de salvar.
                      </p>
                    )}
                  </>
                )}

              </div>
            )}



            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cj-obs">Observações</Label>
              <Textarea id="cj-obs" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
            </div>
          </div>
          <Button onClick={() => void salvar()} disabled={saving} className="gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" />
            {saving ? "Salvando..." : "Vincular jornada"}
          </Button>
        </section>

        <section className="space-y-2 border-t pt-4">
          <h3 className="text-sm font-semibold">Histórico de vigências</h3>
          {isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : vinculos.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarOff className="h-4 w-4" aria-hidden="true" /> Nenhuma jornada vinculada.
            </p>
          ) : (
            <ul className="divide-y">
              {vinculos.map((v) => {
                const ativo = !v.fim || v.fim >= hoje();
                return (
                  <li key={v.id} className="flex items-start justify-between gap-2 py-2">
                    <div className="min-w-0 text-sm">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        {v.jornada?.nome ?? "Jornada removida"}
                        {ativo && <Badge>Vigente</Badge>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {fmt(v.inicio)} → {fmt(v.fim) ?? "sem término"}
                        {v.folga_fixa_semana_override != null &&
                          ` · folga fixa: ${DIAS_SEMANA[v.folga_fixa_semana_override]?.label}`}
                        {v.horario_entrada_override &&
                          ` · ${v.horario_entrada_override.slice(0, 5)}–${v.horario_saida_override?.slice(0, 5) ?? "—"}`}
                      </p>
                      {v.observacoes && <p className="text-xs text-muted-foreground">{v.observacoes}</p>}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {ativo && !v.fim && (
                        <Button
                          size="sm" variant="outline" disabled={saving}
                          onClick={() => void encerrar({ id: v.id, fim: hoje() })}
                        >
                          Encerrar hoje
                        </Button>
                      )}
                      <Button
                        size="icon" variant="ghost" aria-label="Remover vínculo" disabled={saving}
                        onClick={() => void remover(v.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
