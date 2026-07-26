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
  Epi, EpiEntrega, EpiEntregaInput, EpiInput, ExameAso, ExameInput, ExameResultado,
  ExameTipo, ParticipacaoInput, Treinamento, TreinamentoInput, TreinamentoParticipacao,
  TreinamentoStatus,
} from "@/hooks/useDpConformidade";

export const EXAME_TIPO_LABEL: Record<ExameTipo, string> = {
  admissional: "Admissional",
  periodico: "Periódico",
  retorno_trabalho: "Retorno ao trabalho",
  mudanca_funcao: "Mudança de função",
  demissional: "Demissional",
};

export const EXAME_RESULTADO_LABEL: Record<ExameResultado, string> = {
  pendente: "Pendente",
  apto: "Apto",
  apto_com_restricoes: "Apto com restrições",
  inapto: "Inapto",
};

export const TREINAMENTO_STATUS_LABEL: Record<TreinamentoStatus, string> = {
  planejado: "Planejado",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

type Colab = { id: string; nome: string };

/* ---------------------------------- ASO ---------------------------------- */

const emptyExame: ExameInput = {
  colaborador_id: "",
  tipo: "periodico",
  data_realizado: null,
  data_vencimento: null,
  resultado: "pendente",
  clinica: null,
  medico: null,
  restricoes: null,
  observacao: null,
};

export function ExameDialog({
  open, onOpenChange, colaboradores, editing, saving, onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  colaboradores: Colab[];
  editing: ExameAso | null;
  saving: boolean;
  onSubmit: (input: ExameInput) => void;
}) {
  const [form, setForm] = useState<ExameInput>(emptyExame);

  useEffect(() => {
    if (!open) return;
    setForm(
      editing
        ? {
            id: editing.id,
            colaborador_id: editing.colaborador_id,
            tipo: editing.tipo,
            data_realizado: editing.data_realizado,
            data_vencimento: editing.data_vencimento,
            resultado: editing.resultado,
            clinica: editing.clinica,
            medico: editing.medico,
            restricoes: editing.restricoes,
            observacao: editing.observacao,
          }
        : emptyExame,
    );
  }, [open, editing]);

  const valid = !!form.colaborador_id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar exame" : "Novo exame (ASO)"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Colaborador</Label>
            <Select
              value={form.colaborador_id}
              onValueChange={(v) => setForm((f) => ({ ...f, colaborador_id: v }))}
            >
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {colaboradores.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={form.tipo} onValueChange={(v) => setForm((f) => ({ ...f, tipo: v as ExameTipo }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(EXAME_TIPO_LABEL) as ExameTipo[]).map((t) => (
                  <SelectItem key={t} value={t}>{EXAME_TIPO_LABEL[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Resultado</Label>
            <Select
              value={form.resultado}
              onValueChange={(v) => setForm((f) => ({ ...f, resultado: v as ExameResultado }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(EXAME_RESULTADO_LABEL) as ExameResultado[]).map((r) => (
                  <SelectItem key={r} value={r}>{EXAME_RESULTADO_LABEL[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Realizado em</Label>
            <Input
              type="date"
              value={form.data_realizado ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, data_realizado: e.target.value || null }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Vence em</Label>
            <Input
              type="date"
              value={form.data_vencimento ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, data_vencimento: e.target.value || null }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Clínica</Label>
            <Input
              value={form.clinica ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, clinica: e.target.value || null }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Médico</Label>
            <Input
              value={form.medico ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, medico: e.target.value || null }))}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Restrições / observação</Label>
            <Textarea
              rows={2}
              value={form.observacao ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value || null }))}
            />
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

/* ------------------------------- EPI catálogo ----------------------------- */

const emptyEpi: EpiInput = { nome: "", ca: null, validade_dias: null, descricao: null, ativo: true };

export function EpiDialog({
  open, onOpenChange, editing, saving, onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Epi | null;
  saving: boolean;
  onSubmit: (input: EpiInput) => void;
}) {
  const [form, setForm] = useState<EpiInput>(emptyEpi);

  useEffect(() => {
    if (!open) return;
    setForm(
      editing
        ? {
            id: editing.id,
            nome: editing.nome,
            ca: editing.ca,
            validade_dias: editing.validade_dias,
            descricao: editing.descricao,
            ativo: editing.ativo,
          }
        : emptyEpi,
    );
  }, [open, editing]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar EPI" : "Novo EPI"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>CA</Label>
              <Input
                value={form.ca ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, ca: e.target.value || null }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Validade (dias)</Label>
              <Input
                type="number"
                min={0}
                value={form.validade_dias ?? ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, validade_dias: e.target.value ? Number(e.target.value) : null }))
                }
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea
              rows={2}
              value={form.descricao ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value || null }))}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <Label>Ativo</Label>
            <Switch checked={form.ativo} onCheckedChange={(v) => setForm((f) => ({ ...f, ativo: v }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!form.nome.trim() || saving} onClick={() => onSubmit(form)}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ EPI entrega ------------------------------- */

const hojeIso = () => new Date().toISOString().slice(0, 10);

const emptyEntrega = (): EpiEntregaInput => ({
  colaborador_id: "",
  epi_id: "",
  quantidade: 1,
  data_entrega: hojeIso(),
  data_troca_prevista: null,
  data_devolucao: null,
  recebido: false,
  observacao: null,
});

export function EpiEntregaDialog({
  open, onOpenChange, colaboradores, epis, editing, saving, onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  colaboradores: Colab[];
  epis: Epi[];
  editing: EpiEntrega | null;
  saving: boolean;
  onSubmit: (input: EpiEntregaInput) => void;
}) {
  const [form, setForm] = useState<EpiEntregaInput>(emptyEntrega());

  useEffect(() => {
    if (!open) return;
    setForm(
      editing
        ? {
            id: editing.id,
            colaborador_id: editing.colaborador_id,
            epi_id: editing.epi_id,
            quantidade: editing.quantidade,
            data_entrega: editing.data_entrega,
            data_troca_prevista: editing.data_troca_prevista,
            data_devolucao: editing.data_devolucao,
            recebido: !!editing.recebido_em,
            observacao: editing.observacao,
          }
        : emptyEntrega(),
    );
  }, [open, editing]);

  const valid = !!form.colaborador_id && !!form.epi_id && form.quantidade > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar entrega" : "Registrar entrega de EPI"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Colaborador</Label>
            <Select
              value={form.colaborador_id}
              onValueChange={(v) => setForm((f) => ({ ...f, colaborador_id: v }))}
            >
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {colaboradores.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>EPI</Label>
            <Select value={form.epi_id} onValueChange={(v) => setForm((f) => ({ ...f, epi_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {epis.filter((e) => e.ativo).map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Quantidade</Label>
            <Input
              type="number"
              min={1}
              value={form.quantidade}
              onChange={(e) => setForm((f) => ({ ...f, quantidade: Number(e.target.value) || 1 }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Entregue em</Label>
            <Input
              type="date"
              value={form.data_entrega}
              onChange={(e) => setForm((f) => ({ ...f, data_entrega: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Troca prevista</Label>
            <Input
              type="date"
              value={form.data_troca_prevista ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, data_troca_prevista: e.target.value || null }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Devolvido em</Label>
            <Input
              type="date"
              value={form.data_devolucao ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, data_devolucao: e.target.value || null }))}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <Label>Recebimento confirmado</Label>
            <Switch
              checked={form.recebido}
              onCheckedChange={(v) => setForm((f) => ({ ...f, recebido: v }))}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Observação</Label>
            <Textarea
              rows={2}
              value={form.observacao ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value || null }))}
            />
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

/* --------------------------- Treinamento catálogo ------------------------- */

const emptyTreinamento: TreinamentoInput = {
  nome: "",
  descricao: null,
  carga_horaria: null,
  validade_meses: null,
  obrigatorio: false,
  ativo: true,
};

export function TreinamentoDialog({
  open, onOpenChange, editing, saving, onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Treinamento | null;
  saving: boolean;
  onSubmit: (input: TreinamentoInput) => void;
}) {
  const [form, setForm] = useState<TreinamentoInput>(emptyTreinamento);

  useEffect(() => {
    if (!open) return;
    setForm(
      editing
        ? {
            id: editing.id,
            nome: editing.nome,
            descricao: editing.descricao,
            carga_horaria: editing.carga_horaria,
            validade_meses: editing.validade_meses,
            obrigatorio: editing.obrigatorio,
            ativo: editing.ativo,
          }
        : emptyTreinamento,
    );
  }, [open, editing]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar treinamento" : "Novo treinamento"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Carga horária</Label>
              <Input
                type="number"
                min={0}
                step="0.5"
                value={form.carga_horaria ?? ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, carga_horaria: e.target.value ? Number(e.target.value) : null }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Validade (meses)</Label>
              <Input
                type="number"
                min={0}
                value={form.validade_meses ?? ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, validade_meses: e.target.value ? Number(e.target.value) : null }))
                }
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea
              rows={2}
              value={form.descricao ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value || null }))}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <Label>Obrigatório</Label>
            <Switch
              checked={form.obrigatorio}
              onCheckedChange={(v) => setForm((f) => ({ ...f, obrigatorio: v }))}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <Label>Ativo</Label>
            <Switch checked={form.ativo} onCheckedChange={(v) => setForm((f) => ({ ...f, ativo: v }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!form.nome.trim() || saving} onClick={() => onSubmit(form)}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------- Participação em treinamento -------------------- */

const emptyParticipacao: ParticipacaoInput = {
  colaborador_id: "",
  treinamento_id: "",
  status: "planejado",
  data_conclusao: null,
  data_vencimento: null,
  nota: null,
  observacao: null,
};

export function ParticipacaoDialog({
  open, onOpenChange, colaboradores, treinamentos, editing, saving, onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  colaboradores: Colab[];
  treinamentos: Treinamento[];
  editing: TreinamentoParticipacao | null;
  saving: boolean;
  onSubmit: (input: ParticipacaoInput) => void;
}) {
  const [form, setForm] = useState<ParticipacaoInput>(emptyParticipacao);

  useEffect(() => {
    if (!open) return;
    setForm(
      editing
        ? {
            id: editing.id,
            colaborador_id: editing.colaborador_id,
            treinamento_id: editing.treinamento_id,
            status: editing.status,
            data_conclusao: editing.data_conclusao,
            data_vencimento: editing.data_vencimento,
            nota: editing.nota,
            observacao: editing.observacao,
          }
        : emptyParticipacao,
    );
  }, [open, editing]);

  const valid = !!form.colaborador_id && !!form.treinamento_id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar participação" : "Nova participação"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Colaborador</Label>
            <Select
              value={form.colaborador_id}
              onValueChange={(v) => setForm((f) => ({ ...f, colaborador_id: v }))}
            >
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {colaboradores.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Treinamento</Label>
            <Select
              value={form.treinamento_id}
              onValueChange={(v) => setForm((f) => ({ ...f, treinamento_id: v }))}
            >
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {treinamentos.filter((t) => t.ativo).map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Situação</Label>
            <Select
              value={form.status}
              onValueChange={(v) => setForm((f) => ({ ...f, status: v as TreinamentoStatus }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(TREINAMENTO_STATUS_LABEL) as TreinamentoStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{TREINAMENTO_STATUS_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Concluído em</Label>
            <Input
              type="date"
              value={form.data_conclusao ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, data_conclusao: e.target.value || null }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Vence em</Label>
            <Input
              type="date"
              value={form.data_vencimento ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, data_vencimento: e.target.value || null }))}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Observação</Label>
            <Textarea
              rows={2}
              value={form.observacao ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value || null }))}
            />
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
