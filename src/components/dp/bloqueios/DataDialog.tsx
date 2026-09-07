import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DpDialogShell } from "@/components/dp/DpDialogShell";
import type { DataFormState, Unidade } from "@/lib/dp/bloqueios";

type Props = {
  open: boolean;
  isEditing: boolean;
  form: DataFormState;
  unidades: Unidade[];
  saving: boolean;
  onChange: (updater: (prev: DataFormState) => DataFormState) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

export function DataDialog({
  open, isEditing, form, unidades, saving, onChange, onCancel, onSubmit,
}: Props) {
  return (
    <DpDialogShell
      open={open}
      onOpenChange={(o) => { if (!o) onCancel(); }}
      title={isEditing ? "Editar Bloqueio" : "Bloquear Data"}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button disabled={saving} onClick={onSubmit}>Salvar</Button>
        </>
      }
    >
      <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label>Data *</Label>
            <Input
              type="date" value={form.data}
              onChange={(e) => onChange((p) => ({ ...p, data: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Motivo *</Label>
            <Input
              value={form.motivo}
              onChange={(e) => onChange((p) => ({ ...p, motivo: e.target.value }))}
              placeholder="Ex: Evento interno"
            />
          </div>
          <div className="space-y-2">
            <Label>Unidade</Label>
            <select
              value={form.unidade_id}
              onChange={(e) => onChange((p) => ({ ...p, unidade_id: e.target.value }))}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Global (todas)</option>
              {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </div>
        </div>
    </DpDialogShell>
  );
}
