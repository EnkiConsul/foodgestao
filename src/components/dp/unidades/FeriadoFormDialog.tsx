import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DIAS_SEMANA, FERIADO_TIPO_LABEL, MESES, ORDINAIS,
  descricaoRegra, type FeriadoRegra, type FeriadoTipo,
} from "@/lib/dp/feriados";
import type { FeriadoInput } from "@/hooks/useDpFeriados";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feriado?: FeriadoRegra | null;
  saving?: boolean;
  onSubmit: (input: FeriadoInput) => void;
}

/** Cadastro de um feriado da unidade nos três formatos possíveis. */
export function FeriadoFormDialog({ open, onOpenChange, feriado = null, saving, onSubmit }: Props) {
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<FeriadoTipo>("anual");
  const [data, setData] = useState("");
  const [dia, setDia] = useState("1");
  const [mes, setMes] = useState("1");
  const [ordinal, setOrdinal] = useState("1");
  const [diaSemana, setDiaSemana] = useState("0");
  const [observacao, setObservacao] = useState("");

  useEffect(() => {
    if (!open) return;
    setNome(feriado?.nome ?? "");
    setTipo(feriado?.tipo ?? "anual");
    setData(feriado?.data ?? "");
    setDia(String(feriado?.dia ?? 1));
    setMes(String(feriado?.mes ?? 1));
    setOrdinal(String(feriado?.ordinal ?? 1));
    setDiaSemana(String(feriado?.dia_semana ?? 0));
    setObservacao(feriado?.observacao ?? "");
  }, [open, feriado]);

  const previa = descricaoRegra({
    id: "previa",
    nome,
    tipo,
    data: data || null,
    dia: Number(dia),
    mes: Number(mes),
    ordinal: Number(ordinal),
    dia_semana: Number(diaSemana),
  });

  const invalido = !nome.trim() || (tipo === "especifica" && !data);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{feriado ? "Editar feriado" : "Novo feriado"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Aniversário da cidade"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Como esse feriado acontece</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as FeriadoTipo)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(FERIADO_TIPO_LABEL) as FeriadoTipo[]).map((t) => (
                  <SelectItem key={t} value={t}>{FERIADO_TIPO_LABEL[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {tipo === "especifica" && (
            <div className="space-y-1.5">
              <Label>Data *</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          )}

          {tipo === "anual" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Dia</Label>
                <Select value={dia} onValueChange={setDia}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                      <SelectItem key={d} value={String(d)}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Mês</Label>
                <Select value={mes} onValueChange={setMes}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MESES.map((m, i) => (
                      <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {tipo === "relativa" && (
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Ocorrência</Label>
                <Select value={ordinal} onValueChange={setOrdinal}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ORDINAIS.map((o) => (
                      <SelectItem key={o.valor} value={String(o.valor)}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Dia</Label>
                <Select value={diaSemana} onValueChange={setDiaSemana}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DIAS_SEMANA.map((d, i) => (
                      <SelectItem key={d} value={String(i)}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Mês</Label>
                <Select value={mes} onValueChange={setMes}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MESES.map((m, i) => (
                      <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <p className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">{previa}</p>

          <div className="space-y-1.5">
            <Label>Observação</Label>
            <Textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Opcional"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={invalido || saving}
            onClick={() =>
              onSubmit({
                id: feriado?.id,
                nome,
                tipo,
                data: tipo === "especifica" ? data : null,
                dia: tipo === "anual" ? Number(dia) : null,
                mes: tipo === "especifica" ? null : Number(mes),
                ordinal: tipo === "relativa" ? Number(ordinal) : null,
                dia_semana: tipo === "relativa" ? Number(diaSemana) : null,
                ativo: feriado?.ativo ?? true,
                observacao,
              })
            }
          >
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
