import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type {
  Beneficio, BeneficioInput, BeneficioTipo, ColaboradorBeneficio,
  ColaboradorBeneficioInput,
} from "@/hooks/useDpBeneficios";

export const BENEFICIO_TIPO_LABEL: Record<BeneficioTipo, string> = {
  vale_transporte: "Vale-transporte",
  vale_alimentacao: "Vale-alimentação",
  vale_refeicao: "Vale-refeição",
  plano_saude: "Plano de saúde",
  plano_odontologico: "Plano odontológico",
  seguro_vida: "Seguro de vida",
  auxilio_creche: "Auxílio-creche",
  auxilio_combustivel: "Auxílio-combustível",
  outro: "Outro",
};

type Colab = { id: string; nome: string };

const hoje = () => new Date().toISOString().slice(0, 10);

const emptyBeneficio: BeneficioInput = {
  nome: "",
  tipo: "outro",
  valor_padrao: 0,
  desconto_percentual: 0,
  descricao: null,
  ativo: true,
  unidade_id: null,
  cargo_id: null,
};

type EscopoOpcao = { id: string; nome: string };

export function BeneficioDialog({
  open, onOpenChange, editing, saving, onSubmit,
  unidades = [], cargos = [], escopoInicial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Beneficio | null;
  saving: boolean;
  onSubmit: (input: BeneficioInput) => void;
  /** Unidades e cargos da empresa, para amarrar o escopo do benefício. */
  unidades?: EscopoOpcao[];
  cargos?: EscopoOpcao[];
  /** Escopo pré-selecionado ao criar (ex.: unidade/cargo do colaborador aberto). */
  escopoInicial?: { unidade_id?: string | null; cargo_id?: string | null };
}) {
  const [form, setForm] = useState<BeneficioInput>(emptyBeneficio);

  useEffect(() => {
    if (!open) return;
    setForm(
      editing
        ? {
            id: editing.id,
            nome: editing.nome,
            tipo: editing.tipo,
            valor_padrao: Number(editing.valor_padrao ?? 0),
            desconto_percentual: Number(editing.desconto_percentual ?? 0),
            descricao: editing.descricao,
            ativo: editing.ativo,
            unidade_id: (editing as any).unidade_id ?? null,
            cargo_id: (editing as any).cargo_id ?? null,
          }
        : {
            ...emptyBeneficio,
            unidade_id: escopoInicial?.unidade_id ?? null,
            cargo_id: escopoInicial?.cargo_id ?? null,
          },
    );
  }, [open, editing, escopoInicial?.unidade_id, escopoInicial?.cargo_id]);

  const valid = form.nome.trim().length > 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar benefício" : "Novo benefício"}</DialogTitle>
        </DialogHeader>
        {editing && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-amber-700 dark:text-amber-400">
            Este é o cadastro do catálogo da empresa: a alteração vale para todos os colaboradores que
            usam este benefício. Ajustes individuais são feitos na ficha do colaborador, na aba Remuneração.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="nome-1">Nome</Label>
            <Input id="nome-1"
              value={form.nome}
              onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
              placeholder="Ex.: Vale-transporte urbano"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tipo-2">Tipo</Label>
            <Select
              value={form.tipo}
              onValueChange={(v) => setForm((f) => ({ ...f, tipo: v as BeneficioTipo }))}
            >
              <SelectTrigger id="tipo-2"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                {(Object.keys(BENEFICIO_TIPO_LABEL) as BeneficioTipo[]).map((t) => (
                  <SelectItem key={t} value={t}>{BENEFICIO_TIPO_LABEL[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="valor-padrao-r-3">Valor padrão (R$)</Label>
            <Input id="valor-padrao-r-3"
              type="number" min={0} step="0.01"
              value={form.valor_padrao}
              onChange={(e) => setForm((f) => ({ ...f, valor_padrao: Number(e.target.value) }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="desconto-do-colaborador-4">Desconto do colaborador (%)</Label>
            <Input id="desconto-do-colaborador-4"
              type="number" min={0} max={100} step="0.01"
              value={form.desconto_percentual}
              onChange={(e) =>
                setForm((f) => ({ ...f, desconto_percentual: Number(e.target.value) }))
              }
            />
          </div>
          <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3 sm:col-span-2">
            <div>
              <p className="text-sm font-medium">Aplica-se a</p>
              <p className="text-xs text-muted-foreground">
                Em branco, o benefício vale para a empresa inteira e pode ser vinculado a qualquer
                colaborador. Com unidade e/ou cargo, ele só aparece no cadastro de quem pertence a
                esse escopo.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="unidade-5">Unidade</Label>
                <Select
                  value={form.unidade_id ?? "todas"}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, unidade_id: v === "todas" ? null : v }))
                  }
                >
                  <SelectTrigger id="unidade-5"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="todas">Todas as unidades</SelectItem>
                    {unidades.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cargo-6">Cargo</Label>
                <Select
                  value={form.cargo_id ?? "todos"}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, cargo_id: v === "todos" ? null : v }))
                  }
                >
                  <SelectTrigger id="cargo-6"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="todos">Todos os cargos</SelectItem>
                    {cargos.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="descricao-7">Descrição</Label>
            <Textarea id="descricao-7"
              value={form.descricao ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value || null }))}
              rows={2}
            />
          </div>

          <div className="flex items-center gap-3 sm:col-span-2">
            <Switch
              checked={form.ativo}
              onCheckedChange={(v) => setForm((f) => ({ ...f, ativo: v }))}
            />
            <Label>Benefício ativo</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!valid || saving} onClick={() => onSubmit(form)}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const emptyAtribuicao = (): ColaboradorBeneficioInput => ({
  colaborador_id: "",
  beneficio_id: "",
  valor: 0,
  desconto_valor: 0,
  data_inicio: hoje(),
  data_fim: null,
  ativo: true,
  observacao: null,
});

export function AtribuicaoDialog({
  open, onOpenChange, colaboradores, beneficios, editing, saving, onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  colaboradores: Colab[];
  beneficios: Beneficio[];
  editing: ColaboradorBeneficio | null;
  saving: boolean;
  onSubmit: (input: ColaboradorBeneficioInput) => void;
}) {
  const [form, setForm] = useState<ColaboradorBeneficioInput>(emptyAtribuicao());

  useEffect(() => {
    if (!open) return;
    setForm(
      editing
        ? {
            id: editing.id,
            colaborador_id: editing.colaborador_id,
            beneficio_id: editing.beneficio_id,
            valor: Number(editing.valor ?? 0),
            desconto_valor: Number(editing.desconto_valor ?? 0),
            data_inicio: editing.data_inicio,
            data_fim: editing.data_fim,
            ativo: editing.ativo,
            observacao: editing.observacao,
          }
        : emptyAtribuicao(),
    );
  }, [open, editing]);

  /** Ao escolher o benefício, sugere valor e desconto a partir do catálogo. */
  const onPickBeneficio = (id: string) => {
    const b = beneficios.find((x) => x.id === id);
    setForm((f) => ({
      ...f,
      beneficio_id: id,
      valor: b ? Number(b.valor_padrao ?? 0) : f.valor,
      desconto_valor: b
        ? Number(((Number(b.valor_padrao ?? 0) * Number(b.desconto_percentual ?? 0)) / 100).toFixed(2))
        : f.desconto_valor,
    }));
  };

  const valid = !!form.colaborador_id && !!form.beneficio_id && !!form.data_inicio;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar benefício do colaborador" : "Atribuir benefício"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="colaborador-8">Colaborador</Label>
            <Select
              value={form.colaborador_id}
              onValueChange={(v) => setForm((f) => ({ ...f, colaborador_id: v }))}
            >
              <SelectTrigger id="colaborador-8"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {colaboradores.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="beneficio-9">Benefício</Label>
            <Select value={form.beneficio_id} onValueChange={onPickBeneficio}>
              <SelectTrigger id="beneficio-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {beneficios.filter((b) => b.ativo).map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="valor-r-10">Valor (R$)</Label>
            <Input id="valor-r-10"
              type="number" min={0} step="0.01"
              value={form.valor}
              onChange={(e) => setForm((f) => ({ ...f, valor: Number(e.target.value) }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="desconto-do-colaborador-r-11">Desconto do colaborador (R$)</Label>
            <Input id="desconto-do-colaborador-r-11"
              type="number" min={0} step="0.01"
              value={form.desconto_valor}
              onChange={(e) => setForm((f) => ({ ...f, desconto_valor: Number(e.target.value) }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="inicio-12">Início</Label>
            <Input id="inicio-12"
              type="date"
              value={form.data_inicio}
              onChange={(e) => setForm((f) => ({ ...f, data_inicio: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fim-opcional-13">Fim (opcional)</Label>
            <Input id="fim-opcional-13"
              type="date"
              value={form.data_fim ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, data_fim: e.target.value || null }))}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="observacao-14">Observação</Label>
            <Textarea id="observacao-14"
              value={form.observacao ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value || null }))}
              rows={2}
            />
          </div>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Switch
              checked={form.ativo}
              onCheckedChange={(v) => setForm((f) => ({ ...f, ativo: v }))}
            />
            <Label>Vínculo ativo</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!valid || saving} onClick={() => onSubmit(form)}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
