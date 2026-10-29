import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MOTIVOS_DISCIPLINARES } from "@/lib/dp/disciplinar-reincidencia";

export function DisciplinarMotivos({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const partes = value.split(" + ").filter(Boolean);
  const padrao = partes.filter(p => MOTIVOS_DISCIPLINARES.some(m => m.label === p));
  const outro = partes.filter(p => !padrao.includes(p)).join(" + ");
  return <div className="space-y-2">
    <Label>Motivos da medida</Label>
    {MOTIVOS_DISCIPLINARES.map(m => <label key={m.label} className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm">
      <Checkbox className="mt-1 shrink-0" checked={partes.includes(m.label)} onCheckedChange={v => onChange((v === true ? [...partes, m.label] : partes.filter(p => p !== m.label)).join(" + "))} />
      <span className="min-w-0"><span className="block">{m.label}</span><span className="text-xs text-muted-foreground">Art. 482, alínea “{m.alinea}”</span></span>
    </label>)}
    <Input aria-label="Outro motivo" value={outro} maxLength={1000} placeholder="Outro motivo" onChange={e => onChange([...padrao, e.target.value.replace(/\+/g, "")].filter(Boolean).join(" + "))} />
  </div>;
}