import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSegmentos } from "@/hooks/useSegmentos";

interface Props {
  value: string;
  onChange: (id: string) => void;
  id?: string;
  required?: boolean;
  invalid?: boolean;
  describedBy?: string;
}

export function SegmentoSelect({ value, onChange, id, required, invalid, describedBy }: Props) {
  const { data: segmentos, isLoading } = useSegmentos();

  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger
        id={id}
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
      >
        <SelectValue placeholder={isLoading ? "Carregando…" : "Selecione o segmento"} />
      </SelectTrigger>
      <SelectContent>
        {segmentos?.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.nome}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
