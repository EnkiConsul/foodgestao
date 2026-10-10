import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { maskPhone } from "@/lib/phone";
import { PARENTESCOS_EMERGENCIA, type ContatoEmergencia } from "@/lib/dp/contatosEmergencia";
import { Plus, Trash2 } from "lucide-react";

const VAZIO: ContatoEmergencia = { nome: "", parentesco: "", whatsapp: "" };

/** Edição de 1 a 2 contatos de emergência (o 1º é obrigatório). */
export function ContatosEmergenciaEditor({
  value, onChange, disabled,
}: { value: ContatoEmergencia[]; onChange: (v: ContatoEmergencia[]) => void; disabled?: boolean }) {
  const lista = value.length ? value : [VAZIO];
  const set = (i: number, campo: keyof ContatoEmergencia, v: string) =>
    onChange(lista.map((c, j) => (j === i ? { ...c, [campo]: v } : c)));
  return (
    <div className="space-y-3">
      {lista.map((c, i) => (
        <div key={i} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-3">
          <div className="flex items-center justify-between sm:col-span-3">
            <p className="text-xs font-medium text-muted-foreground">
              Contato {i + 1}{i === 0 ? " (obrigatório)" : " (opcional)"}
            </p>
            {i > 0 && !disabled && (
              <Button type="button" size="sm" variant="ghost" onClick={() => onChange(lista.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" /><span className="sr-only">Remover contato</span>
              </Button>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Nome completo</Label>
            <Input value={c.nome} disabled={disabled} onChange={(e) => set(i, "nome", e.target.value.toUpperCase())} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Parentesco</Label>
            <Select value={c.parentesco || undefined} onValueChange={(v) => set(i, "parentesco", v)} disabled={disabled}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {PARENTESCOS_EMERGENCIA.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">WhatsApp com DDD</Label>
            <Input
              value={maskPhone(c.whatsapp)}
              inputMode="tel"
              placeholder="(62) 99999-9999"
              disabled={disabled}
              onChange={(e) => set(i, "whatsapp", e.target.value.replace(/\D/g, "").slice(0, 11))}
            />
          </div>
        </div>
      ))}
      {lista.length < 2 && !disabled && (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...lista, { ...VAZIO }])}>
          <Plus className="h-4 w-4 mr-1" /> Adicionar 2º Contato de Emergência
        </Button>
      )}
    </div>
  );
}

export const limparContatos = (l: ContatoEmergencia[]) =>
  l.filter((c) => c.nome || c.whatsapp || c.parentesco)
    .map((c) => ({ nome: c.nome.trim().toUpperCase(), parentesco: c.parentesco, whatsapp: c.whatsapp.replace(/\D/g, "") }));
