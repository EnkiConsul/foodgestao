import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useUpsertDpColaborador, type DpColaborador } from "@/hooks/useDpColaboradores";
import { useDpUnidades, useDpCargos } from "@/hooks/useDpCadastros";
import { maskCpf, isValidCpf } from "@/lib/cpf";
import type { Database } from "@/integrations/supabase/types";

type Regime = Database["public"]["Enums"]["dp_regime_trabalho"];

const TIPOS_VINCULO: { value: string; label: string }[] = [
  { value: "CLT", label: "CLT" },
  { value: "Socio", label: "Sócio" },
  { value: "Estagiario", label: "Estagiário" },
  { value: "PJ", label: "PJ" },
  { value: "Autonomo", label: "Autônomo" },
  { value: "Temporario", label: "Temporário" },
];

// (Dropdown "Regime de Trabalho" removido: duplicava o Tipo de Vínculo e não era persistido.
//  O regime do banco é derivado de tipo_vinculo via VINCULO_TO_REGIME abaixo.)

// Map UI "Tipo de Vínculo" (rótulos da documentação) para enum do banco (dp_regime_trabalho)
const VINCULO_TO_REGIME: Record<string, Regime> = {
  CLT: "clt",
  Socio: "pj",
  Estagiario: "estagio",
  PJ: "pj",
  Autonomo: "pj",
  Temporario: "temporario",
};

const DIAS_SEMANA = [
  { value: "none", label: "Nenhuma" },
  { value: "0", label: "Domingo" },
  { value: "1", label: "Segunda-feira" },
  { value: "2", label: "Terça-feira" },
  { value: "3", label: "Quarta-feira" },
  { value: "4", label: "Quinta-feira" },
  { value: "5", label: "Sexta-feira" },
  { value: "6", label: "Sábado" },
];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  colaborador?: DpColaborador | null;
}

const blank = {
  nome: "",
  cpf: "",
  matricula: "",
  email: "",
  whatsapp: "",
  cargo_id: "",
  unidade_id: "",
  data_admissao: "",
  data_nascimento: "",
  data_desligamento: "",
  tipo_vinculo: "CLT",
  folga_fixa_semana: "none",
  perfil_acesso: "colaborador" as "colaborador" | "gestor" | "admin",
  ativo: true,
  possui_folha_ponto: false,
  optante_adiantamento: false,
};

export function ColaboradorFormDialog({ open, onOpenChange, colaborador }: Props) {
  const upsert = useUpsertDpColaborador();
  const unidades = useDpUnidades();
  const cargos = useDpCargos();
  const [form, setForm] = useState(blank);

  const isEdit = !!colaborador?.id;

  useEffect(() => {
    if (!open) return;
    const c = (colaborador ?? {}) as any;
    setForm({
      nome: c.nome ?? "",
      cpf: c.cpf ? maskCpf(c.cpf) : "",
      matricula: c.matricula ?? "",
      email: c.email ?? "",
      whatsapp: c.whatsapp ?? "",
      cargo_id: c.cargo_id ?? "",
      unidade_id: c.unidade_id ?? "",
      data_admissao: c.data_admissao ?? "",
      data_nascimento: c.data_nascimento ?? "",
      data_desligamento: c.data_desligamento ?? "",
      
      tipo_vinculo: c.tipo_vinculo ?? (c.regime ? String(c.regime).toUpperCase() : "CLT"),
      folga_fixa_semana: c.folga_fixa_semana != null ? String(c.folga_fixa_semana) : "none",
      perfil_acesso: c.perfil_acesso ?? "colaborador",
      ativo: c.ativo ?? true,
      possui_folha_ponto: c.possui_folha_ponto ?? false,
      optante_adiantamento: c.optante_adiantamento ?? false,
    });
  }, [open, colaborador]);

  const unidadeSelecionada = (unidades.data ?? []).find((u) => u.id === form.unidade_id) as any;

  useEffect(() => {
    if (unidadeSelecionada?.tem_adiantamento && !isEdit) {
      setForm((f) => (f.optante_adiantamento ? f : { ...f, optante_adiantamento: true }));
    }
  }, [unidadeSelecionada?.tem_adiantamento, isEdit]);

  const submit = async () => {
    if (!form.nome.trim()) { toast.error("Nome é obrigatório"); return; }
    if (!form.cpf.trim()) { toast.error("CPF é obrigatório"); return; }

    const cpfDigits = form.cpf.replace(/\D/g, "");
    if (cpfDigits.length !== 11) { toast.error("CPF deve ter 11 dígitos"); return; }
    if (!isValidCpf(cpfDigits)) { toast.error("CPF inválido"); return; }

    if (!form.cargo_id) { toast.error("Cargo é obrigatório"); return; }
    if (!form.unidade_id) { toast.error("Unidade é obrigatória"); return; }
    if (!form.data_admissao) { toast.error("Data de admissão é obrigatória"); return; }
    if (!form.data_nascimento) { toast.error("Data de nascimento é obrigatória"); return; }

    // Regras de datas
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const nascimento = new Date(form.data_nascimento + "T00:00:00");
    const admissao = new Date(form.data_admissao + "T00:00:00");

    if (nascimento >= hoje) { toast.error("Data de nascimento deve ser no passado"); return; }

    const idade = (admissao.getTime() - nascimento.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    if (idade < 14) { toast.error("Colaborador deve ter no mínimo 14 anos na admissão"); return; }
    if (idade > 100) { toast.error("Data de nascimento inconsistente com a admissão"); return; }

    if (admissao > hoje) {
      // permite admissão futura até 90 dias
      const diffDias = (admissao.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDias > 90) { toast.error("Data de admissão muito distante no futuro (máx. 90 dias)"); return; }
    }




    // Duplicidade de CPF na empresa
    try {
      const { data: dup } = await (await import("@/integrations/supabase/client")).supabase
        .from("dp_colaboradores")
        .select("id")
        .eq("cpf", cpfDigits)
        .maybeSingle();
      if (dup && dup.id !== colaborador?.id) {
        toast.error("Já existe um colaborador com este CPF nesta empresa");
        return;
      }
    } catch { /* silencioso — o banco tem constraint de reserva */ }

    const cargoNome = (cargos.data ?? []).find((c) => c.id === form.cargo_id)?.nome ?? null;

    try {
      await upsert.mutateAsync({
        id: colaborador?.id,
        nome: form.nome.trim(),
        cpf: form.cpf.replace(/\D/g, "") || null,
        matricula: form.matricula.trim() || null,
        cargo: cargoNome,
        cargo_id: form.cargo_id,
        unidade_id: form.unidade_id,
        regime: VINCULO_TO_REGIME[form.tipo_vinculo] ?? "clt",
        data_admissao: form.data_admissao || null,
        data_nascimento: form.data_nascimento || null,
        data_desligamento: !form.ativo && form.data_desligamento ? form.data_desligamento : null,
        email: form.email.trim() || null,
        whatsapp: form.whatsapp.trim() || null,
        ativo: form.ativo,
        perfil_acesso: form.perfil_acesso,
        folga_fixa_semana: form.folga_fixa_semana !== "none" ? Number(form.folga_fixa_semana) : null,
        possui_folha_ponto: form.possui_folha_ponto,
        optante_adiantamento: form.optante_adiantamento,
      } as any);
      toast.success(isEdit ? "Colaborador atualizado" : "Colaborador cadastrado");
      onOpenChange(false);
    } catch (e) {
      toast.error("Erro ao salvar", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Colaborador" : "Novo Colaborador"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
          {/* Nome */}
          <div className="col-span-2 space-y-2">
            <Label>Nome Completo *</Label>
            <Input
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Ex: João da Silva"
            />
          </div>

          {/* CPF / Matrícula */}
          <div className="space-y-2">
            <Label>CPF *</Label>
            <Input
              value={form.cpf}
              onChange={(e) => setForm({ ...form, cpf: maskCpf(e.target.value) })}
              placeholder="000.000.000-00"
              maxLength={14}
            />
          </div>
          <div className="space-y-2">
            <Label>Matrícula</Label>
            <Input
              value={form.matricula}
              onChange={(e) => setForm({ ...form, matricula: e.target.value })}
              placeholder="Ex: 1234"
            />
          </div>

          {/* Email / WhatsApp */}
          <div className="space-y-2">
            <Label>E-mail</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="email@exemplo.com"
            />
          </div>
          <div className="space-y-2">
            <Label>WhatsApp</Label>
            <Input
              value={form.whatsapp}
              onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
              placeholder="(62) 99999-9999"
            />
          </div>

          {/* Cargo / Unidade */}
          <div className="space-y-2">
            <Label>Cargo *</Label>
            <Select value={form.cargo_id} onValueChange={(v) => setForm({ ...form, cargo_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione o cargo" /></SelectTrigger>
              <SelectContent>
                {(cargos.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Unidade *</Label>
            <Select value={form.unidade_id} onValueChange={(v) => setForm({ ...form, unidade_id: v })}>
              <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
              <SelectContent>
                {(unidades.data ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Datas */}
          <div className="space-y-2">
            <Label>Data de Admissão *</Label>
            <Input
              type="date"
              value={form.data_admissao}
              onChange={(e) => setForm({ ...form, data_admissao: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Data de Nascimento *</Label>
            <Input
              type="date"
              value={form.data_nascimento}
              onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })}
            />
          </div>

          {/* Tipo de Vínculo (o regime do banco é derivado deste campo) */}
          <div className="space-y-2">
            <Label>Tipo de Vínculo</Label>
            <Select
              value={form.tipo_vinculo}
              onValueChange={(v) => setForm({ ...form, tipo_vinculo: v })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPOS_VINCULO.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Folga Fixa / Perfil */}
          <div className="space-y-2">
            <Label>Folga Fixa Semanal</Label>
            <Select
              value={form.folga_fixa_semana}
              onValueChange={(v) => setForm({ ...form, folga_fixa_semana: v })}
            >
              <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
              <SelectContent>
                {DIAS_SEMANA.map((d) => (
                  <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Perfil de Acesso</Label>
            <Select
              value={form.perfil_acesso}
              onValueChange={(v: any) => setForm({ ...form, perfil_acesso: v })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="colaborador">Colaborador</SelectItem>
                <SelectItem value="gestor">Gestor</SelectItem>
                <SelectItem value="admin">Administrador</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Ativo */}
          <div className="col-span-2 flex items-center gap-3 rounded-xl border border-border p-3">
            <Switch
              id="ativo"
              checked={form.ativo}
              onCheckedChange={(v) => setForm({ ...form, ativo: v, data_desligamento: v ? "" : form.data_desligamento })}
            />
            <Label htmlFor="ativo" className="cursor-pointer">Ativo</Label>
          </div>

          {/* Folha de ponto (condicional) */}
          {unidadeSelecionada?.possui_relogio_ponto && (
            <div className="col-span-2 flex items-center gap-3 rounded-xl border border-border p-3">
              <Switch
                id="possui_folha_ponto"
                checked={form.possui_folha_ponto}
                onCheckedChange={(v) => setForm({ ...form, possui_folha_ponto: v })}
              />
              <Label htmlFor="possui_folha_ponto" className="cursor-pointer">Possui Folha de Ponto</Label>
            </div>
          )}

          {/* Adiantamento */}
          <div className="col-span-2 flex items-center gap-3 rounded-xl border border-border p-3">
            <Switch
              id="optante_adiantamento"
              checked={form.optante_adiantamento}
              onCheckedChange={(v) => setForm({ ...form, optante_adiantamento: v })}
            />
            <Label htmlFor="optante_adiantamento" className="cursor-pointer">Opta por Adiantamento Salarial</Label>
            {unidadeSelecionada?.tem_adiantamento && unidadeSelecionada?.dia_adiantamento && (
              <span className="text-xs text-muted-foreground ml-auto">
                Dia do adiantamento: {unidadeSelecionada.dia_adiantamento}
              </span>
            )}
          </div>

          {/* Data de demissão (se inativo) */}
          {!form.ativo && (
            <div className="col-span-2 space-y-2">
              <Label>Data de Demissão</Label>
              <Input
                type="date"
                value={form.data_desligamento}
                onChange={(e) => setForm({ ...form, data_desligamento: e.target.value })}
              />
            </div>
          )}

          {/* Senha Inicial */}
          {!isEdit && (
            <div className="col-span-2 space-y-2">
              <Label>Senha Inicial</Label>
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground font-mono">
                Padrão: 6 últimos dígitos do CPF
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={upsert.isPending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={upsert.isPending}>
            {upsert.isPending ? "Salvando..." : isEdit ? "Atualizar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
