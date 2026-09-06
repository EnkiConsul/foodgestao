import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { pessoaAvulsaSchema, validateWithToast } from "@/lib/validations";
import type { PessoaAvulsaInput } from "@/hooks/useDpOperacaoPanorama";
import type { HorarioSugerido, PessoaAvulsaPanorama, PessoaAvulsaTipo } from "@/lib/dp/operacao-panorama";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dia clicado no painel: vira data inicial e final por padrão. */
  dataInicial: string;
  unidadePadrao?: string | null;
  unidades: { id: string; nome: string }[];
  cargos: { id: string; nome: string }[];
  colaboradores: { id: string; nome: string; cargo_id?: string | null; unidade_id?: string | null }[];
  /** Registro em edição; ausente = novo cadastro. */
  registro?: PessoaAvulsaPanorama | null;
  salvando?: boolean;
  /** Sugere horário de entrada/saída com base no histórico do cargo/unidade/dia da semana. */
  sugerirHorario?: (unidadeId: string, cargoId: string, data: string) => HorarioSugerido | null;
  onSalvar: (input: PessoaAvulsaInput) => void;
}

const TIPO_LABEL: Record<PessoaAvulsaTipo, string> = {
  folguista: "Folguista (cobrindo alguém)",
  teste: "Em teste na loja",
  registro_manual: "Colaborador cadastrado que trabalhou",
};

const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};


/**
 * Cadastro rápido de quem trabalhou no dia: colaborador cadastrado registrado
 * manualmente (convocação/escala esquecida) ou pessoa não cadastrada em teste /
 * folguista. Só entra na rotina do dia — não gera folga, ponto, folha nem
 * convocação.
 */
export function DpPessoaAvulsaDialog({
  open,
  onOpenChange,
  dataInicial,
  unidadePadrao,
  unidades,
  cargos,
  colaboradores,
  registro,
  salvando,
  sugerirHorario,
  onSalvar,
}: Props) {
  const [form, setForm] = useState({
    nome: "",
    tipo: "folguista" as PessoaAvulsaTipo,
    colaborador_id: "",
    unidade_id: "",
    cargo_id: "",
    cobre_colaborador_id: "",
    data_inicio: dataInicial,
    data_fim: dataInicial,
    entrada: "",
    saida: "",
    termina_no_dia_seguinte: false,
    observacao: "",
  });
  const [horarioTocado, setHorarioTocado] = useState(false);

  const manual = form.tipo === "registro_manual";
  const hoje = hojeIso();

  useEffect(() => {
    if (!open) return;
    setHorarioTocado(false);
    const dataBase = registro?.data_inicio ?? (dataInicial > hojeIso() ? hojeIso() : dataInicial);
    setForm({
      nome: registro?.nome ?? "",
      tipo: registro?.tipo ?? "registro_manual",
      colaborador_id: registro?.colaborador_id ?? "",
      unidade_id: registro?.unidade_id ?? unidadePadrao ?? (unidades.length === 1 ? unidades[0].id : ""),
      cargo_id: registro?.cargo_id ?? "",
      cobre_colaborador_id: "",
      data_inicio: dataBase,
      data_fim: registro?.data_fim ?? dataBase,
      entrada: registro?.entrada ?? "",
      saida: registro?.saida ?? "",
      termina_no_dia_seguinte: registro?.termina_no_dia_seguinte ?? false,
      observacao: registro?.observacao ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, registro, dataInicial, unidadePadrao]);

  useEffect(() => {
    if (!open || !sugerirHorario || horarioTocado || !form.unidade_id || !form.cargo_id || !form.data_inicio) return;
    const sugerido = sugerirHorario(form.unidade_id, form.cargo_id, form.data_inicio);
    if (!sugerido) return;
    setForm((f) => ({
      ...f,
      entrada: sugerido.entrada,
      saida: sugerido.saida,
      termina_no_dia_seguinte: sugerido.termina_no_dia_seguinte,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sugerirHorario, form.unidade_id, form.cargo_id, form.data_inicio]);

  /** Ao escolher o colaborador, já traz o cargo e a unidade do cadastro dele. */
  const escolherColaborador = (id: string) => {
    const c = colaboradores.find((x) => x.id === id);
    setForm((f) => ({
      ...f,
      colaborador_id: id,
      cargo_id: c?.cargo_id ?? f.cargo_id,
      unidade_id: c?.unidade_id ?? f.unidade_id,
    }));
  };

  const salvar = () => {
    if (manual && form.data_fim > hoje) {
      toast.error("Data futura não permitida", {
        description: "Para dias futuros use a convocação ou a escala.",
      });
      return;
    }
    const candidato: PessoaAvulsaInput = {
      nome: manual ? null : form.nome.trim(),
      tipo: form.tipo,
      colaborador_id: manual ? form.colaborador_id || null : null,
      unidade_id: form.unidade_id,
      cargo_id: form.cargo_id,
      cobre_colaborador_id: form.cobre_colaborador_id || null,
      data_inicio: form.data_inicio,
      data_fim: form.data_fim,
      entrada: form.entrada || null,
      saida: form.saida || null,
      termina_no_dia_seguinte: form.termina_no_dia_seguinte,
      observacao: form.observacao || null,
    };
    const parsed = validateWithToast(pessoaAvulsaSchema, candidato, (msg) =>
      toast.error("Verifique os dados", { description: msg }),
    );
    if (!parsed) return;
    onSalvar({ ...candidato, id: registro?.id });
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{registro ? "Editar Pessoa no Dia" : "Adicionar Pessoa no Dia"}</DialogTitle>
          <DialogDescription>
            Registre quem trabalhou no dia: um colaborador já cadastrado (quando a convocação ou a
            escala não foi feita) ou alguém em teste / folguista. Aparece na rotina e conta no quadro.
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[65vh] gap-3 overflow-y-auto py-2 pr-1">
          <div className="grid gap-1.5">
            <Label>Quem trabalhou *</Label>
            <Select
              value={form.tipo}
              onValueChange={(v) => setForm({ ...form, tipo: v as PessoaAvulsaTipo })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TIPO_LABEL) as PessoaAvulsaTipo[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {TIPO_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {manual ? (
            <div className="grid gap-1.5">
              <Label>Colaborador *</Label>
              <Select value={form.colaborador_id} onValueChange={escolherColaborador}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {colaboradores.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Só para hoje ou dias que já passaram. Não gera convocação, ponto nem folha.
              </p>
            </div>
          ) : (
            <div className="grid gap-1.5">
              <Label>Nome da pessoa *</Label>
              <Input
                value={form.nome}
                maxLength={120}
                placeholder="Ex.: Maria Souza"
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </div>
          )}


          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Unidade *</Label>
              <Select
                value={form.unidade_id}
                onValueChange={(v) => setForm({ ...form, unidade_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {unidades.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Cargo do dia *</Label>
              <Select value={form.cargo_id} onValueChange={(v) => setForm({ ...form, cargo_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {cargos.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {form.tipo === "folguista" && (
            <div className="grid gap-1.5">
              <Label>Cobrindo quem (opcional)</Label>
              <Select
                value={form.cobre_colaborador_id || "nenhum"}
                onValueChange={(v) =>
                  setForm({ ...form, cobre_colaborador_id: v === "nenhum" ? "" : v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Ninguém em específico" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">Ninguém em específico</SelectItem>
                  {colaboradores.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Data inicial *</Label>
              <Input
                type="date"
                max={manual ? hoje : undefined}
                value={form.data_inicio}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    data_inicio: e.target.value,
                    data_fim: f.data_fim && f.data_fim >= e.target.value ? f.data_fim : e.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Data final *</Label>
              <Input
                type="date"
                min={form.data_inicio || undefined}
                max={manual ? hoje : undefined}
                value={form.data_fim}
                onChange={(e) => setForm({ ...form, data_fim: e.target.value })}
              />

            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Entrada</Label>
              <Input
                type="time"
                value={form.entrada}
                onChange={(e) => {
                  setHorarioTocado(true);
                  setForm({ ...form, entrada: e.target.value });
                }}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Saída</Label>
              <Input
                type="time"
                value={form.saida}
                onChange={(e) => {
                  setHorarioTocado(true);
                  setForm({ ...form, saida: e.target.value });
                }}
              />
            </div>
          </div>
          {sugerirHorario && form.unidade_id && form.cargo_id && form.data_inicio && (
            <p className="text-xs text-muted-foreground">
              Sugerido pelo horário mais usado neste cargo/unidade.
            </p>
          )}

          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="pr-3">
              <Label className="text-sm">Termina no dia seguinte</Label>
              <p className="text-xs text-muted-foreground">Marque quando a saída passa da meia-noite.</p>
            </div>
            <Switch
              checked={form.termina_no_dia_seguinte}
              onCheckedChange={(v) => setForm({ ...form, termina_no_dia_seguinte: v })}
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Observação</Label>
            <Textarea
              rows={2}
              maxLength={500}
              placeholder="Contexto do dia (opcional)"
              value={form.observacao}
              onChange={(e) => setForm({ ...form, observacao: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando..." : registro ? "Salvar" : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
