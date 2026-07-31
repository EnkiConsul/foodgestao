import { useEffect } from "react";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { ptBR } from "date-fns/locale";
import type { Regime } from "@/hooks/useContabeisReport";
import { rangeForPreset, type Preset } from "@/lib/relatorios/reportFilters";
import { cn } from "@/lib/utils";

export type { Preset };

export interface FiltersState {
  preset: Preset;
  from: string;
  to: string;
  regime: Regime;
  include_zero: boolean;
}

interface Props {
  value: FiltersState;
  onChange: (v: FiltersState) => void;
}

export function ReportFilters({ value, onChange }: Props) {
  useEffect(() => {
    if (value.preset === "custom") return;
    const { from, to } = rangeForPreset(value.preset, value);
    if (from !== value.from || to !== value.to) onChange({ ...value, from, to });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.preset]);

  return (
    <Card>
      <CardContent className="p-4 flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label className="text-xs">Período</Label>
          <ToggleGroup
            type="single"
            value={value.preset}
            onValueChange={(v) => v && onChange({ ...value, preset: v as Preset })}
            className="flex-wrap justify-start"
          >
            <ToggleGroupItem value="month" size="sm">Mês</ToggleGroupItem>
            <ToggleGroupItem value="prev_month" size="sm">Mês anterior</ToggleGroupItem>
            <ToggleGroupItem value="quarter" size="sm">Trimestre</ToggleGroupItem>
            <ToggleGroupItem value="year" size="sm">Ano</ToggleGroupItem>
            <ToggleGroupItem value="12m" size="sm">12m</ToggleGroupItem>
            <ToggleGroupItem value="custom" size="sm">Custom</ToggleGroupItem>
          </ToggleGroup>
        </div>

        {value.preset === "custom" && (
          <div className="flex items-end gap-2">
            <DateField
              label="De"
              value={value.from}
              onChange={(from) => onChange({ ...value, from })}
            />
            <DateField
              label="Até"
              value={value.to}
              onChange={(to) => onChange({ ...value, to })}
            />
          </div>
        )}

        <div className="space-y-1">
          <Label className="text-xs">Regime</Label>
          <ToggleGroup
            type="single"
            value={value.regime}
            onValueChange={(v) => v && onChange({ ...value, regime: v as Regime })}
          >
            <ToggleGroupItem value="competencia" size="sm">Competência</ToggleGroupItem>
            <ToggleGroupItem value="caixa" size="sm">Caixa</ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="flex items-center gap-2 pb-1.5">
          <Switch
            id="include_zero"
            checked={value.include_zero}
            onCheckedChange={(c) => onChange({ ...value, include_zero: c })}
          />
          <Label htmlFor="include_zero" className="text-xs">
            Incluir contas sem movimento
          </Label>
        </div>
      </CardContent>
    </Card>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const d = value ? new Date(value + "T00:00:00") : undefined;
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className={cn("w-[130px] justify-start")}>
            <CalendarIcon className="h-3.5 w-3.5 mr-2" />
            {d ? format(d, "dd/MM/yyyy") : "—"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={d}
            locale={ptBR}
            onSelect={(nd) => nd && onChange(format(nd, "yyyy-MM-dd"))}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
