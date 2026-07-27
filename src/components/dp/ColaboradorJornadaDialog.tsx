import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Clock, Plus, Trash2, CalendarOff } from "lucide-react";
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

const DIAS_SEMANA = [
  { v: "0", label: "Domingo" }, { v: "1", label: "Segunda" }, { v: "2", label: "Terça" },
  { v: "3", label: "Quarta" }, { v: "4", label: "Quinta" }, { v: "5", label: "Sexta" },
  { v: "6", label: "Sábado" },
];

const hoje = () => new Date().toISOString().slice(0, 10);
const fmt = (d?: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR") : null);

interface Props {
  colaborador: { id: string; nome: string } | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

/** Vínculo de jornada do colaborador: vigências, histórico e overrides individuais. */
export function ColaboradorJornadaDialog({ colaborador, open, onOpenChange }: Props) {
  const { jornadas } = useDpJornadas();
  const { vinculos, isLoading, vincular, encerrar, remover, saving } = useDpColaboradorJornadas(colaborador?.id);

  const [jornadaId, setJornadaId] = useState("");
  const [inicio, setInicio] = useState(hoje());
  const [folgaFixa, setFolgaFixa] = useState<string>("none");
  const [entrada, setEntrada] = useState("");
  const [saida, setSaida] = useState("");
  const [obs, setObs] = useState("");

  const jornadasAtivas = useMemo(() => jornadas.filter((j) => j.ativo), [jornadas]);
  const vigente = useMemo(
    () => vinculos.find((v) => !v.fim || v.fim >= hoje()),
    [vinculos],
  );

  const limpar = () => {
    setJornadaId(""); setInicio(hoje()); setFolgaFixa("none");
    setEntrada(""); setSaida(""); setObs("");
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
        horario_entrada_override: entrada || null,
        horario_saida_override: saida || null,
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
            Jornada de {colaborador?.nome}
          </DialogTitle>
          <DialogDescription>
            Vincule um modelo de escala com vigência. Restrições de menores de 18 anos são validadas ao salvar.
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Novo vínculo</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cj-jornada">Jornada</Label>
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

            <div className="space-y-1.5">
              <Label htmlFor="cj-folga">Folga fixa semanal (override)</Label>
              <Select value={folgaFixa} onValueChange={setFolgaFixa}>
                <SelectTrigger id="cj-folga"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Usar a da jornada</SelectItem>
                  {DIAS_SEMANA.map((d) => <SelectItem key={d.v} value={d.v}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cj-ent">Entrada (override)</Label>
              <Input id="cj-ent" type="time" value={entrada} onChange={(e) => setEntrada(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cj-sai">Saída (override)</Label>
              <Input id="cj-sai" type="time" value={saida} onChange={(e) => setSaida(e.target.value)} />
            </div>

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
