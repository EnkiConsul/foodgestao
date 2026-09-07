import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
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
import {
  MARCACAO_LABEL,
  TIPOS_ORDEM,
  TIPO_LABEL,
  type OcorrenciaMarcacao,
  type OcorrenciaTipo,
} from "@/lib/dp/ocorrencias";
import type { RegistrarOcorrenciaInput } from "@/hooks/useDpOcorrencias";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  colaboradores: { id: string; nome: string }[];
  saving?: boolean;
  dataInicial?: string;
  onSubmit: (input: RegistrarOcorrenciaInput) => void;
}

const PEDE_ESTIMADO: OcorrenciaTipo[] = [
  "previsao_atraso",
  "previsao_saida_antecipada",
  "previsao_atraso_intervalo",
];
const PEDE_REAL: OcorrenciaTipo[] = [
  "atraso",
  "saida_antecipada",
  "atraso_intervalo",
  "esquecimento_marcacao",
];

/** Registro manual de ocorrência pelo gestor. */
export function OcorrenciaFormDialog({
  open,
  onOpenChange,
  colaboradores,
  saving,
  dataInicial,
  onSubmit,
}: Props) {
  const hoje = new Date().toISOString().slice(0, 10);
  const [colaboradorId, setColaboradorId] = useState("");
  const [data, setData] = useState(dataInicial ?? hoje);
  const [tipo, setTipo] = useState<OcorrenciaTipo>("falta");
  const [marcacao, setMarcacao] = useState<OcorrenciaMarcacao>("entrada");
  const [horarioEstimado, setHorarioEstimado] = useState("");
  const [horarioReal, setHorarioReal] = useState("");
  const [justificativa, setJustificativa] = useState("");

  useEffect(() => {
    if (!open) return;
    setColaboradorId("");
    setData(dataInicial ?? hoje);
    setTipo("falta");
    setMarcacao("entrada");
    setHorarioEstimado("");
    setHorarioReal("");
    setJustificativa("");
  }, [open, dataInicial, hoje]);

  const pedeEstimado = useMemo(() => PEDE_ESTIMADO.includes(tipo), [tipo]);
  const pedeReal = useMemo(() => PEDE_REAL.includes(tipo), [tipo]);

  const submit = () => {
    if (!colaboradorId) {
      toast.error("Escolha o colaborador.");
      return;
    }
    if (!data) {
      toast.error("Informe a data da rotina.");
      return;
    }
    onSubmit({
      colaboradorId,
      data,
      tipo,
      justificativa: justificativa.trim() || null,
      horarioEstimado: pedeEstimado ? horarioEstimado || null : null,
      horarioReal: pedeReal ? horarioReal || null : null,
      marcacaoAlvo: tipo === "esquecimento_marcacao" ? marcacao : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar ocorrência</DialogTitle>
          <DialogDescription>
            Vincule sempre à data da rotina, e não à data em que o horário aconteceu.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Colaborador *</Label>
            <Select value={colaboradorId} onValueChange={setColaboradorId}>
              <SelectTrigger>
                <SelectValue placeholder="Escolher" />
              </SelectTrigger>
              <SelectContent>
                {colaboradores.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Data da rotina *</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>O que aconteceu *</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as OcorrenciaTipo)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_ORDEM.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIPO_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {tipo === "esquecimento_marcacao" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Qual marcação</Label>
                <Select value={marcacao} onValueChange={(v) => setMarcacao(v as OcorrenciaMarcacao)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(MARCACAO_LABEL) as OcorrenciaMarcacao[]).map((m) => (
                      <SelectItem key={m} value={m}>
                        {MARCACAO_LABEL[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Horário informado</Label>
                <Input type="time" value={horarioReal} onChange={(e) => setHorarioReal(e.target.value)} />
              </div>
            </div>
          )}

          {pedeEstimado && (
            <div className="space-y-1.5">
              <Label>Horário estimado</Label>
              <Input
                type="time"
                value={horarioEstimado}
                onChange={(e) => setHorarioEstimado(e.target.value)}
              />
            </div>
          )}

          {pedeReal && tipo !== "esquecimento_marcacao" && (
            <div className="space-y-1.5">
              <Label>Horário real</Label>
              <Input type="time" value={horarioReal} onChange={(e) => setHorarioReal(e.target.value)} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Justificativa</Label>
            <Textarea
              rows={3}
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              placeholder="O que foi informado sobre o ocorrido"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
