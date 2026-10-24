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
  DIAS_SEMANA, FERIADO_TIPO_LABEL, FERIADOS_MOVEIS, MESES, ORDINAIS,
  dataFeriadoMovel, descricaoRegra, type FeriadoRegra, type FeriadoTipo, type FeriadoMovel,
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
  const [movel, setMovel] = useState<FeriadoMovel>("carnaval");
  const [data, setData] = useState("");
  const [dia, setDia] = useState("1");
  const [mes, setMes] = useState("1");
  const [ordinal, setOrdinal] = useState("1");
  const [diaSemana, setDiaSemana] = useState("0");
  const [observacao, setObservacao] = useState("");
  const [anoInicio, setAnoInicio] = useState("");

  useEffect(() => {
    if (!open) return;
    setNome(feriado?.nome ?? "");
    setTipo(feriado?.tipo ?? "anual");
    setMovel(feriado?.codigo_movel ?? "carnaval");
    setData(feriado?.data ?? "");
    setDia(String(feriado?.dia ?? 1));
    setMes(String(feriado?.mes ?? 1));
    setOrdinal(String(feriado?.ordinal ?? 1));
    setDiaSemana(String(feriado?.dia_semana ?? 0));
    setObservacao(feriado?.observacao ?? "");
    setAnoInicio(feriado?.ano_inicio ? String(feriado.ano_inicio) : "");
  }, [open, feriado]);

  const anoValido = /^\d{4}$/.test(anoInicio) && Number(anoInicio) >= 1800 && Number(anoInicio) <= 2200;
  const previa = descricaoRegra({
    id: "previa",
    nome,
    tipo,
    codigo_movel: movel,
    data: data || null,
    dia: Number(dia),
    mes: Number(mes),
    ordinal: Number(ordinal),
    dia_semana: Number(diaSemana),
    ano_inicio: anoValido ? Number(anoInicio) : null,
  });

  const invalido =
    (tipo !== "movel" && !nome.trim()) || (tipo === "especifica" && !data) || (tipo !== "especifica" && anoInicio !== "" && !anoValido);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[100dvh] w-full min-w-0 max-w-full flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-auto sm:max-h-[92dvh] sm:max-w-md sm:rounded-lg">
        <DialogHeader className="shrink-0 border-b p-4 pr-12 text-left">
          <DialogTitle className="break-words">{feriado ? "Editar feriado" : "Novo feriado"}</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 [&_input]:min-w-0 [&_input]:max-w-full [&_input]:min-h-11 [&_input]:text-base [&_textarea]:text-base [&_button[role=combobox]]:min-h-11 [&_button[role=combobox]]:min-w-0 [&_button[role=combobox]>span]:truncate">
          {tipo !== "movel" && <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Aniversário da cidade"
            />
          </div>}

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

          {tipo === "movel" && (
            <div className="space-y-1.5">
              <Label>Feriado *</Label>
              <Select value={movel} onValueChange={(v) => setMovel(v as FeriadoMovel)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(FERIADOS_MOVEIS) as [FeriadoMovel, { nome: string }][]).map(([codigo, f]) => (
                    <SelectItem key={codigo} value={codigo}>{f.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Cadastre somente se a data for adotada como feriado nesta unidade, conforme a legislação local ou convenção aplicável.</p>
              <div className="space-y-1 text-sm tabular-nums">
                {[new Date().getFullYear(), new Date().getFullYear() + 1].map((ano) => {
                  const data = dataFeriadoMovel(movel, ano);
                  return <p key={ano}>{ano}: {data?.split("-").reverse().join("/")}</p>;
                })}
              </div>
            </div>
          )}

          {tipo === "anual" && (
            <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2">
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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

          {tipo !== "especifica" && (
            <div className="space-y-1.5">
              <Label>Ano de início (opcional)</Label>
              <Input
                inputMode="numeric"
                maxLength={4}
                value={anoInicio}
                onChange={(e) => setAnoInicio(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="Ex: 2024 — deixe vazio se vale para todos os anos"
              />
              <p className="text-xs text-muted-foreground">
                Antes desse ano o feriado não é considerado nas escalas, folgas e férias.
              </p>
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

        <DialogFooter className="shrink-0 flex-row gap-2 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))] [&>button]:min-h-11 [&>button]:flex-1 sm:[&>button]:flex-none">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={invalido || saving}
            onClick={() =>
              onSubmit({
                id: feriado?.id,
                nome: tipo === "movel" ? FERIADOS_MOVEIS[movel].nome : nome,
                tipo,
                codigo_movel: tipo === "movel" ? movel : null,
                data: tipo === "especifica" ? data : null,
                dia: tipo === "anual" ? Number(dia) : null,
                mes: tipo === "anual" || tipo === "relativa" ? Number(mes) : null,
                ordinal: tipo === "relativa" ? Number(ordinal) : null,
                dia_semana: tipo === "relativa" ? Number(diaSemana) : null,
                ano_inicio: tipo !== "especifica" && anoValido ? Number(anoInicio) : null,
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
