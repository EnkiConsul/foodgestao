import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyContext } from "@/hooks/useCompanyContext";
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
  getMonthName, toggleArr, ALVO_LABEL,
  type RegraFormState, type Unidade, type AlvoRegra,
} from "@/lib/dp/bloqueios";

type CampoErro = "nome" | "ano" | "meses" | "dias" | "dinamica" | "inicio" | "alvo";

function validarForm(form: RegraFormState): Set<CampoErro> {
  const erros = new Set<CampoErro>();
  if (!form.nome.trim()) erros.add("nome");
  if (form.aplicacao === "unica" && !form.ano_referencia) erros.add("ano");
  if (form.meses.length === 0) erros.add("meses");
  if (form.tipo === "fixa_anual" && form.dias.length === 0) erros.add("dias");
  if (form.tipo === "dinamica" && (form.ordinal == null || form.dia_semana == null)) erros.add("dinamica");
  if (form.alvo_tipo !== "todos" && !form.alvo_id) erros.add("alvo");
  return erros;
}

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
  const [tentouSalvar, setTentouSalvar] = useState(false);
  const { selectedCompanyId } = useCompanyContext();
  const opcoesAlvo = useQuery({
    queryKey: ["dp_bloqueio_alvo_opcoes", selectedCompanyId, form.alvo_tipo],
    enabled: open && !!selectedCompanyId && form.alvo_tipo !== "todos",
    queryFn: async (): Promise<{ id: string; nome: string }[]> => {
      if (form.alvo_tipo === "cargo") {
        const { data, error } = await supabase.from("dp_cargos").select("id, nome")
          .eq("company_id", selectedCompanyId!).eq("ativo", true).is("removido_em", null).order("nome");
        if (error) throw error;
        return data ?? [];
      }
      if (form.alvo_tipo === "setor") {
        const { data, error } = await supabase.from("dp_setores").select("id, nome")
          .eq("company_id", selectedCompanyId!).eq("ativo", true).order("nome");
        if (error) throw error;
        return data ?? [];
      }
      const { data, error } = await supabase.from("dp_colaboradores").select("id, nome")
        .eq("company_id", selectedCompanyId!).eq("ativo", true).is("deleted_at", null).order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });
  const erros = tentouSalvar ? validarForm(form) : new Set<CampoErro>();

  const handleSubmit = () => {
    const e = validarForm(form);
    if (e.size > 0) {
      setTentouSalvar(true);
      return;
    }
    onSubmit();
  };

  const handleCancel = () => {
    setTentouSalvar(false);
    onCancel();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleCancel(); }}>
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
              className={cn(erros.has("nome") && "border-destructive")}
            />
            {erros.has("nome") && (
              <p className="text-xs text-destructive">Informe uma descrição para a regra.</p>
            )}
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
            <Label>Público-alvo *</Label>
            <select
              value={form.alvo_tipo}
              onChange={(e) => {
                const alvo_tipo = e.target.value as AlvoRegra;
                onChange((p) => ({ ...p, alvo_tipo, alvo_id: "" }));
              }}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {(Object.keys(ALVO_LABEL) as AlvoRegra[]).map((k) => (
                <option key={k} value={k}>{ALVO_LABEL[k]}</option>
              ))}
            </select>
            {form.alvo_tipo !== "todos" && (
              <select
                value={form.alvo_id}
                onChange={(e) => onChange((p) => ({ ...p, alvo_id: e.target.value }))}
                className={cn(
                  "flex w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  erros.has("alvo") ? "border-destructive" : "border-input",
                )}
              >
                <option value="">
                  {opcoesAlvo.isLoading ? "Carregando..." : form.alvo_tipo === "cargo" ? "Selecione o cargo" : form.alvo_tipo === "setor" ? "Selecione o setor" : "Selecione o colaborador"}
                </option>
                {(opcoesAlvo.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
              </select>
            )}
            {erros.has("alvo") ? (
              <p className="text-xs text-destructive">Escolha para quem a regra vale.</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {form.alvo_tipo === "todos"
                  ? "Ninguém da unidade folga nas datas da regra."
                  : "Só o público escolhido fica sem folga nessas datas; os demais seguem normalmente. Quem tiver datas restritas no mês escolhe as folgas 1 dia antes."}
              </p>
            )}
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

          <div className="space-y-2">
            <Label>Válida a partir de</Label>
            <Input
              type="date"
              value={form.data_inicio}
              onChange={(e) => onChange((p) => ({ ...p, data_inicio: e.target.value }))}
              className={cn(erros.has("inicio") && "border-destructive")}
            />
            {erros.has("inicio") ? (
              <p className="text-xs text-destructive">Informe a partir de quando a regra vale.</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Datas anteriores não são bloqueadas. Pode ser retroativa ou futura. Em branco vale para todas as datas.
              </p>
            )}
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
                className={cn(erros.has("ano") && "border-destructive")}
              />
              {erros.has("ano") && (
                <p className="text-xs text-destructive">Informe o ano em que a regra se aplica.</p>
              )}
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
            <div
              className={cn(
                "grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto border rounded-lg p-3",
                erros.has("meses") ? "border-destructive" : "border-border"
              )}
            >
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
            {erros.has("meses") && (
              <p className="text-xs text-destructive">
                Selecione ao menos um mês — ou toque em "Marcar todos" para valer o ano inteiro.
              </p>
            )}
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
              <div
                className={cn(
                  "grid grid-cols-4 sm:grid-cols-7 gap-1 max-h-40 overflow-y-auto border rounded-lg p-3",
                  erros.has("dias") ? "border-destructive" : "border-border"
                )}
              >
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
              {erros.has("dias") && (
                <p className="text-xs text-destructive">
                  Selecione ao menos um dia — ou toque em "Marcar todos".
                </p>
              )}
            </div>
          )}

          {form.tipo === "dinamica" && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Ordinal *</Label>
                  <select
                    value={form.ordinal ?? ""}
                    onChange={(e) =>
                      onChange((p) => ({ ...p, ordinal: parseInt(e.target.value) }))
                    }
                    className={cn(
                      "flex w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      erros.has("dinamica") && form.ordinal == null ? "border-destructive" : "border-input"
                    )}
                  >
                    <option value="">Selecione</option>
                    <option value={0}>Todas</option>
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
                    className={cn(
                      "flex w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      erros.has("dinamica") && form.dia_semana == null ? "border-destructive" : "border-input"
                    )}
                  >
                    <option value="">Selecione</option>
                    {NOMES_SEMANA.map((n, i) => <option key={i} value={i}>{n}</option>)}
                  </select>
                </div>
              </div>
              {erros.has("dinamica") && (
                <p className="text-xs text-destructive">
                  Escolha o ordinal (ex.: "Todas") e o dia da semana.
                </p>
              )}
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
          <Button variant="outline" onClick={handleCancel}>Cancelar</Button>
          <Button disabled={saving} onClick={handleSubmit}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
