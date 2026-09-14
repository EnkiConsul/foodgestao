import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  value: Date | undefined;
  onChange: (d: Date | undefined) => void;
};

/**
 * Campo de data do portal do colaborador (antes duplicado em Trocas e
 * Solicitações). Mesmo visual dos formulários do gestor.
 */
export function PortalDateField({ label, value, onChange }: Props) {
  return (
    <div>
      <Label>{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn("w-full justify-start text-left font-normal", !value && "text-muted-foreground")}
          >
            <CalendarIcon className="h-4 w-4 mr-2" />
            {value ? format(value, "dd/MM/yyyy", { locale: ptBR }) : <span>Selecionar</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value}
            onSelect={onChange}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
            locale={ptBR}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
