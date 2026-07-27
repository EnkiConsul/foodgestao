import { useEffect, useState } from "react";
import { Store, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DIAS_SEMANA, ORDEM_EXIBICAO } from "@/lib/dp/jornada-utils";
import {
  formatarFuncionamento, funcionamentoVazio, type HorarioFuncionamentoDia,
} from "@/lib/dp/turno-utils";
import { useDpHorariosFuncionamento } from "@/hooks/useDpHorariosFuncionamento";
import { toast } from "sonner";

const DIA_LONGO: Record<number, string> = Object.fromEntries(
  DIAS_SEMANA.map((d) => [d.v, d.longo]),
);

interface HorarioFuncionamentoEditorProps {
  unidadeId: string | null;
}

export function HorarioFuncionamentoEditor({ unidadeId }: HorarioFuncionamentoEditorProps) {
  const { horarios, isLoading, salvar } = useDpHorariosFuncionamento(unidadeId);
  const [dias, setDias] = useState<HorarioFuncionamentoDia[]>([]);

  useEffect(() => {
    const base = ORDEM_EXIBICAO.map(
      (d) => horarios.find((h) => h.dia_semana === d) ?? funcionamentoVazio(d),
    );
    setDias(base);
  }, [horarios]);

  const atualizar = (dia: number, patch: Partial<HorarioFuncionamentoDia>) =>
    setDias((prev) => prev.map((d) => (d.dia_semana === dia ? { ...d, ...patch } : d)));

  const aplicarEmTodos = (origem: HorarioFuncionamentoDia) =>
    setDias((prev) =>
      prev.map((d) => ({
        ...d,
        aberto: origem.aberto,
        hora_abertura: origem.hora_abertura,
        hora_fechamento: origem.hora_fechamento,
      })),
    );

  const submit = async () => {
    try {
      await salvar.mutateAsync(dias);
      toast.success("Horário de funcionamento salvo.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  };

  if (!unidadeId) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          Selecione uma unidade para definir o horário de funcionamento.
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
        Quando a loja está aberta. Serve de referência para turnos, escala e cobertura — não é jornada de trabalho.
      </p>

      {dias.map((d) => (
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
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor={`abre-${d.dia_semana}`} className="text-xs">Abre</Label>
                    <Input
                      id={`abre-${d.dia_semana}`}
                      type="time"
                      className="h-11"
                      value={d.hora_abertura ?? ""}
                      onChange={(e) => atualizar(d.dia_semana, { hora_abertura: e.target.value || null })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`fecha-${d.dia_semana}`} className="text-xs">Fecha</Label>
                    <Input
                      id={`fecha-${d.dia_semana}`}
                      type="time"
                      className="h-11"
                      value={d.hora_fechamento ?? ""}
                      onChange={(e) => atualizar(d.dia_semana, { hora_fechamento: e.target.value || null })}
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9"
                  onClick={() => aplicarEmTodos(d)}
                >
                  Aplicar este horário em todos os dias
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ))}

      <div className="sticky bottom-0 -mx-1 bg-background/95 px-1 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <Button className="h-11 w-full" onClick={submit} disabled={salvar.isPending}>
          <Save className="mr-2 h-4 w-4" aria-hidden="true" />
          {salvar.isPending ? "Salvando..." : "Salvar horário de funcionamento"}
        </Button>
      </div>
    </div>
  );
}
