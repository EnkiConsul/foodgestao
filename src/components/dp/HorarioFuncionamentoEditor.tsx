import { useEffect, useState } from "react";
import { Store, Save, Plus, Trash2, CopyPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { DIAS_SEMANA, ORDEM_EXIBICAO } from "@/lib/dp/jornada-utils";
import {
  formatarFuncionamento, funcionamentoVazio, periodoVazio, periodosDoDia,
  type HorarioFuncionamentoDia, type HorarioFuncionamentoPeriodo,
} from "@/lib/dp/turno-utils";
import { useDpHorariosFuncionamento } from "@/hooks/useDpHorariosFuncionamento";
import { toast } from "sonner";

const DIA_LONGO: Record<number, string> = Object.fromEntries(
  DIAS_SEMANA.map((d) => [d.v, d.longo]),
);
const DIA_CURTO: Record<number, string> = Object.fromEntries(
  DIAS_SEMANA.map((d) => [d.v, d.curto]),
);

interface HorarioFuncionamentoEditorProps {
  unidadeId: string | null;
  /** Esconde o botão próprio: quem salva é o rodapé do diálogo da unidade. */
  semRodape?: boolean;
  /** Entrega a função de salvar para o container (usado com semRodape). */
  onRegistrarSalvar?: (salvar: (() => Promise<void>) | null) => void;
}

/** Períodos sobrepostos são permitidos — apenas sinalizados. */
function temSobreposicao(periodos: HorarioFuncionamentoPeriodo[]): boolean {
  const min = (v: string | null) => {
    if (!v) return null;
    const [h, m] = v.split(":").map(Number);
    return h * 60 + (m || 0);
  };
  const faixas = periodos
    .map((p) => {
      const a = min(p.hora_abertura);
      const f0 = min(p.hora_fechamento);
      if (a === null || f0 === null) return null;
      return [a, f0 <= a ? f0 + 1440 : f0] as [number, number];
    })
    .filter((x): x is [number, number] => !!x)
    .sort((x, y) => x[0] - y[0]);
  return faixas.some((f, i) => i > 0 && f[0] < faixas[i - 1][1]);
}

export function HorarioFuncionamentoEditor({ unidadeId, semRodape = false, onRegistrarSalvar }: HorarioFuncionamentoEditorProps) {
  const { horarios, isLoading, salvar } = useDpHorariosFuncionamento(unidadeId);
  const [dias, setDias] = useState<HorarioFuncionamentoDia[]>([]);

  useEffect(() => {
    const base = ORDEM_EXIBICAO.map((d) => {
      const salvo = horarios.find((h) => h.dia_semana === d);
      if (!salvo) return funcionamentoVazio(d);
      return { ...salvo, periodos: periodosDoDia(salvo) };
    });
    setDias(base);
  }, [horarios]);

  const atualizar = (dia: number, patch: Partial<HorarioFuncionamentoDia>) =>
    setDias((prev) => prev.map((d) => (d.dia_semana === dia ? { ...d, ...patch } : d)));

  const atualizarPeriodo = (
    dia: number,
    index: number,
    patch: Partial<HorarioFuncionamentoPeriodo>,
  ) =>
    setDias((prev) =>
      prev.map((d) =>
        d.dia_semana === dia
          ? {
              ...d,
              periodos: (d.periodos ?? []).map((p, i) => (i === index ? { ...p, ...patch } : p)),
            }
          : d,
      ),
    );

  const adicionarPeriodo = (dia: number) =>
    setDias((prev) =>
      prev.map((d) =>
        d.dia_semana === dia ? { ...d, periodos: [...(d.periodos ?? []), periodoVazio()] } : d,
      ),
    );

  const removerPeriodo = (dia: number, index: number) =>
    setDias((prev) =>
      prev.map((d) =>
        d.dia_semana === dia
          ? { ...d, periodos: (d.periodos ?? []).filter((_, i) => i !== index) }
          : d,
      ),
    );

  /** Copia um período para os dias marcados (substitui se o nome coincidir). */
  const aplicarEmDias = (periodo: HorarioFuncionamentoPeriodo, destinos: number[]) => {
    setDias((prev) =>
      prev.map((d) => {
        if (!destinos.includes(d.dia_semana)) return d;
        const atuais = d.periodos ?? [];
        const nome = (periodo.nome ?? "").trim().toLowerCase();
        const idx = nome
          ? atuais.findIndex((p) => (p.nome ?? "").trim().toLowerCase() === nome)
          : -1;
        const proximos = idx >= 0
          ? atuais.map((p, i) => (i === idx ? { ...periodo } : p))
          : [...atuais, { ...periodo }];
        return { ...d, aberto: true, periodos: proximos };
      }),
    );
    toast.success("Período aplicado nos dias selecionados.");
  };

  const submit = async () => {
    try {
      await salvar.mutateAsync(dias);
      toast.success("Horário de funcionamento salvo.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  };

  // Permite o rodapé do diálogo da unidade salvar dados + funcionamento juntos.
  useEffect(() => {
    if (!onRegistrarSalvar) return;
    onRegistrarSalvar(unidadeId ? async () => { await salvar.mutateAsync(dias); } : null);
    return () => onRegistrarSalvar(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dias, unidadeId, onRegistrarSalvar]);

  if (!unidadeId) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          Salve a unidade para definir o horário de funcionamento.
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return <Skeleton className="h-64 w-full rounded-xl" />;
  }

  return (
    <div className="space-y-3">
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Store className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Quando a loja está aberta. Pode ter mais de um período no mesmo dia (ex.: almoço e jantar).
        Serve de referência para turnos, escala e cobertura — não é jornada de trabalho.
      </p>

      {dias.map((d) => {
        const periodos = d.periodos ?? [];
        return (
          <Card key={d.dia_semana}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{DIA_LONGO[d.dia_semana]}</p>
                  <p className="text-xs text-muted-foreground">{formatarFuncionamento(d)}</p>
                </div>
                <Switch
                  checked={d.aberto}
                  onCheckedChange={(v) => atualizar(d.dia_semana, { aberto: v })}
                  aria-label={`${DIA_LONGO[d.dia_semana]}: ${d.aberto ? "fechar" : "abrir"}`}
                />
              </div>

              {d.aberto && (
                <div className="space-y-3">
                  {periodos.map((p, i) => (
                    <div key={i} className="space-y-2 rounded-lg border p-3">
                      <div className="flex items-center gap-2">
                        <Input
                          className="h-10"
                          placeholder={`Nome do período (ex.: ${i === 0 ? "Almoço" : "Jantar"})`}
                          aria-label={`Nome do período ${i + 1} de ${DIA_LONGO[d.dia_semana]}`}
                          value={p.nome ?? ""}
                          onChange={(e) => atualizarPeriodo(d.dia_semana, i, { nome: e.target.value })}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10 shrink-0 text-destructive"
                          aria-label="Remover período"
                          disabled={periodos.length === 1}
                          onClick={() => removerPeriodo(d.dia_semana, i)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor={`abre-${d.dia_semana}-${i}`} className="text-xs">Abre</Label>
                          <Input
                            id={`abre-${d.dia_semana}-${i}`}
                            type="time"
                            className="h-11"
                            value={p.hora_abertura ?? ""}
                            onChange={(e) =>
                              atualizarPeriodo(d.dia_semana, i, { hora_abertura: e.target.value || null })
                            }
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor={`fecha-${d.dia_semana}-${i}`} className="text-xs">Fecha</Label>
                          <Input
                            id={`fecha-${d.dia_semana}-${i}`}
                            type="time"
                            className="h-11"
                            value={p.hora_fechamento ?? ""}
                            onChange={(e) =>
                              atualizarPeriodo(d.dia_semana, i, { hora_fechamento: e.target.value || null })
                            }
                          />
                        </div>
                      </div>
                      <AplicarEmDiasBotao
                        origem={d.dia_semana}
                        periodo={p}
                        onAplicar={(destinos) => aplicarEmDias(p, destinos)}
                      />
                    </div>
                  ))}

                  {temSobreposicao(periodos) && (
                    <p className="text-xs text-muted-foreground">
                      Os períodos deste dia se sobrepõem. Isso é permitido — é comum o jantar
                      começar antes do fim do almoço.
                    </p>
                  )}

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10"
                    onClick={() => adicionarPeriodo(d.dia_semana)}
                  >
                    <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    Adicionar período
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {!semRodape && (
        <div className="sticky bottom-0 -mx-1 bg-background/95 px-1 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
          <Button className="h-11 w-full" onClick={submit} disabled={salvar.isPending}>
            <Save className="mr-2 h-4 w-4" aria-hidden="true" />
            {salvar.isPending ? "Salvando..." : "Salvar horário de funcionamento"}
          </Button>
        </div>
      )}
    </div>
  );
}

function AplicarEmDiasBotao({
  origem, periodo, onAplicar,
}: {
  origem: number;
  periodo: HorarioFuncionamentoPeriodo;
  onAplicar: (destinos: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [marcados, setMarcados] = useState<number[]>([]);

  const alternar = (dia: number, on: boolean) =>
    setMarcados((m) => (on ? [...new Set([...m, dia])] : m.filter((d) => d !== dia)));

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setMarcados([]); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9"
          disabled={!periodo.hora_abertura || !periodo.hora_fechamento}
        >
          <CopyPlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Aplicar em outros dias
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 space-y-2" align="start">
        <p className="text-xs text-muted-foreground">Aplicar este horário em:</p>
        {ORDEM_EXIBICAO.filter((d) => d !== origem).map((d) => (
          <label key={d} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={marcados.includes(d)}
              onCheckedChange={(v) => alternar(d, v === true)}
            />
            {DIA_CURTO[d]}
          </label>
        ))}
        <Button
          type="button"
          className="h-10 w-full"
          disabled={marcados.length === 0}
          onClick={() => { onAplicar(marcados); setOpen(false); }}
        >
          Aplicar
        </Button>
      </PopoverContent>
    </Popover>
  );
}
