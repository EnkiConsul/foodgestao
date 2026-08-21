import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DIAS, MESES, NOMES_ORDINAIS, NOMES_SEMANA,
  getMonthName, toggleArr,
  type RegraFormState, type Unidade,
} from "@/lib/dp/bloqueios";

type Props = {
  open: boolean;
  isEditing: boolean;
  form: RegraFormState;
  unidades: Unidade[];
  saving: boolean;
  onChange: (updater: (prev: RegraFormState) => RegraFormState) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

export function RegraDialog({
  open, isEditing, form, unidades, saving, onChange, onCancel, onSubmit,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Regra" : "Nova Regra"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Descrição *</Label>
            <Input
              value={form.nome}
              onChange={(e) => onChange((p) => ({ ...p, nome: e.target.value }))}
              placeholder="Ex: Natal, Black Friday..."
            />
          </div>

          <div className="space-y-2">
            <Label>Tipo *</Label>
            <select
              value={form.tipo}
              onChange={(e) => {
                const tipo = e.target.value as RegraFormState["tipo"];
                onChange((p) => ({
                  ...p,
                  tipo,
                  dias: tipo === "fixa_anual" ? p.dias : [],
                  ordinal: tipo === "dinamica" ? p.ordinal : null,
                  dia_semana: tipo === "dinamica" ? p.dia_semana : null,
                }));
              }}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="fixa_anual">Fixa (dia/mês fixo)</option>
              <option value="dinamica">Dinâmica (ex: 2º sábado)</option>
              <option value="pos_pagamento">Pós-Pagamento (1º sábado e domingo após o dia)</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label>Aplicação *</Label>
            <select
              value={form.aplicacao}
              onChange={(e) => {
                const val = e.target.value as "anual" | "unica";
                onChange((p) => ({
                  ...p,
                  aplicacao: val,
                  ano_referencia: val === "unica" ? new Date().getFullYear() : null,
                }));
              }}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="anual">🔄 Anual (repetir todo ano)</option>
              <option value="unica">🔹 Única vez (aplicar apenas em um ano)</option>
            </select>
          </div>

          {form.aplicacao === "unica" && (
            <div className="space-y-2">
              <Label>Ano de Referência *</Label>
              <Input
                type="number" min={2000} max={2100} placeholder="Ex: 2026"
                value={form.ano_referencia ?? ""}
                onChange={(e) =>
                  onChange((p) => ({ ...p, ano_referencia: parseInt(e.target.value) || null }))
                }
              />
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Meses *</Label>
              <Button
                variant="ghost" size="sm"
                onClick={() =>
                  onChange((p) => ({
                    ...p,
                    meses: p.meses.length === MESES.length ? [] : [...MESES],
                  }))
                }
              >
                {form.meses.length === MESES.length ? "Desmarcar todos" : "Marcar todos"}
              </Button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto border border-border rounded-lg p-3">
              {MESES.map((m) => (
                <button
                  key={m} type="button"
                  onClick={() => onChange((p) => ({ ...p, meses: toggleArr(p.meses, m) }))}
                  className="flex items-center gap-2 text-sm text-left px-1.5 py-0.5 rounded"
                >
                  <span
                    className={cn(
                      "size-5 rounded border-2 flex items-center justify-center",
                      form.meses.includes(m)
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-muted-foreground/30"
                    )}
                  >
                    {form.meses.includes(m) && <Check className="size-3" />}
                  </span>
                  {getMonthName(m)}
                </button>
              ))}
            </div>
          </div>

          {form.tipo === "fixa_anual" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Dias *</Label>
                <Button
                  variant="ghost" size="sm"
                  onClick={() =>
                    onChange((p) => ({
                      ...p,
                      dias: p.dias.length === DIAS.length ? [] : [...DIAS],
                    }))
                  }
                >
                  {form.dias.length === DIAS.length ? "Desmarcar todos" : "Marcar todos"}
                </Button>
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-1 max-h-40 overflow-y-auto border border-border rounded-lg p-3">
                {DIAS.map((d) => (
                  <button
                    key={d} type="button"
                    onClick={() => onChange((p) => ({ ...p, dias: toggleArr(p.dias, d) }))}
                    className={cn(
                      "size-7 rounded border-2 flex items-center justify-center text-xs",
                      form.dias.includes(d)
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-muted-foreground/30"
                    )}
                  >
                    {form.dias.includes(d) ? <Check className="size-3" /> : d}
                  </button>
                ))}
              </div>
            </div>
          )}

          {form.tipo === "dinamica" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Ordinal *</Label>
                <select
                  value={form.ordinal ?? ""}
                  onChange={(e) =>
                    onChange((p) => ({ ...p, ordinal: parseInt(e.target.value) }))
                  }
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Selecione</option>
                  {[1, 2, 3, 4, 5].map((o) => (
                    <option key={o} value={o}>{NOMES_ORDINAIS[o - 1]}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Dia da Semana *</Label>
                <select
                  value={form.dia_semana ?? ""}
                  onChange={(e) =>
                    onChange((p) => ({ ...p, dia_semana: parseInt(e.target.value) }))
                  }
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Selecione</option>
                  {NOMES_SEMANA.map((n, i) => <option key={i} value={i}>{n}</option>)}
                </select>
              </div>
            </div>
          )}

          {form.tipo === "pos_pagamento" && (
            <div className="space-y-2">
              <Label>Dia base do pagamento *</Label>
              <Input
                type="number" min={1} max={31}
                value={form.pos_pagamento_dia ?? 5}
                onChange={(e) =>
                  onChange((p) => ({ ...p, pos_pagamento_dia: parseInt(e.target.value) || null }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Bloqueia o 1º sábado e domingo posteriores a esse dia.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-base font-semibold">Unidades (opcional)</Label>
            <p className="text-sm text-muted-foreground">
              Se nenhuma unidade for selecionada, a regra é aplicada a <strong>todas</strong>.
            </p>
            <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto border border-border rounded-lg p-3">
              {unidades.map((u) => (
                <button
                  key={u.id} type="button"
                  onClick={() =>
                    onChange((p) => ({ ...p, unidades: toggleArr(p.unidades, u.id) }))
                  }
                  className="flex items-center gap-2 text-sm text-left"
                >
                  <span
                    className={cn(
                      "size-5 rounded border-2 flex items-center justify-center",
                      form.unidades.includes(u.id)
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-muted-foreground/30"
                    )}
                  >
                    {form.unidades.includes(u.id) && <Check className="size-3" />}
                  </span>
                  {u.nome}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox" checked={form.ativo}
              onChange={(e) => onChange((p) => ({ ...p, ativo: e.target.checked }))}
            />
            Regra ativa
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button disabled={saving} onClick={onSubmit}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
